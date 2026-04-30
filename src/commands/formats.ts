import { Command } from 'commander';
import { HUB_URL } from '../config';
import {
  FORMAT_MANIFEST_FILENAME,
  validateFormatManifest,
} from '../lib/graphics-manifest';
import {
  deleteFormat,
  getFormatRecord,
  getFormatSpecMd,
  listFormats,
  publishFormat,
  updateFormat,
  type GraphicFormatSummary,
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
  featured?: boolean;
  q?: string;
  json?: boolean;
  limit?: string;
  offset?: string;
}

function renderListTable(rows: ListEnvelope<GraphicFormatSummary>['data']): string {
  return renderTable(rows, [
    { header: 'NAME', get: (r) => truncate(r.name, 40) },
    { header: 'SLUG', get: (r) => r.slug },
    {
      header: 'SIZE',
      get: (r) =>
        r.width != null && r.height != null ? `${r.width}×${r.height}` : '',
    },
    { header: 'FEATURED', get: (r) => (r.featured ? '★' : '') },
    { header: 'AUTHOR', get: (r) => r.authorHandle ?? '' },
  ]);
}

const listCmd = new Command('list')
  .description('List published graphic formats')
  .option('--featured', 'Only featured formats')
  .option('--q <query>', 'Free-text query')
  .option('--limit <n>', 'Max rows to return')
  .option('--offset <n>', 'Skip the first N rows')
  .option('--json', 'Print full JSON instead of a table')
  .action(async (opts: ListOptions) => {
    try {
      const env = await listFormats(clientOpts(), {
        q: opts.q,
        featured: !!opts.featured,
        limit: parseIntOpt(opts.limit, 'limit'),
        offset: parseIntOpt(opts.offset, 'offset'),
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(env.data, null, 2) + '\n');
        return;
      }
      if (env.data.length === 0) {
        process.stderr.write('No formats match.\n');
        return;
      }
      process.stdout.write(renderListTable(env.data) + '\n');
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

const searchCmd = new Command('search')
  .description('Search graphic formats (alias for `list --q <query>`)')
  .argument('<query>', 'Search query')
  .option('--json', 'Print full JSON instead of a table')
  .option('--limit <n>', 'Max rows to return')
  .option('--offset <n>', 'Skip the first N rows')
  .action(async (query: string, opts: { json?: boolean; limit?: string; offset?: string }) => {
    try {
      const env = await listFormats(clientOpts(), {
        q: query,
        limit: parseIntOpt(opts.limit, 'limit'),
        offset: parseIntOpt(opts.offset, 'offset'),
      });
      if (opts.json) {
        process.stdout.write(JSON.stringify(env.data, null, 2) + '\n');
        return;
      }
      if (env.data.length === 0) {
        process.stderr.write(`No formats match "${query}".\n`);
        return;
      }
      process.stdout.write(renderListTable(env.data) + '\n');
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

const getCmd = new Command('get')
  .description('Print a format\'s spec.md (default) or full JSON record')
  .argument('<slug>', 'Format slug')
  .option('--json', 'Print full JSON record instead of spec.md')
  .option('--include-examples', 'Also download example PNGs into ./<slug>/')
  .option('--no-cache', 'Bypass local ETag cache')
  .action(async (
    slug: string,
    opts: { json?: boolean; includeExamples?: boolean; cache?: boolean }
  ) => {
    const opt = clientOpts();
    await runGetFlow(
      {
        resource: 'formats',
        fetchMarkdown: (s, etag) => getFormatSpecMd(opt, s, etag),
        fetchRecord: (s, etag) => getFormatRecord(opt, s, etag),
      },
      slug,
      {
        json: opts.json,
        includeExamples: opts.includeExamples,
        noCache: opts.cache === false,
      }
    );
  });

const publishCmd = new Command('publish')
  .description('Publish a format from a directory containing gooseworks-format.json')
  .argument('[path]', 'Directory containing the manifest', '.')
  .option('--slug <slug>', 'Override the manifest slug')
  .option('--yes', 'Skip the slug-collision prompt and accept the suggestion')
  .action(async (dir: string, opts: { slug?: string; yes?: boolean }) => {
    const auth = authedClientOpts();
    await runPublishFlow(
      {
        manifestFilename: FORMAT_MANIFEST_FILENAME,
        validate: validateFormatManifest,
        hubUrl: (slug) => `${HUB_URL}/formats/${slug}`,
        searchHint: (slug) => `gooseworks formats search ${slug}`,
        label: 'format',
        upload: (manifest, files) => publishFormat(auth, manifest, files),
      },
      { dir, slug: opts.slug, yes: opts.yes }
    );
  });

const updateCmd = new Command('update')
  .description('Update a format by slug')
  .argument('<slug>', 'Format slug to update')
  .argument('[path]', 'Directory containing the manifest', '.')
  .action(async (slug: string, dir: string) => {
    const auth = authedClientOpts();
    await runUpdateFlow(
      {
        manifestFilename: FORMAT_MANIFEST_FILENAME,
        validate: validateFormatManifest,
        hubUrl: (s) => `${HUB_URL}/formats/${s}`,
        searchHint: (s) => `gooseworks formats search ${s}`,
        label: 'format',
        upload: (manifest, files) => updateFormat(auth, slug, manifest, files),
      },
      { dir, slug, yes: true }
    );
  });

const deleteCmd = new Command('delete')
  .description('Delete a format by slug (owner only)')
  .argument('<slug>', 'Format slug to delete')
  .option('--yes', 'Skip the confirmation prompt')
  .action(async (slug: string, opts: { yes?: boolean }) => {
    const auth = authedClientOpts();
    if (!opts.yes) {
      const ok = await promptYesNo(`Delete format '${slug}'?`, false);
      if (!ok) {
        process.stderr.write('Aborted.\n');
        process.exit(EXIT_USER_ERROR);
      }
    }
    try {
      await deleteFormat(auth, slug);
      process.stdout.write(`Deleted format '${slug}'.\n`);
    } catch (err) {
      reportApiErrorAndExit(err);
    }
  });

export const formatsCommand = new Command('formats')
  .description('Browse and publish graphic formats')
  .addCommand(listCmd)
  .addCommand(searchCmd)
  .addCommand(getCmd)
  .addCommand(publishCmd)
  .addCommand(updateCmd)
  .addCommand(deleteCmd);
