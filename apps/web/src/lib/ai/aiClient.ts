import type { AiChatRequest, AiChatResponse } from '@cleopatra/shared';
import { apiPost } from '@/lib/api';

/** Thin client for `POST /api/ai/chat` (Cleopatra AI Phase 1) — no conversation persistence, the caller resends recent turns every call. */
export function sendAiChatMessage(request: AiChatRequest): Promise<AiChatResponse> {
  return apiPost<AiChatResponse>('/api/ai/chat', request);
}
