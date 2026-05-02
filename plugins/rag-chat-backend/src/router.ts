import { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { z } from 'zod/v3';
import express from 'express';
import Router from 'express-promise-router';
import { IConversationService } from './services/ConversationService';
import { ILlmService } from './services/llm/LlmService';
import { IRagService } from './services/rag/RagService';

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
  conversations,
  llm,
  rag,
}: {
  httpAuth: HttpAuthService;
  conversations: IConversationService;
  llm: ILlmService;
  rag: IRagService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  /**
   * POST /chat
   * Accepts { message, modelId, sourceIds, conversationId, temperature }
   * Returns a single assistant response (streaming can be added later).
   */
  router.post('/chat', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const { message, modelId, sourceIds, conversationId, temperature } =
      parsed.data;

    // Resolve or create the conversation
    let convId = conversationId;
    if (!convId) {
      const newConv = await conversations.upsertConversation(
        { title: message.slice(0, 40) + (message.length > 40 ? '…' : '') },
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

    const userMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    // Index requested sources (lazy — only indexes if not yet populated)
    for (const sourceId of sourceIds) {
      await rag.indexSource(sourceId, credentials);
    }

    // Retrieve relevant context chunks
    const contextChunks = sourceIds.length
      ? await rag.retrieve(message, sourceIds, 5)
      : [];

    // Build message history for the LLM
    const llmMessages = [
      ...existingConv.messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // Prepend retrieved context as a system message
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
    } else if (sourceIds.length) {
      llmMessages.unshift({
        role: 'assistant' as const,
        content: `You are a helpful Backstage assistant. Answer using knowledge from: ${sourceIds.join(', ')}.`,
      });
    }

    const llmResponse = await llm.chat(modelId, {
      messages: llmMessages,
      temperature,
    });

    const assistantMessage = {
      id: `msg_${Date.now()}_assistant`,
      role: 'assistant' as const,
      content: llmResponse.content,
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

    res.json({ conversationId: convId, message: assistantMessage });
  });

  /**
   * GET /conversations
   * Returns all conversations for the authenticated user.
   */
  router.get('/conversations', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;
    const items = await conversations.listConversations(userRef);
    res.json({ items });
  });

  /**
   * POST /conversations
   * Creates or updates a conversation for the authenticated user.
   */
  router.post('/conversations', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
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
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const userRef = credentials.principal.userEntityRef;
    await conversations.deleteConversation(req.params.id, userRef);
    res.status(204).send();
  });

  return router;
}
