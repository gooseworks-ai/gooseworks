import { resolveStandalonePackages, type StandaloneIndex } from "./standalone-packages";
import * as fs from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import * as os from 'os';
import { isManagedGooseworksSkill, STAMP_FILE } from './names';
import type { EntrySkill } from './master-skill';
import { skillContentHash } from './releases';
import { getEnvironment, profileRoot, sourceBranch } from '../environment';
import { stagingContent } from './staging-content';
import { apiEnvironment, kitApiBase } from '../kit/env';

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
 * selected environment's branch. The override must be https with no
 * credentials, query or fragment; plain http is allowed only for this
 * computer while the CLI itself talks to a local server.
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
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && apiEnvironment(kitApiBase(env)) === 'local';
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
  const existingTarget = fs.lstatSync(targetDir, { throwIfNoEntry: false });
  if (existingTarget && !options.overwriteModified) {
    if (existingTarget.isSymbolicLink?.()) throw new Error(`Existing ${slug} package preserved. Replace the directory link yourself before installing a different package.`);
    let replacement: string | undefined;
    try {
      const signal = AbortSignal.timeout(5000);
      const source = githubSource();
      const revision = await fetchGooseSkillsRevision(source, signal);
      const index = JSON.parse((await fetchRawSkillFile(source.repo, 'skills-index.json', revision, signal)).toString('utf8')) as StandaloneIndex;
      const retired = index.retired_skills?.find(entry => entry.slug === slug);
      if (retired && /^[a-z0-9][a-z0-9-]*$/.test(retired.replacement) && index.skills.some(entry => entry.slug === retired.replacement)) replacement = retired.replacement;
    } catch { /* Offline or invalid metadata must never replace a local package. */ }
    if (replacement) throw new Error(`Skill "${slug}" was retired. Use "${replacement}" instead. Existing ${slug} package preserved.`);
    throw new Error(`Existing ${slug} package preserved. Back it up and pass --overwrite-modified to replace it; approved projects keep their pinned package.`);
  }

  const source = githubSource();
  const { tree, revision } = await fetchGooseSkillsTree(source);
  const indexBytes = await fetchRawSkillFile(source.repo, 'skills-index.json', revision);
  const packages = resolveStandalonePackages(JSON.parse(indexBytes.toString('utf8')) as StandaloneIndex, slug).map(entry => {
    const files = tree.filter(file => file.type === 'blob' && file.path.startsWith(entry.prefix)).map(file => file.path);
    if (!files.includes(`${entry.prefix}SKILL.md`)) throw new Error(`Incomplete package for ${entry.slug}`);
    const target = path.join(skillsBase(), entry.slug);
    return { ...entry, files, target };
  });
  fs.mkdirSync(skillsBase(), { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(skillsBase(), '.packages-installing-'));
  const changed: Array<{ target: string; backup: string | null }> = [];
  const reused = new Set<string>();
  let completed = 0;
  let cleanupSafe = true;
  const total = packages.reduce((sum, entry) => sum + entry.files.length, 0);
  try {
    for (const entry of packages) {
      const stagingDir = path.join(stagingRoot, entry.slug);
      const fileHashes: Record<string, string> = {};
      await withConcurrency(entry.files, DOWNLOAD_CONCURRENCY, async filePath => {
        const relativePath = filePath.slice(entry.prefix.length);
        if (relativePath.split('/').some(part => !part || part === '..' || part === '.') || path.isAbsolute(relativePath)) throw new Error('Unsafe skill file path');
        const targetPath = path.join(stagingDir, relativePath);
        const downloaded = await fetchRawSkillFile(source.repo, filePath, revision);
        const buffer = getEnvironment() === 'staging' && relativePath.endsWith('.md') ? Buffer.from(stagingContent(downloaded.toString('utf8'))) : downloaded;
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, buffer);
        fileHashes[relativePath] = createHash('sha256').update(buffer).digest('hex');
        options.onProgress?.({ downloaded: ++completed, total });
      });
      fs.writeFileSync(path.join(stagingDir, STAMP_FILE), `standalone:${entry.slug}`, 'utf-8');
      fs.writeFileSync(path.join(stagingDir, '.gooseworks-source.json'), JSON.stringify({ environment: getEnvironment(), repository: source.repo, branch: source.ref, revision, fileHashes }) + '\n');
    }
    // Compare real files after downloading the required revision. An unchanged
    // shared dependency is reusable; edited, linked or untracked files are preserved.
    for (const entry of packages) {
      if (!fs.lstatSync(entry.target, { throwIfNoEntry: false })) continue;
      if (entry.slug !== slug && matchesStandalonePackage(entry.target, path.join(stagingRoot, entry.slug))) reused.add(entry.slug);
      else if (!options.overwriteModified) throw new Error(`Existing ${entry.slug} package preserved. Back it up and pass --overwrite-modified to replace it.`);
    }
    // Commit only after every download succeeded; roll back if a rename fails.
    for (const entry of packages) {
      if (reused.has(entry.slug)) continue;
      let backup: string | null = null;
      if (fs.lstatSync(entry.target, { throwIfNoEntry: false })) {
        backup = path.join(stagingRoot, `${entry.slug}.previous`);
        fs.renameSync(entry.target, backup);
      }
      changed.push({ target: entry.target, backup });
      fs.renameSync(path.join(stagingRoot, entry.slug), entry.target);
    }
  } catch (error) {
    for (const entry of changed.reverse()) {
      try {
        fs.rmSync(entry.target, { recursive: true, force: true });
        if (entry.backup) fs.renameSync(entry.backup, entry.target);
      } catch {
        cleanupSafe = false;
      }
    }
    if (!cleanupSafe) throw new Error(`Install failed. Recovery copies are preserved at ${stagingRoot}.`);
    throw error;
  } finally {
    if (cleanupSafe) fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

}

