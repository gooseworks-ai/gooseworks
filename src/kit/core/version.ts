// The kit's own version and the part interfaces it runs (MV-37).
//
// Semver for the kit: a patch fixes the core without changing what a part
// sees; a minor adds to the part context or the line client; a major removes
// or changes something a published part relies on. Parts say which kits can
// run them (`kit` in part.json and in the video's lock), and the core refuses
// a part whose range leaves this kit out before anything is spent. Versions
// and ranges are read by one implementation, src/kit/parts/semver.ts.
import { satisfiesKitRange } from '../parts/semver';

/** The kit core's version. Bump it with every kit change, by the rule above. */
export const KIT_VERSION = '1.0.0';

/** Part interface versions this kit runs (part-interface.md section 2). */
export const KIT_INTERFACES: readonly number[] = [1];

export { compareVersions, isExactVersion, satisfiesKitRange } from '../parts/semver';

/** Why this kit cannot run a part's interface, or null when it can. */
export function interfaceRefusal(part: { id: string; version: string; interface?: number }): string | null {
  if (part.interface !== undefined && KIT_INTERFACES.includes(part.interface)) return null;
  return `Part ${part.id} ${part.version} needs part interface ${part.interface}; this kit runs ${KIT_INTERFACES.join(', ')}.`;
}

/** Why this kit cannot run a part with this kit range, or null when it can. */
export function kitRangeRefusal(part: { id: string; version: string; kit: string }, kitVersion = KIT_VERSION): string | null {
  return satisfiesKitRange(kitVersion, part.kit) ? null : `Part ${part.id} ${part.version} runs on kit ${part.kit}; this kit is ${kitVersion}.`;
}
