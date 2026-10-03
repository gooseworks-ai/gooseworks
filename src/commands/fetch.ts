import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { requestJson } from '../utils/http';
import * as logger from '../utils/logger';
import * as fs from 'node:fs';
import { compareSavedPackage, type SkillPackageIdentity } from '../skills/package-freshness';

interface CatalogSkillResponse {
  status: string;
  data?: {
    slug: string;
    name: string;
    description?: string | null;
    category?: string | null;
    content: string;
    version?: string;
    contentHash?: string | null;
    metadata?: Record<string, unknown>;
    scripts?: Record<string, string>;
    files?: Record<string, string>;
    requiresSkills?: string[];
    dependencySkills?: Array<{
      slug: string;
      name: string;
      content: string;
      version?: string;
      contentHash?: string | null;
      metadata?: Record<string, unknown>;
      scripts?: Record<string, string>;
      files?: Record<string, string>;
    }>;
  };
}

export function createFetchCommand(): Command {
return new Command('fetch')
  .description('Fetch a GooseWorks skill (content + scripts + dependencies) by slug')
  .argument('<slug>', 'Skill slug (e.g. "reddit-scraper")')
  .option('--saved-package <file>', 'Compare a previously saved fetch JSON with the current connected catalog; do not replace it')
  .action(async (slug: string, options: { savedPackage?: string }) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const spin = logger.spinner(`Fetching skill ${slug}...`);
    try {
      let saved: SkillPackageIdentity | undefined;
      if (options.savedPackage) {
        const fd = fs.openSync(options.savedPackage, 'r');
        try {
          if (!fs.fstatSync(fd).isFile()) throw new Error('Saved package must be a regular JSON file');
          const buffer = Buffer.alloc(16 * 1024 * 1024 + 1);
          let size = 0, count = 0;
          do { count = fs.readSync(fd, buffer, size, buffer.length - size, null); size += count; } while (count && size < buffer.length);
          if (size === buffer.length) throw new Error('Saved package exceeds 16 MiB');
          const parsed: unknown = JSON.parse(buffer.subarray(0, size).toString('utf8'));
          if (!parsed || typeof parsed !== 'object' || (parsed as SkillPackageIdentity).slug !== slug) throw new Error('Saved package slug does not match the requested skill');
          const value = parsed as SkillPackageIdentity;
          if (value.contentHash != null && typeof value.contentHash !== 'string') throw new Error('Invalid saved content hash');
          if (value.dependencySkills != null && (!Array.isArray(value.dependencySkills) || value.dependencySkills.length > 100 || value.dependencySkills.some((dep) => !dep || typeof dep.slug !== 'string' || (dep.contentHash != null && typeof dep.contentHash !== 'string')))) throw new Error('Invalid saved dependency hashes');
          saved = value;
        } finally { fs.closeSync(fd); }
      }
      const response = await requestJson<CatalogSkillResponse>({
        apiBase: creds.api_base,
        apiKey: creds.api_key,
        method: 'GET',
        path: `/api/skills/catalog/${encodeURIComponent(slug)}`,
      });
      spin.stop();

      if (response.status === 'error' || !response.data) {
        logger.error('Failed to fetch skill');
        process.exit(1);
      }

      console.log(JSON.stringify({ ...response.data, freshness: compareSavedPackage(response.data, saved) }, null, 2));
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'Fetch failed';
      logger.error(message);
      process.exit(1);
    }
  });

}

export const fetchCommand = createFetchCommand();
