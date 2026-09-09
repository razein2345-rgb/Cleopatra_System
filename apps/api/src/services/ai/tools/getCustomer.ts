import { z } from 'zod';
import { getBusinessPartnerDto } from '../../businessPartnerService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  id: z.string().uuid(),
});

export const getCustomerTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_customer',
  description: 'Get full details for one business partner (customer) by id.',
  requiredPermission: 'partners.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
    additionalProperties: false,
  },
  async execute(input) {
    const partner = await getBusinessPartnerDto(input.id);
    if (!partner) return { found: false };
    return { found: true, partner };
  },
};
