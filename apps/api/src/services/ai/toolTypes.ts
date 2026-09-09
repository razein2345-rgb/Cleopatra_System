import type { z } from 'zod';
import type { AuthenticatedUser } from '../authContext.js';

/**
 * Cleopatra AI — tool definition shape (CLEOPATRA_AI_TOOLS.md, "Tool
 * Definition Shape"). Every tool is a thin wrapper: declared permission,
 * strict Zod input schema, and an `execute` that calls one existing
 * service/controller-query — never new business logic.
 */
export interface AiToolContext {
  auth: AuthenticatedUser;
}

export interface AiToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  /**
   * A normal permission key (checked via `hasPermission`), or `null` when
   * the tool needs nothing beyond being an authenticated staff member
   * (e.g. `calculate_price` — pricing preview isn't permission-gated in
   * the composer UI either, per CLEOPATRA_AI_TOOLS.md).
   */
  requiredPermission: string | null;
  /**
   * Hard-coded SUPER_ADMIN gate, bypassing the normal permission system —
   * for payroll only, mirroring `EmployeeProfilePage.tsx`'s own gate
   * exactly. Never used for anything else.
   */
  requiresSuperAdmin?: boolean;
  // Unconstrained Input/Def params (unlike `z.ZodType<TInput>`) — a schema
  // using `.default()` has a wider *input* type than its parsed *output*
  // type (TInput), which a fully-parametrized ZodType would otherwise
  // reject as a mismatch even though `.safeParse` behaves exactly as
  // expected at runtime.
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  /**
   * Plain JSON Schema handed to the LLM provider so it knows how to call
   * this tool (LlmToolDefinition.inputSchema) — hand-written rather than
   * auto-derived from `inputSchema` to avoid adding a schema-conversion
   * dependency (the dependency-minimalism rule). This is only a calling
   * *hint*: the real security boundary is `inputSchema.safeParse` in the
   * dispatcher, which the model's call must still pass before `execute`
   * ever runs, regardless of what this hints at.
   */
  inputJsonSchema: Record<string, unknown>;
  execute: (input: TInput, ctx: AiToolContext) => Promise<unknown>;
}

/** Type-erased view used by the dispatcher/registry, since a single array must hold every tool regardless of its own input type. */
export type AnyAiToolDefinition = AiToolDefinition<unknown>;
