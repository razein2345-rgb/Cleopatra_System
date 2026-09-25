/**
 * What `apiGet/apiPost/...` throw when the server answers `{ success: false, error: {...} }`.
 * It is still an `Error` whose `message` is the server's (Arabic) message, so every existing
 * `catch (err) { err instanceof Error ? err.message : ... }` keeps working unchanged - but the
 * machine-readable `code` and any extra fields the server attached (e.g. the matches of a
 * DUPLICATE_PHONE conflict) are no longer thrown away, so a screen can react to them.
 */
export class ApiRequestError extends Error {
  readonly code: string | undefined;
  /** Every field of the server's `error` object (message and code included). */
  readonly payload: Record<string, unknown>;

  constructor(error: { message: string; code?: string } & Record<string, unknown>) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.payload = error;
  }
}
