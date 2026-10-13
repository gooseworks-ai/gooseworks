// What the video's lock runs for a step the style pins: our server may have moved a part to a newer
// published version since (gooseworks-app parts-lock.service.ts patchLockedParts), and records the
// version it moved from. The moved version is still checked file by file against the lock.
import type { PartRef, PartsLock } from '../part-interface';
import { compareVersions, isExactVersion } from '../parts/semver';

/** The pinned part, or the newer version of its major the lock moved it to. */
export function lockedRef(pin: PartRef, lock: PartsLock | null): PartRef {
  const entry = lock?.parts?.[pin.id];
  if (!entry || entry.version === pin.version || entry.moved_from !== pin.version) return pin;
  const moved = isExactVersion(entry.version) && isExactVersion(pin.version) && entry.version.split('.')[0] === pin.version.split('.')[0] && compareVersions(entry.version, pin.version) > 0;
  return moved ? { id: pin.id, version: entry.version } : pin;
}
