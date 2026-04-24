import { Command } from 'commander';
import * as https from 'https';
import * as http from 'http';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

interface CatalogSkill {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
}

interface SearchResponse {
  status: string;
  data: CatalogSkill[];
}

function statusToMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized — your API key may be invalid. Run "gooseworks login" to re-authenticate.';
  }
  if (status === 403) {
    return 'Forbidden — your account may lack access to this endpoint.';
  }
  if (status === 404) {
    return 'Search endpoint not found (server may be out of date).';
  }
  if (status >= 500) {
    return `Server error (${status}). Please try again later.`;
  }
  return `Request failed with status ${status}.`;
}

function searchSkills(apiBase: string, apiKey: string, query: string): Promise<SearchResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiBase}/api/skills/search`);
    const client = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ query });

    const req = client.request(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (status < 200 || status >= 300) {
          reject(new Error(statusToMessage(status)));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid response from server'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export const searchCommand = new Command('search')
  .description('Search the GooseWorks skill catalog')
  .argument('<query>', 'Search query (e.g. "reddit scraping", "find emails")')
  .action(async (query: string) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const spin = logger.spinner(`Searching for "${query}"...`);

    try {
      const response = await searchSkills(creds.api_base, creds.api_key, query);
      spin.stop();

      if (response.status === 'error' || !response.data) {
        logger.error('Search failed');
        process.exit(1);
      }

      const skills = response.data;

      if (skills.length === 0) {
        logger.warn(`No skills found for "${query}"`);
        return;
      }

      console.log('');
      logger.success(`Found ${skills.length} skill${skills.length === 1 ? '' : 's'}:`);
      console.log('');

      for (const skill of skills) {
        const cat = skill.category ? ` [${skill.category}]` : '';
        console.log(`  ${skill.name}${cat}`);
        console.log(`    slug: ${skill.slug}`);
        if (skill.description) {
          const desc = skill.description.length > 80
            ? skill.description.slice(0, 77) + '...'
            : skill.description;
          console.log(`    ${desc}`);
        }
        console.log('');
      }

      logger.info('To get full skill details (with scripts), run:');
      console.log(`    curl -s $GOOSEWORKS_API_BASE/api/skills/catalog/<slug> -H "Authorization: Bearer $GOOSEWORKS_API_KEY"`);
      console.log('');
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'Search failed';
      logger.error(message);
      process.exit(1);
    }
  });
