import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isManagedGooseworksSkill, STAMP_FILE } from './names';
import type { EntrySkill } from './master-skill';
import { skillContentHash } from './releases';
import { getEnvironment, profileRoot, sourceBranch } from '../environment';
import { stagingContent } from './staging-content';

/** The goose-skills repository the CLI installs skills and loads kit parts from. */
export const GOOSE_SKILLS_REPO = 'gooseworks-ai/goose-skills';
/** Today's goose-skills origin. Staging reads the `dev` branch instead. */
export const GOOSE_SKILLS_RAW_BASE = `https://raw.githubusercontent.com/${GOOSE_SKILLS_REPO}/main`;
/** Overrides the origin, for example to test a branch: https://raw.githubusercontent.com/gooseworks-ai/goose-skills/video-merged */
export const GOOSE_SKILLS_RAW_BASE_ENV = 'GOOSE_SKILLS_RAW_BASE';

export interface GooseSkillsSource {
  /** Files live at `<rawBase>/<path>`. No trailing slash. */
  rawBase: string;
  /** Set when the origin is a GitHub repository, which skill installs need to list files. */
  github?: { repo: string; ref: string };
}

/**
 * Where goose-skills files come from: GOOSE_SKILLS_RAW_BASE when set, else the
 * selected environment's branch. The override must be https (plain http only
 * on this computer) with no credentials, query or fragment.
 */
