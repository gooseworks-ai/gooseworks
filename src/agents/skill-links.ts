import * as fs from 'fs';
import * as path from 'path';
import { isManagedGooseworksSkill } from '../skills/names';
import * as logger from '../utils/logger';

/**
 * Cross-platform skill linking (GOOSE-2418).
 *
 * On Windows, `fs.symlinkSync(src, dst, 'dir')` requires Administrator rights or
 * Developer Mode — a fresh, non-elevated user hits EPERM, the exception aborts
 * `install`, and the GooseWorks MCP server never gets registered. Directory
 * JUNCTIONS need no privileges and Claude Code / Codex follow them identically,
 * so we use junctions on win32 and dir symlinks everywhere else. Every operation
 * here is best-effort and NEVER throws to its caller — a single bad link must not
 * take down MCP registration.
 */
const LINK_TYPE: 'junction' | 'dir' = process.platform === 'win32' ? 'junction' : 'dir';

/**
 * True when `target` is one of OUR links (a POSIX symlink or a Windows junction),
 * not a real directory. `readlinkSync` succeeds on both link kinds and throws on
 * a regular file/dir — unlike `lstat().isSymbolicLink()`, which reports `false`
 * for junctions and so can't be trusted on Windows.
 */
function isLink(target: string): boolean {
  try {
    fs.readlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Does `target` already resolve to `source`? A real directory resolves to
 * itself, so this is false for a non-link — safe to use as a "keep this link"
 * check without risking a match on a user's own folder.
 */
function resolvesTo(target: string, source: string): boolean {
  try {
    return path.resolve(fs.realpathSync(target)) === path.resolve(source);
  } catch {
    return false;
  }
}

/**
 * Remove a link/junction WITHOUT ever deleting its target contents or a real
 * directory. Callers gate on `isLink()` first. `unlinkSync` handles POSIX
 * symlinks; a Windows junction is a directory reparse point, removed with
 * `rmdirSync` (which drops the junction, not the linked folder).
 */
function removeLink(target: string): void {
  try {
    fs.unlinkSync(target);
    return;
  } catch {
    // not a plain symlink (e.g. a win32 junction) — fall through
  }
  try {
    fs.rmdirSync(target);
    return;
  } catch {
    // last resort
  }
  try {
    fs.rmSync(target, { recursive: false, force: true });
  } catch {
    // ignore — nothing more we can safely do
  }
}

/**
 * Drop every managed link under `targetDir` (leaving real directories alone).
 *
 * `skillsBase` is the skills dir the links point into — ownership is decided by
 * what's on disk there, not by the link's name (GOOSE-3191).
 */
export function removeManagedSkillLinks(targetDir: string, skillsBase: string): void {
  if (!fs.existsSync(targetDir)) return;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(targetDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!isManagedGooseworksSkill(entry, skillsBase)) continue;
    const target = path.join(targetDir, entry);
    if (isLink(target)) removeLink(target);
  }
}

/**
 * Link every managed skill under `skillsBase` into `targetDir`.
 *
 *   - win32 → directory JUNCTIONS (no admin / Developer Mode needed).
 *   - a link already resolving to the wanted source is PRESERVED, so a manually
 *     repaired junction survives repeated `install` / `update` runs.
 *   - a per-skill failure is warned (with an actionable Windows hint) and
 *     skipped, never thrown — the caller must still reach MCP registration.
 *
 * Returns { linked, failed }; never throws.
 */
export function syncManagedSkillLinks(
  skillsBase: string,
  targetDir: string,
): { linked: number; failed: number } {
  fs.mkdirSync(targetDir, { recursive: true });

  let sources: string[] = [];
  try {
    sources = fs.readdirSync(skillsBase).filter((entry) =>
      isManagedGooseworksSkill(entry, skillsBase),
    );
  } catch {
    return { linked: 0, failed: 0 };
  }
  const wanted = new Map(sources.map((s) => [s, path.join(skillsBase, s)]));

  // Drop stale managed links, but KEEP any that already point at a wanted source
  // (so a working junction a Windows user repaired by hand isn't destroyed).
  try {
    for (const entry of fs.readdirSync(targetDir)) {
      if (!isManagedGooseworksSkill(entry, skillsBase)) continue;
      const target = path.join(targetDir, entry);
      const source = wanted.get(entry);
      if (source && resolvesTo(target, source)) continue;
      if (isLink(target)) removeLink(target);
    }
  } catch {
    // targetDir race — links are (re)created below regardless
  }

  let linked = 0;
  let failed = 0;
  for (const [skillDir, source] of wanted) {
    const target = path.join(targetDir, skillDir);
    if (resolvesTo(target, source)) {
      linked++; // already correct — preserved, no privilege needed
      continue;
    }
    try {
      if (isLink(target)) removeLink(target);
      fs.symlinkSync(source, target, LINK_TYPE);
      linked++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `Could not link skill "${skillDir}" into ${targetDir}: ${msg}` +
          (process.platform === 'win32'
            ? ' — enable Windows Developer Mode or run the terminal as Administrator, then re-run `gooseworks install`.'
            : ''),
      );
    }
  }

  return { linked, failed };
}
