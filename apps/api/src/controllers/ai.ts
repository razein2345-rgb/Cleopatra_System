import type { Request, Response } from 'express';
import { aiChatRequestSchema } from '@cleopatra/shared';
import { AiProviderNotConfiguredError, runAiChat } from '../services/aiAgentService.js';

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
    const result = await runAiChat(req.auth!, input.messages);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AiProviderNotConfiguredError) {
      res.status(503).json({
        success: false,
        error: { message: 'مساعد Cleopatra AI مش متاح دلوقتي — النظام محتاج إعداد إضافي من الإدارة.' },
      });
      return;
    }
    // Never surface a raw provider/network error to the client
    // (CLEOPATRA_AI_SECURITY.md §6 — "never a raw error surfaced to the end user").
    res.status(502).json({
      success: false,
      error: { message: 'تعذر الوصول لمساعد Cleopatra AI دلوقتي، جرّب تاني بعد لحظة.' },
    });
  }
}
