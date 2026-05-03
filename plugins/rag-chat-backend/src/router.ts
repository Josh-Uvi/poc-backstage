import crypto from 'node:crypto';
import { HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError, NotAllowedError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { IConversationService } from './services/ConversationService';
import { ILlmService } from './services/llm/LlmService';
import { IRagService } from './services/rag/RagService';
import multer from 'multer';
import { extractTextFromUpload } from './services/rag/FileTextExtractor';
import { ragChatChatPermission, ragChatAdminPermission } from './permissions';

const chatSchema = z.object({
  message: z.string().min(1),
  modelId: z.string().min(1),
  sourceIds: z.array(z.string()).optional().default([]),
  conversationId: z.string().optional(),
  temperature: z.number().min(0).max(1).optional().default(0.7),
});

const upsertConversationSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string(),
      }),
    )
    .optional(),
});

export async function createRouter({
  httpAuth,
  permissions,
  permissionsEnabled,
  conversations,
  llm,
  rag,
}: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  permissionsEnabled: boolean;
  conversations: IConversationService;
  llm: ILlmService;
  rag: IRagService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // ── Permission helpers ──────────────────────────────────────────────────────

  const requirePermission = async (
    req: express.Request,
    permission: typeof ragChatChatPermission | typeof ragChatAdminPermission,
  ) => {
    const credentials = await httpAuth.credentials(req as any, { allow: ['user'] });
    if (!permissionsEnabled) return credentials;
    const [result] = await permissions.authorize(
      [{ permission }],
      { credentials },
    );
    if (result.result !== AuthorizeResult.ALLOW) {
      throw new NotAllowedError(`Permission '${permission.name}' denied`);
    }
    return credentials;
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  const uploadSingle: express.RequestHandler = upload.single('file') as
    unknown as express.RequestHandler;

  const resolveConversation = async (
    userRef: string,
    conversationId: string | undefined,
    fallbackTitle: string,
  ) => {
    let convId = conversationId;
    if (!convId) {
      const newConv = await conversations.upsertConversation(
        { title: fallbackTitle },
        userRef,
      );
      convId = newConv.id;
    }

    const existingConv = (await conversations.listConversations(userRef)).find(
      c => c.id === convId,
    );
    if (!existingConv) {
      throw new NotFoundError(`Conversation '${convId}' not found`);
    }

    return existingConv;
  };

  /**
   * POST /upload
   * Accepts multipart form-data with fields:
   *   - file: TXT, PDF, or DOCX file
   *   - conversationId: target conversation
   */
  router.post('/upload', uploadSingle, async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;

    const conversationId = typeof req.body?.conversationId === 'string'
      ? req.body.conversationId
      : undefined;

    if (!conversationId) {
      throw new InputError('conversationId is required');
    }

    if (!req.file) {
      throw new InputError('file is required');
    }

    await resolveConversation(userRef, conversationId, 'New Conversation');

    const documentText = await extractTextFromUpload({
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    if (!documentText.trim()) {
      throw new InputError(`No extractable text found in '${req.file.originalname}'`);
    }

    const uploadId = crypto.randomUUID();
    const sourceId = `upload:${conversationId}:${uploadId}`;

    await rag.indexDocument({
      sourceId,
      documentText,
      metadata: {
        sourceId,
        conversationId,
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        ref: `upload:${req.file.originalname}`,
        title: req.file.originalname,
      },
    });

    const source = await conversations.addConversationSource(
      {
        id: uploadId,
        conversationId,
        sourceId,
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
      },
      userRef,
    );

    res.status(201).json({ source });
  });

  /**
   * POST /chat
   * Accepts { message, modelId, sourceIds, conversationId, temperature }
   * Streams the assistant response as SSE events:
   *   data: {"type":"token","token":"..."}
   *   data: {"type":"done","conversationId":"...","messageId":"..."}
   *   data: {"type":"error","error":"..."}
   */
  router.post('/chat', async (req, res) => {
    let credentials;
    try {
      credentials = await requirePermission(req, ragChatChatPermission);
    } catch (e: any) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
      return;
    }
    const userRef = credentials.principal.userEntityRef;

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { message, modelId, sourceIds, conversationId, temperature } = parsed.data;

    const existingConv = await resolveConversation(
      userRef,
      conversationId,
      message.slice(0, 40) + (message.length > 40 ? '\u2026' : ''),
    );
    const convId = existingConv.id;

    const userMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    const uploadedSources = await conversations.listConversationSources(convId, userRef);
    const uploadedSourceIds = uploadedSources.map(source => source.sourceId);
    const retrievalSourceIds = [...new Set([...sourceIds, ...uploadedSourceIds])];

    // Index requested configured sources (lazy)
    for (const sourceId of sourceIds) {
      await rag.indexSource(sourceId, credentials);
    }

    // Retrieve relevant context chunks
    const contextChunks = retrievalSourceIds.length
      ? await rag.retrieve(message, retrievalSourceIds, 5)
      : [];

    // Build LLM message history
    const llmMessages = [
      ...existingConv.messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    if (contextChunks.length) {
      const contextText = contextChunks
        .map((c, i) => `[${i + 1}] (${c.metadata.ref ?? c.metadata.title ?? c.metadata.sourceId})\n${c.text}`)
        .join('\n\n');
      llmMessages.unshift({
        role: 'assistant' as const,
        content:
          `You are a helpful Backstage assistant. Use the following context to answer the user's question.\n\n` +
          `Context:\n${contextText}\n\n` +
          `If the context does not contain enough information, say so clearly.`,
      });
    } else if (retrievalSourceIds.length) {
      llmMessages.unshift({
        role: 'assistant' as const,
        content:
          `You are a helpful Backstage assistant. Answer using knowledge from: ${retrievalSourceIds.join(', ')}.`,
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: object) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);

    const assistantMessageId = `msg_${Date.now()}_assistant`;
    let fullContent = '';

    try {
      for await (const token of llm.stream(modelId, { messages: llmMessages, temperature })) {
        fullContent += token;
        sendEvent({ type: 'token', token });
      }

      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: fullContent,
        timestamp: new Date().toISOString(),
      };

      await conversations.upsertConversation(
        {
          id: convId,
          title: existingConv.title,
          messages: [...existingConv.messages, userMessage, assistantMessage],
        },
        userRef,
      );

      sendEvent({ type: 'done', conversationId: convId, messageId: assistantMessageId });
    } catch (e: any) {
      sendEvent({ type: 'error', error: e?.message ?? 'Unknown error' });
    } finally {
      res.end();
    }
  });

  /**
   * GET /conversations
   * Returns all conversations for the authenticated user.
   */
  router.get('/conversations', async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;
    const items = await conversations.listConversations(userRef);
    res.json({ items });
  });

  /**
   * POST /conversations
   * Creates or updates a conversation for the authenticated user.
   */
  router.post('/conversations', async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;

    const parsed = upsertConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const conversation = await conversations.upsertConversation(
      parsed.data,
      userRef,
    );

    res.status(parsed.data.id ? 200 : 201).json(conversation);
  });

  /**
   * DELETE /conversations/:id
   * Deletes a conversation owned by the authenticated user.
   */
  router.delete('/conversations/:id', async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;
    await conversations.deleteConversation(req.params.id, userRef);
    res.status(204).send();
  });

  /**
   * GET /admin/config
   * Returns the server-side ragChat config (models without tokens, sources).
   * Gated behind ragChatAdminPermission.
   */
  router.get('/admin/config', async (req, res) => {
    await requirePermission(req, ragChatAdminPermission);
    // Return safe config — never expose apiTokens
    const models = (rag as any).getConfigModels?.() ?? [];
    res.json({ models, sources: [] });
  });

  return router;
}
