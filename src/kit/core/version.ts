// The kit's own version and the part interfaces it runs (MV-37).
//
// Semver for the kit: a patch fixes the core without changing what a part
// sees; a minor adds to the part context or the line client; a major removes
// or changes something a published part relies on. Parts say which kits can
// run them (`kit` in part.json and in the video's lock), and the core refuses
// a part whose range leaves this kit out before anything is spent.

/** The kit core's version. Bump it with every kit change, by the rule above. */
export const KIT_VERSION = '1.0.0';

/** Part interface versions this kit runs (part-interface.md section 2). */
export const KIT_INTERFACES: readonly number[] = [1];

type Triple = [number, number, number];

const EXACT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** The only two range forms a part may use: ">=1.0.0" or ">=1.0.0 <2.0.0". */
const RANGE = /^>=(\S+)(?: <(\S+))?$/;

export function parseSemver(value: string): Triple | null {
  const match = EXACT.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Negative when a < b, 0 when equal, positive when a > b. Throws on a version that is not exact semver. */
export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) throw new Error(`Not an exact version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Whether `version` falls inside a kit range. A range in any other form never matches. */
export function satisfiesKitRange(version: string, range: string): boolean {
  const match = RANGE.exec(range.trim());
  if (!match || !parseSemver(version) || !parseSemver(match[1])) return false;
  if (compareSemver(version, match[1]) < 0) return false;
  if (match[2] === undefined) return true;
  if (!parseSemver(match[2])) return false;
  return compareSemver(version, match[2]) < 0;
}

/**
 * Why this kit cannot run a part, or null when it can: the part's interface
 * must be one this kit runs and its kit range must include this kit.
 */
export function kitRefusal(part: { id: string; version: string; interface?: number; kit: string }, kitVersion = KIT_VERSION): string | null {
  if (part.interface !== undefined && !KIT_INTERFACES.includes(part.interface)) {
    return `Part ${part.id} ${part.version} needs part interface ${part.interface}; this kit runs ${KIT_INTERFACES.join(', ')}.`;
  }
  if (!satisfiesKitRange(kitVersion, part.kit)) {
    return `Part ${part.id} ${part.version} runs on kit ${part.kit}; this kit is ${kitVersion}.`;
  }
  return null;
}
