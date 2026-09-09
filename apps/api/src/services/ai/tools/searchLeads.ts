import { z } from 'zod';
import { listLeads } from '../../leadService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
});

export const searchLeadsTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_leads',
  description: 'Search Leads (not-yet-converted prospects) by name or phone.',
  requiredPermission: 'leads.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Free-text match on name or phone' } },
    additionalProperties: false,
  },
  async execute(input) {
    const leads = await listLeads();
    const q = input.query?.toLowerCase().trim();
    const filtered = q
      ? leads.filter((l) => l.name.toLowerCase().includes(q) || l.phone.toLowerCase().includes(q))
      : leads;
    return filtered.slice(0, 20);
  },
};
