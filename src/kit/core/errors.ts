// Errors the core understands (part-interface.md section 4).
import type { PartError as PartErrorShape, PartErrorCode } from '../part-interface';

/** Retried once by the core, as attempt 2 with a new idempotency key. */
export const RETRYABLE: ReadonlySet<PartErrorCode> = new Set(['provider_failed', 'tool_failed', 'timeout']);

const CODES: ReadonlySet<string> = new Set([
  'bad_input', 'provider_rejected', 'provider_failed', 'over_quote', 'stopped', 'timeout', 'tool_failed', 'output_invalid', 'needs_missing',
]);

export class PartError extends Error implements PartErrorShape {
  readonly retryable: boolean;
  constructor(readonly code: PartErrorCode, readonly detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PartError';
    this.retryable = RETRYABLE.has(code);
  }
}

/** A part's thrown value as a PartError; anything else a part throws is a tool failure. */
export function asPartError(error: unknown): PartError {
  if (error instanceof PartError) return error;
  const code = (error as { code?: unknown })?.code;
  const detail = error instanceof Error ? error.message : String(error);
  if (typeof code === 'string' && CODES.has(code)) return new PartError(code as PartErrorCode, (error as { detail?: string }).detail ?? detail);
  return new PartError('tool_failed', detail);
}

/**
 * The run ends here: the line said stop, a check refused the video, or the
 * computer can't make it. `message` is plain words for the person (the line's
 * own message and fix when the line said it). The run is saved first.
 */
export class KitStop extends Error {
  constructor(
    message: string,
    readonly reason: 'stop' | 'update_kit' | 'change_request' | 'refused' | 'failed' = 'stop',
    readonly code?: string,
  ) {
    super(message);
    this.name = 'KitStop';
  }
}
