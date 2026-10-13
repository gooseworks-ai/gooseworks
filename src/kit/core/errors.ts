// Errors the core understands (part-interface.md section 4).
import type { PartError as PartErrorShape, PartErrorCode } from '../part-interface';

/** Retried once by the core, as attempt 2 with a new idempotency key. */
export const RETRYABLE: ReadonlySet<PartErrorCode> = new Set(['provider_failed', 'tool_failed', 'timeout']);

const CODES: ReadonlySet<string> = new Set([
  'bad_input', 'provider_rejected', 'provider_failed', 'over_quote', 'stopped', 'timeout', 'tool_failed', 'output_invalid', 'needs_missing',
]);

export class PartError extends Error implements PartErrorShape {
  readonly retryable: boolean;
  /**
   * True when `detail` is the part's own words (its `ctx.error` or a thrown `{ code }`): parts write
   * `bad_input` and `output_invalid` details for the person. The core's own details are log words.
   */
  constructor(readonly code: PartErrorCode, readonly detail?: string, readonly fromPart = false) {
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
  if (typeof code === 'string' && CODES.has(code)) return new PartError(code as PartErrorCode, (error as { detail?: string }).detail ?? detail, true);
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
    /**
     * The next step the result must keep: `sign_in` (exit code 6), or `retry` for a failure whose code
     * reads as the plan's but that the same command gets past (exit code 4).
     */
    readonly next?: 'sign_in' | 'retry',
  ) {
    super(message);
    this.name = 'KitStop';
  }
}

/** The run's stop on the line's refusal, by its next step; a sign-in is kept for the result. */
export function lineStop(message: string, next: string | undefined, code?: string): KitStop {
  const reason = next === 'update_kit' ? 'update_kit' : next === 'change_request' ? 'change_request' : 'stop';
  return new KitStop(message, reason, code, next === 'sign_in' ? 'sign_in' : undefined);
}
