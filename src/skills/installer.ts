import { resolveStandalonePackages, type StandaloneIndex } from "./standalone-packages";
import * as fs from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import * as os from 'os';
import { ENTRY_SKILL_NAMES, isManagedGooseworksSkill, STAMP_FILE } from './names';
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

// ── Entry skills from the goose-skills catalog ──────────────────────────────
// The entry skills (ENTRY_SKILL_NAMES) live in goose-skills at
// `skills/entry/<name>/`. install, update and the login refresh download them
// (`fetchEntrySkills`) and write each one to <skills folder>/<name>/
// (`installManagedEntrySkills`). Every install is stamped:
//   - `.gooseworks-version` holds the first 16 hex characters of the SKILL.md
//     hash, the format older CLIs wrote, so their installs stay recognized;
//   - `.gooseworks-source.json` records each file's hash, the catalog version
//     and where the files came from.
// A folder whose files no longer match its record is the user's edit and is
// preserved unless they pass --overwrite-modified.

export const ENTRY_SOURCE_FILE = '.gooseworks-source.json';
const ENTRY_DOWNLOAD_TIMEOUT_MS = 30_000;
/** Bookkeeping files that are not part of the skill's content. */
const ENTRY_IGNORED_FILES = new Set([STAMP_FILE, ENTRY_SOURCE_FILE, '.DS_Store']);

export interface EntrySkill {
  /** Install dir name under the skills folder AND the skill `name`. */
  name: string;
  /** The SKILL.md text. */
  content: string;
  /** The skill folder's other files, by path relative to the folder. */
  files?: Record<string, Buffer>;
  /** The catalog's version of this skill. */
  version?: string;
  /** Where the files were downloaded from. */
  source?: string;
}

export interface EntrySkillCatalog {
  /** The goose-skills address the files came from. */
  source: string;
  skills: EntrySkill[];
  /** Entry skill names the catalog does not list. They are left as installed. */
  missing: string[];
}

function entryFiles(skill: EntrySkill): Map<string, Buffer> {
  const files = new Map<string, Buffer>(Object.entries(skill.files || {}));
  files.set('SKILL.md', Buffer.from(skill.content, 'utf-8'));
  return files;
}

function hashFiles(files: Map<string, Buffer>): Record<string, string> {
  return Object.fromEntries([...files.keys()].sort().map((name) => [name, skillContentHash(files.get(name)!)]));
}

/** One hash for a whole skill folder: every file's path and content hash. */
function folderDigest(hashes: Record<string, string>): string {
  return skillContentHash(Object.keys(hashes).sort().map((name) => `${name}\0${hashes[name]}\n`).join(''));
}

/** The digest an installed copy of `skill` has when it is unchanged. */
export function entrySkillDigest(skill: EntrySkill): string {
  return folderDigest(hashFiles(entryFiles(skill)));
}

function isSafeRelativePath(relative: string): boolean {
  return !!relative && !path.isAbsolute(relative) && !relative.includes('\\')
    && relative.split('/').every((part) => part && part !== '.' && part !== '..');
}

function sameHashes(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function isHashRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((hash) => typeof hash === 'string');
}

/** Hashes every regular file in the folder; null when it holds a link or anything else. */
function readEntryFolder(dir: string): Record<string, string> | null {
  const hashes: Record<string, string> = {};
  const visit = (current: string, prefix: string): boolean => {
    for (const name of fs.readdirSync(current)) {
      if (name === '.DS_Store' || (!prefix && ENTRY_IGNORED_FILES.has(name))) continue;
      const file = path.join(current, name);
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) { if (!visit(file, `${prefix}${name}/`)) return false; }
      else if (stat.isFile()) hashes[`${prefix}${name}`] = skillContentHash(fs.readFileSync(file));
      else return false;
    }
    return true;
  };
  return visit(dir, '') ? hashes : null;
}

function hasLinkedEntryPath(dir: string): boolean {
  return [dir, path.join(dir, 'SKILL.md'), path.join(dir, STAMP_FILE), path.join(dir, ENTRY_SOURCE_FILE)]
    .some((file) => fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink());
}

export interface InstalledEntrySkill {
  /** SHA-256 of the installed SKILL.md. */
  hash?: string;
  /** `entrySkillDigest` of the installed folder. */
  digest?: string;
  /** The catalog version recorded at install time (older CLIs recorded none). */
  version?: string;
  /** Edited, linked, or written by something other than the CLI. */
  modified: boolean;
  missing: boolean;
}

