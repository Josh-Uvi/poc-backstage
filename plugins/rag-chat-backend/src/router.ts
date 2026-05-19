import crypto from 'node:crypto';
import { HttpAuthService, PermissionsService, AuditorService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError, NotAllowedError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { IConversationService } from './services/ConversationService';
import { IUserCredentialsService } from './services/UserCredentialsService';
import { ILlmService } from './services/llm/LlmService';
import {
  IRagService,
  RetrievedContext,
  RuntimeEmbeddingConfig,
} from './services/rag/RagService';
import multer from 'multer';
import { extractTextFromUpload } from './services/rag/FileTextExtractor';
import { ragChatChatPermission, ragChatAdminPermission } from './permissions';

const providerSchema = z.enum(['openai', 'anthropic', 'google', 'custom']);

const runtimeModelSchema = z.object({
  provider: providerSchema.optional(),
  apiToken: z.string().optional(),
  apiBaseUrl: z.string().optional(),
});

const runtimeEmbeddingSchema = z.object({
  provider: providerSchema.optional(),
  apiToken: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  model: z.string().optional(),
});

const chatSchema = z.object({
  message: z.string().min(1),
  modelId: z.string().min(1),
  sourceIds: z.array(z.string()).optional().default([]),
  conversationId: z.string().optional(),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  systemPrompt: z.string().optional(),
  runtimeModel: runtimeModelSchema.optional(),
  runtimeEmbedding: runtimeEmbeddingSchema.optional(),
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
  userCredentials,
  llm,
  rag,
  rateLimitPerMinute,
  auditor,
}: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  permissionsEnabled: boolean;
  conversations: IConversationService;
  userCredentials: IUserCredentialsService;
  llm: ILlmService;
  rag: IRagService;
  rateLimitPerMinute?: number;
  auditor?: AuditorService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // ── Per-user in-memory rate limiter (sliding-window) ────────────────────────
  const rateLimitMap = new Map<string, number[]>();

  const checkRateLimit = (userRef: string) => {
    if (!rateLimitPerMinute) return; // disabled
    const now = Date.now();
    const windowMs = 60_000;
    const timestamps = (rateLimitMap.get(userRef) ?? []).filter(
      t => now - t < windowMs,
    );
    if (timestamps.length >= rateLimitPerMinute) {
      throw new NotAllowedError(
        `Rate limit exceeded: max ${rateLimitPerMinute} requests per minute`,
      );
    }
    timestamps.push(now);
    rateLimitMap.set(userRef, timestamps);
  };

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

  const parseRuntimeEmbedding = (
    value: unknown,
  ): RuntimeEmbeddingConfig | undefined => {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch (error) {
      throw new InputError(`Invalid runtimeEmbedding JSON: ${error}`);
    }

    const parsed = runtimeEmbeddingSchema.safeParse(parsedValue);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    return parsed.data as RuntimeEmbeddingConfig;
  };

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
    const runtimeEmbedding = parseRuntimeEmbedding(req.body?.runtimeEmbedding);
    const modelId = runtimeEmbedding?.model ?? 'default';

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

    const documentOptions = {
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
    };

    const storedCredentials = await userCredentials.getCredentials(userRef, modelId);
    const effectiveEmbedding = runtimeEmbedding || storedCredentials;

    if (effectiveEmbedding) {
      await rag.indexDocument(documentOptions, effectiveEmbedding as any);
    } else {
      await rag.indexDocument(documentOptions);
    }

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

    // Rate limit check
    try {
      checkRateLimit(userRef);
    } catch (e: any) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
      return;
    }

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const {
      message,
      modelId,
      sourceIds,
      conversationId,
      temperature,
      systemPrompt,
      runtimeModel,
      runtimeEmbedding,
    } = parsed.data;

    const storedModelCreds = await userCredentials.getCredentials(userRef, modelId);
    const effectiveModel = runtimeModel || storedModelCreds;

    const storedEmbeddingCreds = await userCredentials.getCredentials(userRef, 'default');
    const effectiveEmbedding = runtimeEmbedding || storedEmbeddingCreds;

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
      if (effectiveEmbedding) {
        await rag.indexSource(sourceId, credentials, effectiveEmbedding as any);
      } else {
        await rag.indexSource(sourceId, credentials);
      }
    }

    // Retrieve relevant context chunks
    let contextChunks: RetrievedContext[] = [];
    if (retrievalSourceIds.length) {
      contextChunks = effectiveEmbedding
        ? await rag.retrieve(message, retrievalSourceIds, 3, effectiveEmbedding as any)
        : await rag.retrieve(message, retrievalSourceIds, 3);
    }

    // Build LLM message history with system instructions at the top
    const llmMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [];

    const basePersona = systemPrompt?.trim() || 
      'You are a helpful Backstage assistant. Your goal is to help users navigate their developer portal and understand their software ecosystem.';

    if (contextChunks.length) {
      const contextText = contextChunks
        .map((c, i) => `[${i + 1}] (${c.metadata.ref ?? c.metadata.title ?? c.metadata.sourceId})\n${c.text}`)
        .join('\n\n');
      llmMessages.push({
        role: 'system',
        content:
          `${basePersona}\n\n` +
          `Retrieved Context:\n${contextText}\n\n` +
          `Instructions:\n` +
          `1. For specific technical questions about software components, documentation, or infrastructure, prioritize using the retrieved context above.\n` +
          `2. If the user is greeting you, asking about your capabilities, or making general inquiries that the context doesn't cover, answer professionally using your internal knowledge about being a Backstage assistant.\n` +
          `3. When using the context, provide citations in the format [1], [2], etc.\n` +
          `4. Do NOT use citations if you are answering from general knowledge (e.g., greetings or capability overviews).\n` +
          `5. Do not repeat conversation history or start with phrases like "Based on the context".\n` +
          `6. If the question is highly specific and neither the context nor your knowledge can answer it, explain what information is missing.`,
      });
    } else if (retrievalSourceIds.length) {
      llmMessages.push({
        role: 'system',
        content:
          `${basePersona}\n\n` +
          `Answer using knowledge from these sources: ${retrievalSourceIds.join(', ')}.\n` +
          `Do not repeat previous parts of the conversation in your answer.`,
      });
    } else {
      llmMessages.push({
        role: 'system',
        content: systemPrompt?.trim() 
          ? systemPrompt.trim()
          : `You are a helpful Backstage assistant. Provide direct and concise answers. Do not repeat conversation history.`,
      });
    }

    // Append chat history
    llmMessages.push(...existingConv.messages.map(m => ({ role: m.role, content: m.content })));
    
    // Append current user message
    llmMessages.push({ role: 'user', content: message });

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: object) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);

    const assistantMessageId = `msg_${Date.now()}_assistant`;
    let fullContent = '';
    let usage: any = undefined;

    try {
      const stream = effectiveModel
        ? llm.stream(modelId, { messages: llmMessages, temperature }, effectiveModel as any)
        : llm.stream(modelId, { messages: llmMessages, temperature });

      for await (const event of stream) {
        if (event.type === 'token') {
          fullContent += event.token;
          sendEvent({ type: 'token', token: event.token });
        } else if (event.type === 'usage') {
          usage = event.usage;
        }
      }

      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: fullContent,
        timestamp: new Date().toISOString(),
        usage,
      };

      await conversations.upsertConversation(
        {
          id: convId,
          title: existingConv.title,
          messages: [...existingConv.messages, userMessage, assistantMessage],
        },
        userRef,
      );

      const isGeneralChat = message.trim().length < 100 && 
        /^(hi|hello|hey|howdy|hola|greetings|what's up|how are you|what can you do|who are you|thanks|thank you|bye|goodbye|what can you help|help me)/i.test(message.trim());

      sendEvent({
        type: 'done',
        conversationId: convId,
        messageId: assistantMessageId,
        citations: isGeneralChat ? [] : contextChunks,
        usage,
      });

      await auditor?.createEvent({
        eventId: 'rag-chat.chat',
        severityLevel: 'low',
        request: req as any,
        meta: {
          userRef,
          modelId,
          sourceIds,
          conversationId: convId,
          status: 'success',
          usage,
        },
      }).catch(() => { /* best-effort */ });
    } catch (e: any) {
      sendEvent({ type: 'error', error: e?.message ?? 'Unknown error' });

      await auditor?.createEvent({
        eventId: 'rag-chat.chat',
        severityLevel: 'medium',
        request: req as any,
        meta: {
          userRef,
          modelId,
          conversationId,
          status: 'error',
          error: e?.message,
        },
      }).catch(() => { /* best-effort */ });
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
   * POST /credentials
   * Saves user-specific API tokens for a model.
   */
  router.post('/credentials', async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;

    const { modelId, apiToken, apiBaseUrl } = req.body;
    if (!modelId || !apiToken) {
      throw new InputError('modelId and apiToken are required');
    }

    await userCredentials.saveCredentials(userRef, modelId, {
      apiToken,
      apiBaseUrl,
    });

    res.status(204).send();
  });

  /**
   * POST /feedback
   * Saves user feedback for an assistant message.
   */
  router.post('/feedback', async (req, res) => {
    const credentials = await requirePermission(req, ragChatChatPermission);
    const userRef = credentials.principal.userEntityRef;

    const parsed = z
      .object({
        conversationId: z.string(),
        messageId: z.string(),
        feedback: z.enum(['positive', 'negative']).nullable(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    await conversations.updateMessageFeedback(
      parsed.data.conversationId,
      parsed.data.messageId,
      parsed.data.feedback,
      userRef,
    );

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
