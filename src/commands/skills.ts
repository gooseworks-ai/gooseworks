import { Command } from 'commander';
import { getEntrySkills, type EntrySkill } from '../skills/master-skill';
import { inspectEntrySkill } from '../skills/installer';
import { compareReleaseVersion, getReleasedSkills, skillContentHash, type ReleasedSkills } from '../skills/releases';
import { getVersion } from '../version';
import * as logger from '../utils/logger';
import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'node:path';
import { getSkillsBasePath } from '../skills/installer';

interface HostEntry { host: string; path: string; hash: string | null; location: 'managed_link' | 'linked_elsewhere' | 'independent' | 'unreadable' }

/** A host can load a preserved real folder instead of our shared managed entry. */
function inspectHostEntries(name: string): HostEntry[] {
  return ['codex', 'claude'].flatMap((host): HostEntry[] => {
    const dir = path.join(os.homedir(), `.${host}`, 'skills', name);
    const file = path.join(dir, 'SKILL.md');
    try {
      if (!fs.lstatSync(dir, { throwIfNoEntry: false })) return [];
      if (!fs.statSync(file).isFile()) throw new Error('Not a skill file');
      const isLink = fs.lstatSync(dir).isSymbolicLink();
      let managed = false;
      if (isLink) {
        try { managed = fs.realpathSync(dir) === fs.realpathSync(path.join(getSkillsBasePath(), name)); }
        catch { /* A separate host link can exist without a shared install. */ }
      }
      return [{ host, path: file, hash: skillContentHash(fs.readFileSync(file)), location: managed ? 'managed_link' : isLink ? 'linked_elsewhere' : 'independent' }];
    } catch {
      return [{ host, path: file, hash: null, location: 'unreadable' }];
    }
  });
}

export function entryFreshnessReport(skills: EntrySkill[], runningVersion: string, release?: ReleasedSkills) {
  return {
    runningVersion,
    releasedVersion: release?.version ?? null,
    cli: release ? compareReleaseVersion(runningVersion, release.version) : 'unavailable',
    releaseSource: release?.source ?? null,
    entries: skills.map((skill) => {
      const installed = inspectEntrySkill(skill.name);
      const bundledHash = skillContentHash(skill.content);
      const releasedHash = release?.hashes[skill.name] ?? null;
      return {
        name: skill.name,
        installedHash: installed.hash ?? null,
        bundledHash,
        releasedHash,
        local: installed.modified ? 'modified_or_untracked' : installed.missing ? 'missing' : installed.hash === bundledHash ? 'bundled' : 'different_from_bundle',
        published: !release ? 'unavailable' : !releasedHash ? 'not_in_release' : installed.hash === releasedHash ? 'current' : installed.missing ? 'missing' : 'different_from_release',
        hosts: inspectHostEntries(skill.name).map((host) => ({
          ...host,
          local: host.hash === bundledHash ? 'bundled' : host.hash ? 'different_from_bundle' : 'unreadable',
          published: !release ? 'unavailable' : !releasedHash ? 'not_in_release' : host.hash === releasedHash ? 'current' : 'different_from_release',
        })),
      };
    }),
  };
}

export async function readEntryFreshnessReport() {
  let release: ReleasedSkills | undefined;
  try { release = await getReleasedSkills(); } catch { /* offline is unknown, never current */ }
  return entryFreshnessReport(getEntrySkills(), getVersion(), release);
}

export async function reportEntrySkillFreshness(existing?: Awaited<ReturnType<typeof readEntryFreshnessReport>>): Promise<void> {
  const report = existing ?? await readEntryFreshnessReport();
  if (report.cli === 'unavailable') logger.warn('Published skill freshness could not be checked. Local setup can continue; run `gooseworks skills status` when online.');
  else if (report.cli === 'outdated') logger.warn(`CLI ${report.runningVersion} is older than published ${report.releasedVersion}. Run npm install -g gooseworks@latest, then gooseworks update; this CLI can only install its bundled instructions.`);
  else if (report.cli === 'current') logger.success(`CLI ${report.runningVersion} matches the latest published version.`);
  else if (report.cli === 'unreleased') logger.info(`CLI ${report.runningVersion} differs from published ${report.releasedVersion}; this may be an unreleased build. Do not downgrade an approved run.`);
  for (const entry of report.entries) {
    if (entry.local === 'modified_or_untracked') logger.warn(`${entry.name}: local edits or unknown install provenance; preserved. Review/back up before gooseworks update --overwrite-modified.`);
    else if (entry.local === 'missing') logger.info(`${entry.name}: not installed.`);
    else if (entry.local === 'different_from_bundle') logger.warn(`${entry.name}: installed instructions differ from this CLI. Run gooseworks update after checking the published CLI version.`);
    else if (entry.published === 'different_from_release') logger.warn(`${entry.name}: installed instructions differ from the published package. Run gooseworks skills status --json to compare the release, bundle and local file.`);
    for (const host of entry.hosts) {
      if (host.location === 'managed_link') continue;
      if (host.local !== 'bundled' || host.published === 'different_from_release') {
        logger.warn(`${entry.name}: ${host.host} loads a separate or unreadable copy at ${host.path}; preserved. Review/back up that host copy before replacing it. Shared entry updates do not replace independent host files.`);
      }
    }
  }
  if (report.entries.some((entry) => ['goose-video', 'goose-video-local', 'make-custom-video'].includes(entry.name)
    && (entry.local !== 'bundled' || entry.published === 'different_from_release'
      || entry.hosts.some((host) => host.local !== 'bundled' || host.published === 'different_from_release')))) {
    logger.info('New video work can load the current matching entry with catalog_fetch on the selected GooseWorks connection. Save it in a new run folder; preserve edited local files and approved project packages.');
  }
}

export const skillsCommand = new Command('skills')
  .description('Inspect installed entry skills without replacing files');

skillsCommand.command('status')
  .description('Compare local instructions and this CLI with the latest published npm package')
  .option('--json', 'Print hashes and release provenance as JSON')
  .action(async (options: { json?: boolean }) => {
    if (options.json) console.log(JSON.stringify(await readEntryFreshnessReport(), null, 2));
    else {
      await reportEntrySkillFreshness();
      logger.info('This check covers bundled entry skills. Saved recipe packages use their connected server catalog hashes; MCP tool schemas have a separate host cache. Approved runs keep their pinned package.');
    }
  });
