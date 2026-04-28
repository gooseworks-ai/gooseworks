import { Command } from 'commander';
import { FRONTEND_URL } from '../config';
import {
  STYLE_MANIFEST_FILENAME,
  validateStyleManifest,
} from '../lib/graphics-manifest';
import {
  deleteStyle,
  getStyleDesignMd,
  getStyleRecord,
  listStyles,
  publishStyle,
  updateStyle,
  type GraphicStyleSummary,
  type ListEnvelope,
} from '../lib/graphics-api';
import {
  EXIT_USER_ERROR,
  authedClientOpts,
  clientOpts,
  parseIntOpt,
  promptYesNo,
  renderTable,
  reportApiErrorAndExit,
  truncate,
} from './graphics/shared';
import { runPublishFlow, runUpdateFlow } from './graphics/publish-flow';
import { runGetFlow } from './graphics/get-flow';

interface ListOptions {
  mood?: string;
  tag?: string;
  featured?: boolean;
  q?: string;
  json?: boolean;
  limit?: string;
  offset?: string;
}

function renderListTable(rows: ListEnvelope<GraphicStyleSummary>['data']): string {
  return renderTable(rows, [
    { header: 'NAME', get: (r) => truncate(r.name, 40) },
    { header: 'SLUG', get: (r) => r.slug },
    { header: 'MOOD', get: (r) => r.moodGroup ?? '' },
    { header: 'FEATURED', get: (r) => (r.featured ? '★' : '') },
    { header: 'AUTHOR', get: (r) => r.authorHandle ?? '' },
  ]);
}

const listCmd = new Command('list')
  .description('List published graphic styles')
  .option('--mood <mood>', 'Filter by mood group')
  .option('--tag <tag>', 'Filter by tag')
  .option('--featured', 'Only featured styles')
  .option('--q <query>', 'Free-text query')
  .option('--limit <n>', 'Max rows to return')
  .option('--offset <n>', 'Skip the first N rows')
  .option('--json', 'Print full JSON instead of a table')
  .action(async (opts: ListOptions) => {
    try {
      const env = await listStyles(clientOpts(), {
        q: opts.q,
        mood: opts.mood,
        tag: opts.tag,
        featured: !!opts.featured,
        limit: parseIntOpt(opts.limit, 'limit'),
        offset: parseIntOpt(opts.offset, 'offset'),
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(env.data, null, 2) + '\n');
        return;
      }
      if (env.data.length === 0) {
        process.stderr.write('No styles match.\n');
        return;
      }
      process.stdout.write(renderListTable(env.data) + '\n');
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

const searchCmd = new Command('search')
  .description('Search graphic styles (alias for `list --q <query>`)')
  .argument('<query>', 'Search query')
  .option('--json', 'Print full JSON instead of a table')
  .option('--limit <n>', 'Max rows to return')
  .option('--offset <n>', 'Skip the first N rows')
  .action(async (query: string, opts: { json?: boolean; limit?: string; offset?: string }) => {
    try {
      const env = await listStyles(clientOpts(), {
        q: query,
        limit: parseIntOpt(opts.limit, 'limit'),
        offset: parseIntOpt(opts.offset, 'offset'),
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(env.data, null, 2) + '\n');
        return;
      }
      if (env.data.length === 0) {
        process.stderr.write(`No styles match "${query}".\n`);
        return;
      }
      process.stdout.write(renderListTable(env.data) + '\n');
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

const getCmd = new Command('get')
  .description('Print a style\'s design.md (default) or full JSON record')
  .argument('<slug>', 'Style slug')
  .option('--json', 'Print full JSON record instead of design.md')
  .option('--include-examples', 'Also download example PNGs into ./<slug>/')
  .option('--no-cache', 'Bypass local ETag cache')
  .action(async (
    slug: string,
    opts: { json?: boolean; includeExamples?: boolean; cache?: boolean }
  ) => {
    const opt = clientOpts();
    await runGetFlow(
      {
        resource: 'styles',
        fetchMarkdown: (s, etag) => getStyleDesignMd(opt, s, etag),
        fetchRecord: (s, etag) => getStyleRecord(opt, s, etag),
      },
      slug,
      {
        json: opts.json,
        includeExamples: opts.includeExamples,
        // commander's --no-cache flips `cache` to false
        noCache: opts.cache === false,
      }
    );
  });

const publishCmd = new Command('publish')
  .description('Publish a style from a directory containing gooseworks-style.json')
  .argument('[path]', 'Directory containing the manifest', '.')
  .option('--slug <slug>', 'Override the manifest slug')
  .option('--yes', 'Skip the slug-collision prompt and accept the suggestion')
  .action(async (dir: string, opts: { slug?: string; yes?: boolean }) => {
    const auth = authedClientOpts();
    await runPublishFlow(
      {
        manifestFilename: STYLE_MANIFEST_FILENAME,
        validate: validateStyleManifest,
        hubUrl: (slug) => `${FRONTEND_URL}/styles/${slug}`,
        label: 'style',
        upload: (manifest, files) => publishStyle(auth, manifest, files),
      },
      { dir, slug: opts.slug, yes: opts.yes }
    );
  });

const updateCmd = new Command('update')
  .description('Update a style by slug')
  .argument('<slug>', 'Style slug to update')
  .argument('[path]', 'Directory containing the manifest', '.')
  .action(async (slug: string, dir: string) => {
    const auth = authedClientOpts();
    await runUpdateFlow(
      {
        manifestFilename: STYLE_MANIFEST_FILENAME,
        validate: validateStyleManifest,
        hubUrl: (s) => `${FRONTEND_URL}/styles/${s}`,
        label: 'style',
        upload: (manifest, files) => updateStyle(auth, slug, manifest, files),
      },
      { dir, slug, yes: true }
    );
  });

const deleteCmd = new Command('delete')
  .description('Delete a style by slug (owner only)')
  .argument('<slug>', 'Style slug to delete')
  .option('--yes', 'Skip the confirmation prompt')
  .action(async (slug: string, opts: { yes?: boolean }) => {
    const auth = authedClientOpts();
    if (!opts.yes) {
      const ok = await promptYesNo(`Delete style '${slug}'?`, false);
      if (!ok) {
        process.stderr.write('Aborted.\n');
        process.exit(EXIT_USER_ERROR);
      }
    }
    try {
      await deleteStyle(auth, slug);
      process.stdout.write(`Deleted style '${slug}'.\n`);
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

export const stylesCommand = new Command('styles')
  .description('Browse and publish graphic styles')
  .addCommand(listCmd)
  .addCommand(searchCmd)
  .addCommand(getCmd)
  .addCommand(publishCmd)
  .addCommand(updateCmd)
  .addCommand(deleteCmd);
