import type { Request, Response } from 'express';
import { aiChatRequestSchema } from '@cleopatra/shared';
import { runAiChat } from '../services/aiAgentService.js';
import { OllamaProviderError } from '../services/ai/providers/ollamaProvider.js';

/**
 * Usable by every logged-in staff member (owner's own answer: "كل
 * الموظفين المسجلين دخول") — gated only by `requireAuth` at the route
 * level, no extra permission of its own. Every tool call inside
 * `runAiChat` is still individually permission-checked against the
 * caller's own real grants, so a narrow-permission user simply gets
 * narrower answers, never broader ones.
 */
export async function postAiChat(req: Request, res: Response) {
  const input = aiChatRequestSchema.parse(req.body);

  try {
    // `input.context` already passed `aiChatRequestSchema.parse()` above —
    // shape-valid (enum/UUID/length), but still untrusted client input: it
    // is only ever rendered as plain text (aiAgentService.ts's
    // `injectContextNote`), never plumbed into a tool call directly, so it
    // cannot bypass `dispatchTool`'s own permission check on whatever the
    // model actually calls.
    const result = await runAiChat(req.auth!, input.messages, input.context);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OllamaProviderError) {
      // Specific enough to be actionable for whoever runs the local Ollama
      // instance, without leaking the raw error/stack trace to the client
      // (CLEOPATRA_AI_SECURITY.md §6 — "never a raw error surfaced to the end user").
      res.status(503).json({
        success: false,
        error: { message: 'مساعد Cleopatra AI مش متاح دلوقتي — تأكد إن Ollama شغال محليًا وجرّب تاني.' },
      });
      return;
    }
    res.status(502).json({
      success: false,
      error: { message: 'تعذر الوصول لمساعد Cleopatra AI دلوقتي، جرّب تاني بعد لحظة.' },
    });
  }
}
