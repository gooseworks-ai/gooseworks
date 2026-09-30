import * as fs from 'fs';
import * as path from 'path';
import { getEntrySkillNames } from './master-skill';

/**
 * Which directories under ~/.agents/skills/ the CLI is allowed to DELETE.
 *
 * GOOSE-3191 (data loss): this predicate used to match ANY directory whose name
 * started with `goose-` or `gooseworks-`. `gooseworks install` calls
 * `removeAllSkills()` on every install / update / login-refresh, so a user's own
 * unrelated third-party skill — `goose-notes`, `goose-jira`, anything they wrote
 * themselves — was silently destroyed. A name prefix is NOT ownership.
 *
 * The rule now, in order of authority:
 *
 *   1. **Known entry-skill slugs** (`gooseworks`, `goose-ads`, `goose-video`,
 *      `goose-product-photos`, plus the legacy `ads-remix` name) are ours by
 *      definition — they are the dirs the CLI itself writes on every install, so
 *      we delete them regardless of whether they carry a stamp. This is what
 *      keeps upgrades from an old CLI working.
 *   2. **A `.gooseworks-version` stamp** marks a directory the installer wrote.
 *      It is a SECONDARY signal, used to recognise standalone skills installed
 *      with `--with <slug>` (whose slugs we can't enumerate ahead of time).
 *   3. **Anything else is the user's.** An unstamped directory that is not a
 *      known entry slug is NEVER deleted, no matter what it's called.
 *
 * Deliberate, documented trade-off: a standalone skill installed by an OLDER CLI
 * (before `installStandaloneSkill` wrote a stamp) is unstamped and therefore no
 * longer removed by `removeAllSkills()`. That is the safe direction to be wrong —
 * it leaves a stale-but-working copy on disk instead of deleting a stranger's
 * work — and it self-heals: re-running `gooseworks install --with <slug>`
 * replaces the directory in place and stamps it.
 */

/** The stamp file `installEntrySkill` / `installStandaloneSkill` write. */
export const STAMP_FILE = '.gooseworks-version';

/**
 * Entry-skill dir names the CLI no longer writes but must still clean up.
 * `ads-remix` was renamed to `goose-ads`.
 */
export const LEGACY_ENTRY_SKILL_NAMES = ['ads-remix'] as const;

/**
 * Every skill directory name the CLI itself owns and writes. Derived from
 * `getEntrySkills()` so the registry stays the single source (GOOSE-3190).
 */
export function getManagedEntrySkillNames(): string[] {
  return [...getEntrySkillNames(), ...LEGACY_ENTRY_SKILL_NAMES];
}

/** True when `name` is a skill directory the CLI itself installs. */
export function isManagedEntrySkillName(name: string): boolean {
  return getManagedEntrySkillNames().includes(name);
}

/** True when `<skillsBase>/<name>/.gooseworks-version` exists. */
export function hasGooseworksStamp(skillsBase: string, name: string): boolean {
  try {
    return fs.existsSync(path.join(skillsBase, name, STAMP_FILE));
  } catch {
    return false;
  }
}

/**
 * True when the CLI may manage (link, list, and DELETE) `<skillsBase>/<name>/`.
 *
 * `skillsBase` is required: ownership is a property of what's ON DISK, not of
 * the name. Callers that only have a name (e.g. pruning symlinks in
 * ~/.claude/skills) pass the skills base the links point into.
 */
export function isManagedGooseworksSkill(name: string, skillsBase: string): boolean {
  if (isManagedEntrySkillName(name)) return true;
  return hasGooseworksStamp(skillsBase, name);
}
