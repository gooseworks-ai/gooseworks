import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isManagedGooseworksSkill } from './names';

const SKILLS_BASE = path.join(os.homedir(), '.agents', 'skills');
const GOOSE_SKILLS_TREE_URL = 'https://api.github.com/repos/gooseworks-ai/goose-skills/git/trees/main?recursive=1';
const GOOSE_SKILLS_RAW_BASE = 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/main';
const DOWNLOAD_CONCURRENCY = 6;

interface GitHubTreeEntry {
  path: string;
  type: string;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
}

export interface InstallStandaloneSkillOptions {
  onProgress?: (progress: { downloaded: number; total: number }) => void;
}

export class SkillNotFoundError extends Error {
  constructor(public readonly slug: string, public readonly available: string[]) {
    super(`skill '${slug}' not found`);
    this.name = 'SkillNotFoundError';
  }
}

export function getSkillsBasePath(): string {
  return SKILLS_BASE;
}

export function installMasterSkill(masterSkillMd: string): void {
  const masterDir = path.join(SKILLS_BASE, 'gooseworks');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(
    path.join(masterDir, 'SKILL.md'),
    masterSkillMd,
    'utf-8'
  );
}

export async function installStandaloneSkill(
  slug: string,
  options: InstallStandaloneSkillOptions = {}
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`invalid skill slug '${slug}'. Use a slug like goose-graphics.`);
  }

  const tree = await fetchGooseSkillsTree();
  const { prefix, files } = findSkillFiles(tree, slug);

  if (files.length === 0) {
    throw new SkillNotFoundError(slug, getAvailableSkillSlugs(tree));
  }

  const targetDir = path.join(SKILLS_BASE, slug);
  const stagingDir = path.join(SKILLS_BASE, `.${slug}.installing`);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  let completed = 0;
  try {
    await withConcurrency(files, DOWNLOAD_CONCURRENCY, async (filePath) => {
      const relativePath = filePath.slice(prefix.length);
      const targetPath = path.join(stagingDir, relativePath);
      const buffer = await fetchRawSkillFile(filePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, buffer);
      completed++;
      options.onProgress?.({ downloaded: completed, total: files.length });
    });

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
  if (!fs.existsSync(SKILLS_BASE)) return [];

  return fs.readdirSync(SKILLS_BASE)
    .filter(isManagedGooseworksSkill)
    .filter((entry) => {
      const skillMd = path.join(SKILLS_BASE, entry, 'SKILL.md');
      return fs.existsSync(skillMd);
    });
}

export function removeAllSkills(): void {
  if (!fs.existsSync(SKILLS_BASE)) return;

  const entries = fs.readdirSync(SKILLS_BASE);
  for (const entry of entries) {
    if (!isManagedGooseworksSkill(entry)) continue;
    fs.rmSync(path.join(SKILLS_BASE, entry), { recursive: true, force: true });
  }
}

async function fetchGooseSkillsTree(): Promise<GitHubTreeEntry[]> {
  const response = await fetch(GOOSE_SKILLS_TREE_URL);
  if (!response.ok) {
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error(
        `GitHub API rate-limited this IP.${formatRateLimitWait(response.headers.get('x-ratelimit-reset'))} Set GITHUB_TOKEN to raise the limit.`
      );
    }
    throw new Error(`could not list standalone skills from goose-skills (${response.status})`);
  }

  const data = await response.json() as GitHubTreeResponse;
  return data.tree || [];
}

function formatRateLimitWait(resetHeader: string | null): string {
  if (!resetHeader) return '';
  const resetMs = Number(resetHeader) * 1000;
  if (!Number.isFinite(resetMs)) return '';
  const minutes = Math.max(1, Math.ceil((resetMs - Date.now()) / 60_000));
  return ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function fetchRawSkillFile(filePath: string): Promise<Buffer> {
  const url = `${GOOSE_SKILLS_RAW_BASE}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not download ${filePath} from goose-skills (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
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