export function inspectEntrySkill(name: string): InstalledEntrySkill {
  const dir = path.join(skillsBase(), name);
  try {
    if (hasLinkedEntryPath(dir)) return { modified: true, missing: !fs.existsSync(path.join(dir, 'SKILL.md')) };
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) return { modified: fs.existsSync(dir), missing: true };
    const hash = skillContentHash(fs.readFileSync(path.join(dir, 'SKILL.md')));
    const hashes = readEntryFolder(dir);
    if (!hashes) return { hash, modified: true, missing: false };
    let stamp = '';
    try { stamp = fs.readFileSync(path.join(dir, STAMP_FILE), 'utf-8').trim(); } catch { /* provenance unknown */ }
    let record: { version?: unknown; fileHashes?: unknown } | undefined;
    try { record = JSON.parse(fs.readFileSync(path.join(dir, ENTRY_SOURCE_FILE), 'utf-8')); } catch { /* older CLIs wrote no record */ }
    // An install from an older CLI holds only SKILL.md and the stamp.
    const recorded = isHashRecord(record?.fileHashes) ? record!.fileHashes as Record<string, string> : { 'SKILL.md': hash };
    const modified = !/^[a-f0-9]{16}$/.test(stamp) || hash.slice(0, 16) !== stamp || !sameHashes(hashes, recorded);
    return { hash, digest: folderDigest(hashes), version: typeof record?.version === 'string' ? record.version : undefined, modified, missing: false };
  } catch {
    return { modified: true, missing: false };
  }
}

/** Checks the actual files, not just a stamp left behind before a user edit. */
export function isEntrySkillFresh(skill: EntrySkill): boolean {
  const installed = inspectEntrySkill(skill.name);
  return !installed.missing && installed.digest === entrySkillDigest(skill);
}

/**
 * Write one entry skill with its stamp and record. The folder is built next to
 * the target and swapped in with a rename, so a failure never leaves a
 * half-written folder.
 */
