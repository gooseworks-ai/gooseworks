/**
 * Generic publish/update orchestration shared by the styles and formats
 * commands.  Handles manifest read + validate + slug overlay, multipart
 * upload, and the 409 slug-collision retry loop.
 */

import * as path from 'path';
import {
  ManifestEscapingPathError,
  ManifestMissingFileError,
  ManifestParseError,
  readManifestFile,
  resolveExampleFiles,
  type ValidationResult,
  type ResolvedExampleFile,
} from '../../lib/graphics-manifest';
import { ApiError, type WriteResult } from '../../lib/graphics-api';
import {
  EXIT_USER_ERROR,
  promptYesNo,
  reportApiErrorAndExit,
} from './shared';

export interface PublishConfig {
  manifestFilename: string;
  validate: (manifest: unknown) => ValidationResult;
  /** Hub URL to print on success, e.g. `https://app.gooseworks.ai/styles/<slug>`. */
  hubUrl: (slug: string) => string;
  /** Resource label used in user-facing messages: 'style' or 'format'. */
  label: 'style' | 'format';
  /** Performs the create/update upload. Returns the new slug + id. */
  upload: (manifest: Record<string, unknown>, files: ResolvedExampleFile[]) => Promise<WriteResult>;
}

export interface PublishOptions {
  /** Defaults to process.cwd(). */
  dir?: string;
  /** Override the manifest's slug at publish time. */
  slug?: string;
  /** Skip interactive prompts. */
  yes?: boolean;
}

interface ErrorBody {
  error?: string;
  errors?: Array<string | { path?: string; message?: string }>;
  file?: string;
  suggested_slug?: string;
  message?: string;
}

function formatValidationErrors(errors: ValidationResult['errors']): string {
  return errors.map((e) => `  • ${e}`).join('\n');
}

function formatServerValidationErrors(body: ErrorBody | undefined): string {
  if (!body?.errors) return '';
  return body.errors
    .map((e) => {
      if (typeof e === 'string') return `  • ${e}`;
      if (e.path) return `  • ${e.path}: ${e.message ?? 'invalid'}`;
      return `  • ${e.message ?? 'invalid'}`;
    })
    .join('\n');
}

export async function runPublishFlow(
  cfg: PublishConfig,
  opts: PublishOptions
): Promise<void> {
  await runWriteFlow(cfg, opts, /* allowSlugRetry */ true);
}

export async function runUpdateFlow(
  cfg: PublishConfig,
  opts: PublishOptions
): Promise<void> {
  // Update has no slug-collision retry — the slug is already locked.
  await runWriteFlow(cfg, opts, /* allowSlugRetry */ false);
}

async function runWriteFlow(
  cfg: PublishConfig,
  opts: PublishOptions,
  allowSlugRetry: boolean
): Promise<void> {
  const dir = path.resolve(opts.dir ?? process.cwd());
  const manifestPath = path.join(dir, cfg.manifestFilename);

  let manifest: Record<string, unknown>;
  try {
    manifest = readManifestFile(manifestPath) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ManifestParseError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(EXIT_USER_ERROR);
    }
    throw err;
  }

  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    process.stderr.write(`${cfg.manifestFilename} must contain a JSON object.\n`);
    process.exit(EXIT_USER_ERROR);
  }

  if (opts.slug) {
    manifest.slug = opts.slug;
  }

  validateOrExit(cfg, manifest);

  const examples = (manifest.examples as ReadonlyArray<{ file: string }> | undefined) ?? [];
  let files: ResolvedExampleFile[];
  try {
    files = resolveExampleFiles(dir, examples);
  } catch (err) {
    if (err instanceof ManifestMissingFileError) {
      process.stderr.write(
        `Manifest references file '${err.missing}' but it doesn't exist in ${dir}.\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    if (err instanceof ManifestEscapingPathError) {
      process.stderr.write(
        `Manifest references file '${err.ref}' which escapes the manifest directory ${dir}.\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    throw err;
  }

  const result = await uploadOrExit(cfg, opts, manifest, files, allowSlugRetry);
  process.stdout.write(
    `${cfg.label === 'style' ? 'Published style' : 'Published format'}: ${result.slug}\n` +
      `${cfg.hubUrl(result.slug)}\n`
  );
}

function validateOrExit(cfg: PublishConfig, manifest: unknown): void {
  const validation = cfg.validate(manifest);
  if (!validation.ok) {
    process.stderr.write(
      `Manifest validation failed:\n${formatValidationErrors(validation.errors)}\n`
    );
    process.exit(EXIT_USER_ERROR);
  }
}

async function uploadOrExit(
  cfg: PublishConfig,
  opts: PublishOptions,
  manifest: Record<string, unknown>,
  files: ResolvedExampleFile[],
  allowSlugRetry: boolean
): Promise<WriteResult> {
  try {
    return await cfg.upload(manifest, files);
  } catch (err) {
    if (!(err instanceof ApiError)) reportApiErrorAndExit(err);

    const body = (err.body || {}) as ErrorBody;
    if (err.status === 400 && body.error === 'validation_failed') {
      const lines = formatServerValidationErrors(body);
      process.stderr.write(`Server validation failed${lines ? `:\n${lines}` : ''}\n`);
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 400 && body.error === 'missing_file') {
      process.stderr.write(
        `Server says file '${body.file ?? '?'}' is missing from the upload.\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 400 && body.error === 'manifest_parse') {
      process.stderr.write(
        `Server could not parse manifest: ${body.message ?? 'unknown'}\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 413) {
      process.stderr.write(
        `File too large: ${body.file ?? 'one of the uploaded files'} (max 10 MB).\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 403) {
      process.stderr.write(
        `You don't own this ${cfg.label}. Only its author can update or delete it.\n`
      );
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 409 && body.error === 'slug_taken' && allowSlugRetry) {
      return await retryWithSuggestedSlug(cfg, opts, manifest, files, body);
    }
    reportApiErrorAndExit(err);
  }
}

async function retryWithSuggestedSlug(
  cfg: PublishConfig,
  opts: PublishOptions,
  manifest: Record<string, unknown>,
  files: ResolvedExampleFile[],
  body: ErrorBody
): Promise<WriteResult> {
  const suggested = body.suggested_slug;
  if (!suggested) {
    process.stderr.write(`Slug taken and the server didn't suggest an alternative.\n`);
    process.exit(EXIT_USER_ERROR);
  }
  const accept =
    opts.yes ||
    (await promptYesNo(
      `Slug '${manifest.slug ?? '?'}' is taken. Use '${suggested}' instead?`,
      true
    ));
  if (!accept) {
    process.stderr.write(`Aborted: slug collision unresolved.\n`);
    process.exit(EXIT_USER_ERROR);
  }
  manifest.slug = suggested;
  // Re-run client validation: the server's suggestion could in principle
  // fail our slug grammar, and shipping a broken value to the server
  // produces an opaque second error rather than a clean local message.
  validateOrExit(cfg, manifest);
  try {
    return await cfg.upload(manifest, files);
  } catch (retryErr) {
    reportApiErrorAndExit(retryErr);
  }
}
