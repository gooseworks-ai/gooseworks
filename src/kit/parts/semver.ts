// Exact versions and kit ranges for parts (part-interface.md sections 2 and 6).
// A part version is exact semver with no prerelease; a kit range has one of
// two forms: ">=1.0.0" or ">=1.0.0 <2.0.0". Anything else never matches.

const EXACT = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const RANGE = /^>=(\S+)(?: <(\S+))?$/;

export function isExactVersion(value: unknown): value is string {
  return typeof value === 'string' && EXACT.test(value);
}

function triple(value: string): [number, number, number] {
  const match = EXACT.exec(value);
  if (!match) throw new Error(`Not an exact version: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const x = triple(a);
  const y = triple(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Whether `version` (exact) is inside `range`. A range in any other form never matches. */
export function satisfiesKitRange(version: string, range: unknown): boolean {
  if (typeof range !== 'string' || !isExactVersion(version)) return false;
  const match = RANGE.exec(range);
  if (!match || !isExactVersion(match[1])) return false;
  if (compareVersions(version, match[1]) < 0) return false;
  if (match[2] === undefined) return true;
  if (!isExactVersion(match[2]) || compareVersions(match[1], match[2]) >= 0) return false;
  return compareVersions(version, match[2]) < 0;
}
