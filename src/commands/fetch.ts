import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { requestJson } from '../utils/http';
import * as logger from '../utils/logger';

interface CatalogSkillResponse {
  status: string;
  data?: {
    slug: string;
    name: string;
    description?: string | null;
    category?: string | null;
    content: string;
    scripts?: Record<string, string>;
    files?: Record<string, string>;
    requiresSkills?: string[];
    dependencySkills?: Array<{
      slug: string;
      name: string;
      content: string;
      scripts?: Record<string, string>;
      files?: Record<string, string>;
    }>;
  };
}

export const fetchCommand = new Command('fetch')
  .description('Fetch a GooseWorks skill (content + scripts + dependencies) by slug')
  .argument('<slug>', 'Skill slug (e.g. "reddit-scraper")')
  .action(async (slug: string) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const spin = logger.spinner(`Fetching skill ${slug}...`);
    try {
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

      console.log(JSON.stringify(response.data, null, 2));
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'Fetch failed';
      logger.error(message);
      process.exit(1);
    }
  });
