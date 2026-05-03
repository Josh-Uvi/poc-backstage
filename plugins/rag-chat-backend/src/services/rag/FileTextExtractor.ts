import zlib from 'node:zlib';
import JSZip from 'jszip';

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\u0000').join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function decodePdfString(value: string): string {
  let output = '';

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') {
      output += char;
      continue;
    }

    const next = value[++i];
    if (!next) break;

    switch (next) {
      case 'n':
        output += '\n';
        break;
      case 'r':
        output += '\r';
        break;
      case 't':
        output += '\t';
        break;
      case 'b':
        output += '\b';
        break;
      case 'f':
        output += '\f';
        break;
      case '(':
      case ')':
      case '\\':
        output += next;
        break;
      case '\n':
      case '\r':
        break;
      default: {
        if (/[0-7]/.test(next)) {
          let octal = next;
          while (octal.length < 3 && /[0-7]/.test(value[i + 1] ?? '')) {
            octal += value[++i];
          }
          output += String.fromCharCode(parseInt(octal, 8));
        } else {
          output += next;
        }
      }
    }
  }

  return output;
}

function extractPdfOperators(content: string): string {
  const lines: string[] = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [content];

  for (const block of blocks) {
    const fragments: string[] = [];

    const arrayRegex = /\[((?:\\.|[^\]])*?)\]\s*TJ/g;
    for (const match of block.matchAll(arrayRegex)) {
      const arrayContent = match[1] ?? '';
      const parts = [...arrayContent.matchAll(/\(((?:\\.|[^\\)])*)\)/g)]
        .map(part => decodePdfString(part[1] ?? ''))
        .filter(Boolean);
      if (parts.length) {
        fragments.push(parts.join(' '));
      }
    }

    const stringRegex = /\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
    for (const match of block.matchAll(stringRegex)) {
      const text = decodePdfString(match[1] ?? '');
      if (text) {
        fragments.push(text);
      }
    }

    const line = fragments.join(' ').trim();
    if (line) {
      lines.push(line);
    }
  }

  return normaliseWhitespace(lines.join('\n'));
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files).filter(name =>
    /^word\/(document|header\d+|footer\d+)\.xml$/.test(name),
  );

  const xmlParts = await Promise.all(
    fileNames.map(async fileName => zip.file(fileName)?.async('string') ?? ''),
  );

  const text = xmlParts
    .map(xml =>
      xml
        .replace(/<w:tab\/?\s*>/g, '\t')
        .replace(/<w:br\/?\s*>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<[^>]+>/g, ' '),
    )
    .map(decodeXmlEntities)
    .join('\n');

  return normaliseWhitespace(text);
}

function extractPdfText(buffer: Buffer): string {
  const pdf = buffer.toString('latin1');
  const streamRegex = /(?:\d+\s+\d+\s+obj[\s\S]*?)?stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const fragments: string[] = [];

  for (const match of pdf.matchAll(streamRegex)) {
    const streamBody = match[1] ?? '';
    const objectBody = match[0] ?? '';
    let streamBuffer = Buffer.from(streamBody, 'latin1');

    if (/\/FlateDecode\b/.test(objectBody)) {
      try {
        streamBuffer = zlib.inflateSync(streamBuffer);
      } catch {
        try {
          streamBuffer = zlib.inflateRawSync(streamBuffer);
        } catch {
          // fall back to raw stream contents
        }
      }
    }

    const text = extractPdfOperators(streamBuffer.toString('latin1'));
    if (text) {
      fragments.push(text);
    }
  }

  const extracted = normaliseWhitespace(fragments.join('\n'));
  if (extracted) {
    return extracted;
  }

  const plainTextMatches = pdf.match(/[A-Za-z0-9][A-Za-z0-9 ,.:'"()\-_/]{20,}/g) ?? [];
  return normaliseWhitespace(plainTextMatches.join('\n'));
}

export async function extractTextFromUpload(options: {
  fileName: string;
  contentType?: string;
  buffer: Buffer;
}): Promise<string> {
  const { fileName, contentType, buffer } = options;
  const lowerName = fileName.toLowerCase();
  const type = contentType?.toLowerCase() ?? '';

  if (
    type.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown')
  ) {
    return normaliseWhitespace(buffer.toString('utf-8'));
  }

  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx')
  ) {
    return extractDocxText(buffer);
  }

  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return extractPdfText(buffer);
  }

  throw new Error(`Unsupported file type for '${fileName}'`);
}