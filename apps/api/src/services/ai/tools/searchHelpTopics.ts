import { z } from 'zod';
import { findHelpTopics } from '../helpKnowledge.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Task 14.1 — the read-only lookup half of the "system help" capability
 * (Task 14's audit found the AI has no reliable way to answer "how do I
 * use Cleopatra" questions; `helpKnowledge.ts` is the structured content,
 * this file is the tool that exposes it).
 *
 * Deliberately NOT wired into automatic routing yet (`toolRouting.ts` is
 * untouched by this task) — registering it here only makes it callable;
 * a future task decides when the model should reach for it automatically.
 *
 * Security note: this tool touches zero business data. `findHelpTopics`
 * (helpKnowledge.ts) is a pure, synchronous, in-memory string match over a
 * hand-written constant array — no Prisma import, no database call, no
 * network call, no branch/permission scoping needed because there is
 * nothing here that could differ per caller or per tenant. `requiredPermission:
 * null` mirrors `calculate_price`'s own precedent (a tool that needs
 * nothing beyond being an authenticated staff member).
 */
const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).describe('Free-text question about how the Cleopatra system works, in Arabic or English'),
});

export const searchHelpTopicsTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_help_topics',
  description:
    'Search static, factual "how does Cleopatra work" knowledge (workflows, UI navigation, concepts like work orders/quotations/daily closure) — for questions about HOW THE SYSTEM WORKS, never for live business data (customers, balances, orders, suppliers — use the matching data tool for those instead). Returns a short list of matching topics with their explanation; an empty list means no relevant topic exists — say so plainly rather than guessing an answer.',
  requiredPermission: null,
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text question about how the Cleopatra system works, in Arabic or English' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async execute(input) {
    return findHelpTopics(input.query);
  },
};
