import { z } from 'zod';

/**
 * Cleopatra AI — Phase 1 (docs/AI/CLEOPATRA_AI_IMPLEMENTATION_PLAN.md).
 * Deliberately migration-free: conversation state is never persisted
 * server-side — the frontend resends the recent turns on every call, and
 * this schema is the entire request/response contract for `/api/ai/chat`.
 */

export const aiChatRoleSchema = z.enum(['user', 'assistant']);

export const aiChatTurnSchema = z.object({
  role: aiChatRoleSchema,
  text: z.string().min(1).max(8000),
});

export const aiChatRequestSchema = z.object({
  // Capped so one runaway conversation can't balloon a single request —
  // the frontend only ever needs recent context, not the entire history.
  messages: z.array(aiChatTurnSchema).min(1).max(40),
});

/**
 * `toolsUsed` is surfaced to the UI (§ "show tool-driven answers clearly")
 * as plain tool names only — never raw tool input/output, which may
 * contain data the same permission check already gated on a per-field
 * basis (e.g. `inventory.costPrice`). The chat text itself is Claude's own
 * already-permission-filtered summary.
 */
export const aiChatResponseSchema = z.object({
  reply: z.string(),
  toolsUsed: z.array(z.string()),
});

export type AiChatRole = z.infer<typeof aiChatRoleSchema>;
export type AiChatTurn = z.infer<typeof aiChatTurnSchema>;
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;