function matchesStandalonePackage(target: string, staged: string): boolean {
  try {
    if (!fs.lstatSync(target).isDirectory()) return false;
    const existing = JSON.parse(fs.readFileSync(path.join(target, '.gooseworks-source.json'), 'utf8'));
    const required = JSON.parse(fs.readFileSync(path.join(staged, '.gooseworks-source.json'), 'utf8'));
    if (existing.repository !== required.repository || existing.environment !== required.environment || !existing.fileHashes) return false;
    if (fs.readFileSync(path.join(target, STAMP_FILE), 'utf8') !== fs.readFileSync(path.join(staged, STAMP_FILE), 'utf8')) return false;
    const actual: Record<string, string> = {};
    const visit = (dir: string, prefix = ''): boolean => {
      for (const name of fs.readdirSync(dir)) {
        const relative = prefix + name;
        const file = path.join(dir, name);
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) return false;
        if (stat.isDirectory()) { if (!visit(file, relative + '/')) return false; }
        else if (stat.isFile()) {
          if (!prefix && [STAMP_FILE, '.gooseworks-source.json'].includes(name)) continue;
          actual[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        } else return false;
      }
      return true;
    };
    return visit(target) && Object.keys(actual).length === Object.keys(required.fileHashes).length &&
      Object.entries(required.fileHashes).every(([name, hash]) => actual[name] === hash && existing.fileHashes[name] === hash);
  } catch { return false; }
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

function fetchGitHubApi(url: string, signal?: AbortSignal): Promise<Response> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return fetch(url, { signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function fetchGooseSkillsRevision(source: { repo: string; ref: string }, signal?: AbortSignal): Promise<string> {
  // A tree SHA is not a commit SHA: raw.githubusercontent requires the commit.
  const url = `https://api.github.com/repos/${source.repo}/commits/${source.ref.split('/').map(encodeURIComponent).join('/')}`;
  const commitResponse = await fetchGitHubApi(url, signal);
  if (!commitResponse.ok) {
    if (commitResponse.status === 403 && commitResponse.headers.get('x-ratelimit-remaining') === '0') throw new Error(`GitHub API rate-limited this IP.${formatRateLimitWait(commitResponse.headers.get('x-ratelimit-reset'))} Set GITHUB_TOKEN to raise the limit.`);
    throw new Error(`could not resolve standalone skill revision (${commitResponse.status})`);
  }
  const commit = await commitResponse.json() as { sha?: string };
  if (!commit.sha || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid standalone skill commit');
  return commit.sha;
}

async function fetchGooseSkillsTree(source: { repo: string; ref: string }): Promise<{ tree: GitHubTreeEntry[]; revision: string }> {
  const revision = await fetchGooseSkillsRevision(source);
  const response = await fetchGitHubApi(`https://api.github.com/repos/${source.repo}/git/trees/${revision}?recursive=1`);
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
  return { tree: data.tree || [], revision };
}

function formatRateLimitWait(resetHeader: string | null): string {
  if (!resetHeader) return '';
  const resetMs = Number(resetHeader) * 1000;
  if (!Number.isFinite(resetMs)) return '';
  const minutes = Math.max(1, Math.ceil((resetMs - Date.now()) / 60_000));
  return ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function fetchRawSkillFile(repo: string, filePath: string, revision: string, signal?: AbortSignal): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/${repo}/${revision}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await (signal ? fetch(url, { signal }) : fetch(url));
  if (!response.ok) {
    throw new Error(`could not download ${filePath} from goose-skills (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Unresolved Git LFS asset in ${filePath}`);
  return buffer;
}
