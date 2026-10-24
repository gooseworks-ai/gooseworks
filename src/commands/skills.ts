import { Command } from 'commander';
import { entrySkillDigest, fetchEntrySkills, inspectEntrySkill, type EntrySkillCatalog } from '../skills/installer';
import { ENTRY_SKILL_NAMES } from '../skills/names';
import { compareReleaseVersion, getPublishedCli, skillContentHash, type PublishedCli } from '../skills/releases';
import { getVersion } from '../version';
import * as logger from '../utils/logger';
import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'node:path';
import { getSkillsBasePath } from '../skills/installer';
import { getEnvironment } from '../environment';

interface HostEntry { host: string; path: string; hash: string | null; location: 'managed_link' | 'linked_elsewhere' | 'independent' | 'unreadable' }

/** A host can load a preserved real folder instead of our shared managed entry. */
function inspectHostEntries(name: string): HostEntry[] {
  if (getEnvironment() === 'staging') return [];
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

/** The goose-skills catalog download, or why it failed. */
export type EntryCatalogResult = { catalog: EntrySkillCatalog; error?: undefined } | { catalog?: undefined; error: string };

/** Downloads the entry skills from goose-skills. Never throws: a failure is returned as `error`. */
export async function loadEntryCatalog(): Promise<EntryCatalogResult> {
  try {
    return { catalog: await fetchEntrySkills() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Compares each installed entry skill with the goose-skills catalog (by the
 * hash of every file in the folder) and this CLI with the published npm
 * version. An unreachable catalog or registry is "unavailable", never current.
 */
export function entryFreshnessReport(loaded: EntryCatalogResult, runningVersion: string, release?: PublishedCli) {
  const catalog = loaded.catalog;
  return {
    runningVersion,
    releasedVersion: release?.version ?? null,
    cli: release ? compareReleaseVersion(runningVersion, release.version) : 'unavailable',
    releaseSource: release?.source ?? null,
    catalogSource: catalog?.source ?? null,
    catalogError: loaded.error ?? null,
    entries: ENTRY_SKILL_NAMES.map((name) => {
      const skill = catalog?.skills.find((candidate) => candidate.name === name);
      const installed = inspectEntrySkill(name);
      const catalogHash = skill ? skillContentHash(skill.content) : null;
      const catalogState = (hash: string | null | undefined, matches: boolean) =>
        !catalog ? 'unavailable' : !skill ? 'not_in_catalog' : !hash ? 'missing' : matches ? 'current' : 'different_from_catalog';
      return {
        name,
        installedHash: installed.hash ?? null,
        installedVersion: installed.version ?? null,
        catalogHash,
        catalogVersion: skill?.version ?? null,
        local: installed.modified ? 'modified_or_untracked' : installed.missing ? 'missing' : 'managed',
        catalog: catalogState(installed.hash, !!skill && installed.digest === entrySkillDigest(skill)),
        hosts: inspectHostEntries(name).map((host) => ({
          ...host,
          catalog: host.hash === null ? 'unreadable' : catalogState(host.hash, host.hash === catalogHash),
        })),
      };
    }),
  };
}

export async function readEntryFreshnessReport(loaded?: EntryCatalogResult) {
  const [release, catalog] = await Promise.all([
    getPublishedCli().catch(() => undefined), // offline is unknown, never current
    loaded ?? loadEntryCatalog(),
  ]);
  return entryFreshnessReport(catalog, getVersion(), release);
}

export async function reportEntrySkillFreshness(existing?: Awaited<ReturnType<typeof readEntryFreshnessReport>>): Promise<void> {
  const report = existing ?? await readEntryFreshnessReport();
  if (report.cli === 'unavailable') logger.warn('The published CLI version could not be checked. Local setup can continue; run `gooseworks skills status` when online.');
  else if (report.cli === 'outdated') logger.warn(`CLI ${report.runningVersion} is older than published ${report.releasedVersion}. Run npm install -g gooseworks@latest, then gooseworks update.`);
  else if (report.cli === 'current') logger.success(`CLI ${report.runningVersion} matches the latest published version.`);
  else if (report.cli === 'unreleased') logger.info(`CLI ${report.runningVersion} differs from published ${report.releasedVersion}; this may be an unreleased build. Do not downgrade an approved run.`);
  if (report.catalogError) logger.warn(`The GooseWorks skill catalog could not be read (${report.catalogError}). Installed entry skills were not compared or changed.`);
  for (const entry of report.entries) {
    if (entry.local === 'modified_or_untracked') logger.warn(`${entry.name}: local edits or unknown install provenance; preserved. Review/back up before gooseworks update --overwrite-modified.`);
    else if (entry.local === 'missing') logger.info(`${entry.name}: not installed.`);
    else if (entry.catalog === 'different_from_catalog') logger.warn(`${entry.name}: installed instructions differ from the GooseWorks skill catalog${entry.catalogVersion ? ` (version ${entry.catalogVersion})` : ''}. Run gooseworks update.`);
    else if (entry.catalog === 'not_in_catalog') logger.info(`${entry.name}: no longer in the GooseWorks skill catalog; the installed copy was left as it is.`);
    for (const host of entry.hosts) {
      if (host.location === 'managed_link') continue;
      if (host.catalog === 'different_from_catalog' || host.catalog === 'unreadable') {
        logger.warn(`${entry.name}: ${host.host} loads a separate or unreadable copy at ${host.path}; preserved. Review/back up that host copy before replacing it. Shared entry updates do not replace independent host files.`);
      }
    }
  }
  if (report.entries.some((entry) => ['goose-video', 'goose-video-local', 'make-custom-video'].includes(entry.name)
    && (entry.catalog === 'different_from_catalog'
      || entry.hosts.some((host) => host.location !== 'managed_link' && (host.catalog === 'different_from_catalog' || host.catalog === 'unreadable'))))) {
    logger.info('New video work can load the current matching entry with catalog_fetch on the selected GooseWorks connection. Save it in a new run folder; preserve edited local files and approved project packages.');
  }
}

export const skillsCommand = new Command('skills')
  .description('Inspect installed entry skills without replacing files');

skillsCommand.command('status')
  .description('Compare installed entry skills with the GooseWorks skill catalog and this CLI with the latest published npm version')
  .option('--json', 'Print hashes and release provenance as JSON')
  .action(async (options: { json?: boolean }) => {
    if (options.json) console.log(JSON.stringify(await readEntryFreshnessReport(), null, 2));
    else {
      await reportEntrySkillFreshness();
      logger.info('This check covers the entry skills from the GooseWorks skill catalog (goose-skills). Saved recipe packages use their connected server catalog hashes; MCP tool schemas have a separate host cache. Approved runs keep their pinned package.');
    }
  });