export function installEntrySkill(skill: EntrySkill): void {
  const base = skillsBase();
  const dir = path.join(base, skill.name);
  if (hasLinkedEntryPath(dir)) throw new Error(`Linked ${skill.name} entry preserved; replace the link yourself before installing.`);
  const files = entryFiles(skill);
  for (const name of files.keys()) {
    if (!isSafeRelativePath(name) || ENTRY_IGNORED_FILES.has(name)) throw new Error(`Unsafe file path in ${skill.name}: ${name}`);
  }
  fs.mkdirSync(base, { recursive: true });
  const staging = fs.mkdtempSync(path.join(base, '.entry-installing-'));
  let keepStaging = false;
  try {
    const staged = path.join(staging, skill.name);
    for (const [name, bytes] of files) {
      const target = path.join(staged, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(path.join(staged, STAMP_FILE), skillContentHash(skill.content).slice(0, 16), 'utf-8');
    fs.writeFileSync(path.join(staged, ENTRY_SOURCE_FILE), JSON.stringify({
      environment: getEnvironment(),
      source: skill.source ?? null,
      version: skill.version ?? null,
      fileHashes: hashFiles(files),
    }, null, 2) + '\n', 'utf-8');
    const backup = fs.lstatSync(dir, { throwIfNoEntry: false }) ? path.join(staging, `${skill.name}.previous`) : null;
    if (backup) fs.renameSync(dir, backup);
    try {
      fs.renameSync(staged, dir);
    } catch (error) {
      if (backup) {
        try { fs.renameSync(backup, dir); } catch {
          keepStaging = true;
          throw new Error(`Could not replace ${skill.name}. The previous copy is preserved at ${backup}.`);
        }
      }
      throw error;
    }
  } finally {
    if (!keepStaging) fs.rmSync(staging, { recursive: true, force: true });
  }
}

export interface EntrySkillInstallResult {
  name: string;
  action: 'installed' | 'skipped' | 'preserved';
}

/**
 * Install or refresh entry skills. Preserve edited or untracked files unless
 * the user explicitly allows their replacement. `force` never authorizes data loss.
 */
export function installManagedEntrySkills(
  skills: EntrySkill[],
  { force = false, overwriteModified = false }: { force?: boolean; overwriteModified?: boolean } = {}
): EntrySkillInstallResult[] {
  return skills.map((skill) => {
    const wanted = entrySkillDigest(skill);
    const installed = inspectEntrySkill(skill.name);
    if (installed.modified && installed.digest !== wanted && !overwriteModified) {
      return { name: skill.name, action: 'preserved' };
    }
    if (!force && !installed.modified && !installed.missing && installed.digest === wanted) {
      return { name: skill.name, action: 'skipped' };
    }
    installEntrySkill(skill);
    return { name: skill.name, action: 'installed' };
  });
}

interface IndexEntry { slug?: unknown; path?: unknown; files?: unknown; version?: unknown; metadata?: { version?: unknown } }

/**
 * Download the entry skills from goose-skills (`gooseSkillsSource()`: `main`
 * for production, `dev` for staging, or GOOSE_SKILLS_RAW_BASE). Reads
 * `skills-index.json`, takes each entry skill's listed `files` under
 * `skills/entry/<name>/`, and downloads all of them before returning, so a
 * caller writes nothing unless every file arrived. Staging rewrites `.md` files
 * for the staging server, as standalone installs do.
 */
export async function fetchEntrySkills({ timeoutMs = ENTRY_DOWNLOAD_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<EntrySkillCatalog> {
  const source = gooseSkillsSource();
  const signal = AbortSignal.timeout(timeoutMs);
  const indexBytes = await fetchCatalogFile(source.rawBase, 'skills-index.json', signal);
  let index: { skills?: unknown };
  try { index = JSON.parse(indexBytes.toString('utf8')); } catch { throw new Error('the goose-skills skills-index.json is not valid JSON'); }
  if (!index || !Array.isArray(index.skills)) throw new Error('the goose-skills index has no skills list');
  const entries = index.skills as IndexEntry[];

  const plans: Array<{ name: string; version?: string; files: string[]; prefix: string }> = [];
  const missing: string[] = [];
  for (const name of ENTRY_SKILL_NAMES) {
    const entry = entries.find((candidate) => candidate && candidate.slug === name);
    if (!entry) { missing.push(name); continue; }
    const expected = `skills/entry/${name}`;
    if (entry.path !== expected) throw new Error(`goose-skills lists ${name} at ${String(entry.path)}, not ${expected}`);
    const prefix = `${expected}/`;
    const files = [...new Set(Array.isArray(entry.files) ? entry.files : [])];
    if (files.some((file) => typeof file !== 'string' || !file.startsWith(prefix) || !isSafeRelativePath(file.slice(prefix.length)) || ENTRY_IGNORED_FILES.has(file.slice(prefix.length)))) {
      throw new Error(`goose-skills lists an unsafe file for ${name}`);
    }
    if (!files.includes(`${prefix}SKILL.md`)) throw new Error(`the goose-skills index lists no SKILL.md for ${name}`);
    const version = typeof entry.version === 'string' ? entry.version : typeof entry.metadata?.version === 'string' ? entry.metadata.version : undefined;
    plans.push({ name, version, files: files as string[], prefix });
  }
  if (!plans.some((plan) => plan.name === 'gooseworks')) throw new Error('the goose-skills index has no gooseworks entry skill');

  const downloaded = new Map<string, Buffer>();
  await withConcurrency(plans.flatMap((plan) => plan.files), DOWNLOAD_CONCURRENCY, async (file) => {
    downloaded.set(file, await fetchCatalogFile(source.rawBase, file, signal));
  });

  const staging = getEnvironment() === 'staging';
  const skills = plans.map((plan): EntrySkill => {
    let content = '';
    const files: Record<string, Buffer> = {};
    for (const file of plan.files) {
      const relative = file.slice(plan.prefix.length);
      let bytes = downloaded.get(file)!;
      if (staging && relative.endsWith('.md')) bytes = Buffer.from(stagingContent(bytes.toString('utf8')), 'utf-8');
      if (relative === 'SKILL.md') content = bytes.toString('utf8');
      else files[relative] = bytes;
    }
    return { name: plan.name, content, files, version: plan.version, source: source.rawBase };
  });
  return { source: source.rawBase, skills, missing };
}

async function fetchCatalogFile(rawBase: string, filePath: string, signal: AbortSignal): Promise<Buffer> {
  const url = `${rawBase}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    const reason = signal.aborted ? 'timed out' : error instanceof Error ? error.message : String(error);
    throw new Error(`could not reach goose-skills for ${filePath} (${reason})`);
  }
  if (!response.ok) throw new Error(`could not download ${filePath} from goose-skills (${response.status})`);
  return assertNotLfsPointer(Buffer.from(await response.arrayBuffer()), filePath);
}

function assertNotLfsPointer(buffer: Buffer, filePath: string): Buffer {
  if (buffer.subarray(0, 100).toString().startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Unresolved Git LFS asset in ${filePath}`);
  return buffer;
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

async function fetchGooseSkillsRevision(source: { repo: string; ref: string }, signal?: AbortSignal): Promise<string> {
  // A tree SHA is not a commit SHA: raw.githubusercontent requires the commit.
  const url = `https://api.github.com/repos/${source.repo}/commits/${source.ref.split('/').map(encodeURIComponent).join('/')}`;
  const commitResponse = await (signal ? fetch(url, { signal }) : fetch(url));
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
  const response = await fetch(`https://api.github.com/repos/${source.repo}/git/trees/${revision}?recursive=1`);
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
  return assertNotLfsPointer(Buffer.from(await response.arrayBuffer()), filePath);
}
