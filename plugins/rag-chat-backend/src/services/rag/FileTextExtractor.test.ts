/** @jest-environment node */
import { extractTextFromUpload } from './FileTextExtractor';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';

jest.mock('pdf-parse');
jest.mock('jszip');

describe('FileTextExtractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Text files', () => {
    it('extracts plain text correctly', async () => {
      const buffer = Buffer.from('  Hello \n\n\n World  \r\n');
      const text = await extractTextFromUpload({
        fileName: 'test.txt',
        buffer,
      });
      expect(text).toBe('Hello\n\nWorld');
    });

    it('extracts markdown correctly', async () => {
      const buffer = Buffer.from('# Header\n\nContent');
      const text = await extractTextFromUpload({
        fileName: 'test.md',
        buffer,
      });
      expect(text).toBe('# Header\n\nContent');
    });
  });

  describe('PDF files', () => {
    it('uses pdf-parse when available', async () => {
      (PDFParse as jest.Mock).mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: 'PDF content' }),
      }));

      const text = await extractTextFromUpload({
        fileName: 'test.pdf',
        buffer: Buffer.from('dummy'),
      });

      expect(text).toBe('PDF content');
      expect(PDFParse).toHaveBeenCalled();
    });

    it('falls back to custom parser if pdf-parse fails', async () => {
      (PDFParse as jest.Mock).mockImplementation(() => {
        throw new Error('Parse error');
      });

      // Construct a minimal dummy PDF string that the fallback regex can catch
      const dummyPdf = `
1 0 obj
stream
BT
/F1 12 Tf
100 100 Td
(Fallback text) Tj
ET
endstream
endobj
`;
      const text = await extractTextFromUpload({
        fileName: 'test.pdf',
        buffer: Buffer.from(dummyPdf),
      });

      expect(text).toBe('Fallback text');
    });
  });

  describe('DOCX files', () => {
    it('extracts text from word xml', async () => {
      const mockZip = {
        files: {
          'word/document.xml': {
            async: jest.fn().mockResolvedValue('<w:p>Hello <w:tab/><w:b>World</w:b></w:p>'),
          },
        },
        file: jest.fn((name) => mockZip.files[name as keyof typeof mockZip.files]),
      };

      (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockZip);

      const text = await extractTextFromUpload({
        fileName: 'test.docx',
        buffer: Buffer.from('dummy'),
      });

      expect(text).toBe('Hello \t World');
    });
  });

  describe('Edge cases', () => {
    it('throws on unsupported types', async () => {
      await expect(
        extractTextFromUpload({
          fileName: 'image.png',
          buffer: Buffer.from('dummy'),
        }),
      ).rejects.toThrow(/Unsupported file type/);
    });
  });
});