export function gooseSkillsSource(env: NodeJS.ProcessEnv = process.env): GooseSkillsSource {
  const raw = env[GOOSE_SKILLS_RAW_BASE_ENV]?.trim();
  if (!raw) {
    const ref = sourceBranch();
    return { rawBase: `https://raw.githubusercontent.com/${GOOSE_SKILLS_REPO}/${ref}`, github: { repo: GOOSE_SKILLS_REPO, ref } };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${GOOSE_SKILLS_RAW_BASE_ENV} is not a web address.`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${GOOSE_SKILLS_RAW_BASE_ENV} must use https.`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${GOOSE_SKILLS_RAW_BASE_ENV} must be a plain address with no login, query or fragment.`);
  const rawBase = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  if (url.hostname !== 'raw.githubusercontent.com') return { rawBase };
  const [owner, repo, ...ref] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo || ref.length === 0) throw new Error(`${GOOSE_SKILLS_RAW_BASE_ENV} must name a repository and branch: https://raw.githubusercontent.com/<owner>/<repo>/<branch>.`);
  return { rawBase, github: { repo: `${owner}/${repo}`, ref: ref.join('/') } };
}

function githubSource(): { repo: string; ref: string } {
  const source = gooseSkillsSource();
  if (!source.github) throw new Error(`Skill installs need a GitHub address in ${GOOSE_SKILLS_RAW_BASE_ENV}: https://raw.githubusercontent.com/<owner>/<repo>/<branch>.`);
  return source.github;
}

// Production keeps its existing discovery path. Staging is never auto-discovered.
function skillsBase(): string { return getEnvironment() === 'staging' ? path.join(profileRoot(), 'skills') : path.join(os.homedir(), '.agents', 'skills'); }
const DOWNLOAD_CONCURRENCY = 6;

interface GitHubTreeEntry {
  path: string;
  type: string;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
  sha?: string;
  truncated?: boolean;
}

export interface InstallStandaloneSkillOptions {
  onProgress?: (progress: { downloaded: number; total: number }) => void;
  overwriteModified?: boolean;
}

export function getSkillsBasePath(): string {
  return skillsBase();
}

export function installMasterSkill(masterSkillMd: string): void {
  const masterDir = path.join(skillsBase(), 'gooseworks');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(
    path.join(masterDir, 'SKILL.md'),
    masterSkillMd,
    'utf-8'
  );
}

// ── Vendored entry-skill freshness ──────────────────────────────────────────
// Entry skills (gooseworks, goose-ads, goose-video, goose-product-photos) are
// vendored in the CLI and written to
// ~/.agents/skills/<name>/. We stamp each install with a content hash so we can
// skip rewriting an unchanged skill ("already local → don't call") and rewrite
// only when the vendored content changed ("updated → call again"). Recipe skills
// are fetched from the connected catalog; saved packages carry their reported hashes.

function entryContentHash(content: string): string {
  return skillContentHash(content).slice(0, 16);
}

function hasLinkedEntryPath(dir: string): boolean {
  return [dir, path.join(dir, 'SKILL.md'), path.join(dir, STAMP_FILE)]
    .some((file) => fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink());
}

export function inspectEntrySkill(name: string): { hash?: string; modified: boolean; missing: boolean } {
  const dir = path.join(skillsBase(), name);
  try {
    if (hasLinkedEntryPath(dir)) return { modified: true, missing: !fs.existsSync(path.join(dir, 'SKILL.md')) };
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return { modified: fs.existsSync(dir), missing: true };
    const hash = skillContentHash(fs.readFileSync(path.join(dir, 'SKILL.md')));
    let stamp = '';
    try { stamp = fs.readFileSync(path.join(dir, STAMP_FILE), 'utf-8').trim(); } catch { /* provenance unknown */ }
    return { hash, modified: !/^[a-f0-9]{16}$/.test(stamp) || hash.slice(0, 16) !== stamp, missing: false };
  } catch {
    return { modified: true, missing: false };
  }
}

/** Checks the actual file, not just a stamp left behind before a user edit. */
export function isEntrySkillFresh(name: string, content: string): boolean {
  return inspectEntrySkill(name).hash === skillContentHash(content);
}

/** Write one entry skill + its freshness stamp. */
export function installEntrySkill(skill: EntrySkill): void {
  const dir = path.join(skillsBase(), skill.name);
  if (hasLinkedEntryPath(dir)) throw new Error(`Linked ${skill.name} entry preserved; replace the link yourself before installing.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill.content, 'utf-8');
  fs.writeFileSync(path.join(dir, STAMP_FILE), entryContentHash(skill.content), 'utf-8');
}

export interface EntrySkillInstallResult {
  name: string;
  action: 'installed' | 'skipped' | 'preserved';
}

/**
 * Refresh bundled entry skills. Preserve edited or untracked files unless the
 * user explicitly allows their replacement. `force` never authorizes data loss.
 */
export function installManagedEntrySkills(
  skills: EntrySkill[],
  { force = false, overwriteModified = false }: { force?: boolean; overwriteModified?: boolean } = {}
): EntrySkillInstallResult[] {
  return skills.map((skill) => {
    const installed = inspectEntrySkill(skill.name);
    if (installed.modified && installed.hash !== skillContentHash(skill.content) && !overwriteModified) {
      return { name: skill.name, action: 'preserved' };
    }
    if (!force && !installed.modified && isEntrySkillFresh(skill.name, skill.content)) {
      return { name: skill.name, action: 'skipped' };
    }
    installEntrySkill(skill);
    return { name: skill.name, action: 'installed' };
  });
}

export async function installStandaloneSkill(
  slug: string,
  options: InstallStandaloneSkillOptions = {}
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`invalid skill slug '${slug}'. Use a slug like goose-graphics.`);
  }
  const targetDir = path.join(skillsBase(), slug);
  if (fs.lstatSync(targetDir, { throwIfNoEntry: false }) && !options.overwriteModified) {
    // Legacy standalone stamps contain no file hashes. Do not guess whether a
    // saved recipe was edited; explicit replacement is required for those too.
    throw new Error(`Existing ${slug} package preserved. Back it up and pass --overwrite-modified to replace it; approved projects keep their pinned package.`);
  }

  const source = githubSource();
  const { tree, revision } = await fetchGooseSkillsTree(source);
  const { prefix, files } = findSkillFiles(tree, slug);

  if (files.length === 0) {
    const available = getAvailableSkillSlugs(tree);
    const suffix = available.length > 0 ? ` Available: ${available.join(', ')}` : '';
    throw new Error(`skill '${slug}' not found.${suffix}`);
  }

  const stagingDir = path.join(skillsBase(), `.${slug}.installing`);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  let completed = 0;
  try {
    await withConcurrency(files, DOWNLOAD_CONCURRENCY, async (filePath) => {
      const relativePath = filePath.slice(prefix.length);
      const targetPath = path.join(stagingDir, relativePath);
      const downloaded = await fetchRawSkillFile(source.repo, filePath, revision);
      const buffer = getEnvironment() === 'staging' && relativePath.endsWith('.md') ? Buffer.from(stagingContent(downloaded.toString('utf8'))) : downloaded;
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
      completed++;
      options.onProgress?.({ downloaded: completed, total: files.length });
    });

    // Stamp the staged tree BEFORE it becomes the live dir, so a standalone
    // skill is recognisably ours on the next install (GOOSE-3191). Without a
    // stamp `removeAllSkills()` leaves it alone — safe, but it then goes stale
    // until the user re-installs it.
    fs.writeFileSync(path.join(stagingDir, STAMP_FILE), `standalone:${slug}`, 'utf-8');
    fs.writeFileSync(path.join(stagingDir, '.gooseworks-source.json'), JSON.stringify({ environment: getEnvironment(), repository: source.repo, branch: source.ref, revision }) + '\n');
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, targetDir);
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  let failure: unknown;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length && failure === undefined) {
      const idx = cursor++;
      try {
        await worker(items[idx]);
      } catch (err) {
        if (failure === undefined) failure = err;
      }
    }
  });
  await Promise.all(runners);
  if (failure !== undefined) throw failure;
}

function findSkillFiles(tree: GitHubTreeEntry[], slug: string): { prefix: string; files: string[] } {
  const skillMarker = `${slug}/SKILL.md`;
  const skillEntry = tree.find((entry) =>
    entry.type === 'blob' && (entry.path === skillMarker || entry.path.endsWith(`/${skillMarker}`))
  );

  if (skillEntry) {
    const prefix = skillEntry.path.slice(0, -'SKILL.md'.length);
    return {
      prefix,
      files: tree
        .filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
        .map((entry) => entry.path),
    };
  }

  return { prefix: `${slug}/`, files: [] };
}

export function getInstalledSkills(): string[] {
  if (!fs.existsSync(skillsBase())) return [];

  return fs.readdirSync(skillsBase())
    .filter((entry) => isManagedGooseworksSkill(entry, skillsBase()))
    .filter((entry) => {
      const skillMd = path.join(skillsBase(), entry, 'SKILL.md');
      return fs.existsSync(skillMd);
    });
}

/**
 * Delete every skill directory the CLI itself installed.
 *
 * GOOSE-3191: this used to delete ANY `goose-*` / `gooseworks-*` directory, so a
 * user's own third-party skill (e.g. `goose-notes`) was destroyed on every
 * install / update / login. It now deletes only known entry-skill slugs and
 * directories carrying our `.gooseworks-version` stamp — see `names.ts`.
 * An unstamped directory that isn't a known entry slug is NEVER removed.
 */
export function removeAllSkills(): void {
  if (!fs.existsSync(skillsBase())) return;

  const entries = fs.readdirSync(skillsBase());
  for (const entry of entries) {
    if (!isManagedGooseworksSkill(entry, skillsBase())) continue;
    fs.rmSync(path.join(skillsBase(), entry), { recursive: true, force: true });
  }
}

async function fetchGooseSkillsTree(source: { repo: string; ref: string }): Promise<{ tree: GitHubTreeEntry[]; revision: string }> {
  // A tree SHA is not a commit SHA: raw.githubusercontent requires the commit.
  const commitResponse = await fetch(`https://api.github.com/repos/${source.repo}/commits/${source.ref.split('/').map(encodeURIComponent).join('/')}`);
  if (!commitResponse.ok) {
    if (commitResponse.status === 403 && commitResponse.headers.get('x-ratelimit-remaining') === '0') throw new Error(`GitHub API rate-limited this IP.${formatRateLimitWait(commitResponse.headers.get('x-ratelimit-reset'))} Set GITHUB_TOKEN to raise the limit.`);
    throw new Error(`could not resolve standalone skill revision (${commitResponse.status})`);
  }
  const commit = await commitResponse.json() as { sha?: string };
  if (!commit.sha || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid standalone skill commit');
  const response = await fetch(`https://api.github.com/repos/${source.repo}/git/trees/${commit.sha}?recursive=1`);
  if (!response.ok) {
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error(
        `GitHub API rate-limited this IP.${formatRateLimitWait(response.headers.get('x-ratelimit-reset'))} Set GITHUB_TOKEN to raise the limit.`
      );
    }
    throw new Error(`could not list standalone skills from goose-skills (${response.status})`);
  }

  const data = await response.json() as GitHubTreeResponse;
  if (data.truncated) throw new Error('Incomplete standalone skill tree');
  return { tree: data.tree || [], revision: commit.sha };
}

function formatRateLimitWait(resetHeader: string | null): string {
  if (!resetHeader) return '';
  const resetMs = Number(resetHeader) * 1000;
  if (!Number.isFinite(resetMs)) return '';
  const minutes = Math.max(1, Math.ceil((resetMs - Date.now()) / 60_000));
  return ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function fetchRawSkillFile(repo: string, filePath: string, revision: string): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/${repo}/${revision}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not download ${filePath} from goose-skills (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Unresolved Git LFS asset in ${filePath}`);
  return buffer;
}

function getAvailableSkillSlugs(tree: GitHubTreeEntry[]): string[] {
  const slugs = new Set<string>();
  for (const entry of tree) {
    if (entry.type !== 'blob' || !entry.path.endsWith('/SKILL.md')) continue;

    const parts = entry.path.split('/');
    const slug = parts[parts.length - 2];
    if (slug) {
      slugs.add(slug);
    }
  }
  return [...slugs].sort();
}
