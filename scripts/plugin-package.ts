/** Review-only exports. Skills stay owned by getEntrySkills(), not this builder. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { getEntrySkills } from '../src/skills/master-skill';

export const REPO = resolve(__dirname, '..');
export const ACTIVE_SKILLS = ['gooseworks', 'goose-ads', 'goose-product-photos', 'goose-video', 'make-custom-video'];
export type Target = 'portable' | 'openai';
export type Files = Map<string, Buffer>;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const readJson = (path: string) => JSON.parse(readSafe(path).toString('utf8'));

function readSafe(path: string): Buffer {
  const full = resolve(REPO, path);
  if (!full.startsWith(REPO + sep)) throw new Error(`Source escapes repository: ${path}`);
  let part = REPO;
  for (const name of relative(REPO, full).split(sep)) {
    part = join(part, name);
    if (lstatSync(part).isSymbolicLink()) throw new Error(`Source symlink: ${path}`);
  }
  return readFileSync(full);
}

function assertTarget(target: string): asserts target is Target {
  if (!['portable', 'openai'].includes(target)) throw new Error(`Unknown target: ${target}`);
}

/** Only the frontmatter envelope changes. Workflow Markdown remains byte-identical. */
export function portableSkill(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('Skill needs YAML frontmatter');
  const fields: { name: string; lines: string[] }[] = [];
  for (const line of match[1].split('\n')) {
    const key = line.match(/^([a-z][a-z0-9_-]*):(?:\s.*)?$/);
    if (key) fields.push({ name: key[1], lines: [line] });
    else if (/^\s+/.test(line) && fields.length) fields[fields.length - 1].lines.push(line);
    else throw new Error('Unsupported skill frontmatter; review before exporting');
  }
  const names = fields.map(field => field.name);
  if (new Set(names).size !== names.length || !names.includes('name') || !names.includes('description') || names.includes('metadata')) {
    throw new Error('Changed skill frontmatter; review before exporting');
  }
  const standard = ['name', 'description', 'license', 'compatibility', 'allowed-tools'];
  const kept = fields.filter(field => standard.includes(field.name)).map(field => field.lines.join('\n'));
  const extras = fields.filter(field => !standard.includes(field.name));
  if (extras.length) kept.push('metadata:\n' + extras.map(field =>
    `  gooseworks-${field.name}: ${JSON.stringify(field.lines.join('\n').slice(field.name.length + 1).trim())}`).join('\n'));
  return `---\n${kept.join('\n')}\n---\n${content.slice(match[0].length)}`;
}

/** Shared listing facts come from the portable manifest, never a second provider copy. */
function openAiExtension(manifest: { description: string; author: { name: string }; homepage: string }) {
  const extension = readJson('plugins/openai/extension.json');
  return { ...extension, interface: { ...extension.interface,
    longDescription: manifest.description, developerName: manifest.author.name, websiteURL: manifest.homepage } };
}

/** Metadata completeness only. Reviewer-account execution and portal checks stay external. */
export function openAiReviewReadiness(files: Files) {
  const manifest = JSON.parse(files.get('plugin.json')!.toString());
  const extension = manifest.extensions?.['com.openai'];
  const cases = extension?.review?.test_cases;
  const demo = extension?.review?.demo_recording_url;
  const missing = [];
  if (cases?.positive?.length !== 5) missing.push('five positive review cases');
  if (cases?.negative?.length !== 3) missing.push('three negative review cases');
  if (typeof demo !== 'string' || !/^https:\/\//.test(demo)) missing.push('verified accessible demo recording URL');
  if (!extension?.publication?.release_notes?.trim()) missing.push('release notes');
  return { positiveCases: cases?.positive?.length ?? 0, negativeCases: cases?.negative?.length ?? 0,
    metadataComplete: missing.length === 0, missing,
    status: 'Draft candidate; dedicated reviewer-account case execution and portal checks require separate evidence.' };
}

/** Build an explicit file set; private review material is never traversed or copied. */
export function collectPluginFiles(target: Target): Files {
  assertTarget(target);
  const entries = getEntrySkills();
  const expected = [...ACTIVE_SKILLS, 'goose-video-local'].sort();
  if (JSON.stringify(entries.map(s => s.name).sort()) !== JSON.stringify(expected)) {
    throw new Error('Entry registry changed: review the plugin skill allowlist before exporting');
  }
  const manifest = readJson('plugins/plugin.json');
  if (target === 'openai') manifest.extensions = { 'com.openai': openAiExtension(manifest) };
  const files: Files = new Map([
    ['plugin.json', json(manifest)],
    ['mcp.json', readSafe('plugins/mcp.json')],
    ['assets/logo.png', readSafe('plugins/assets/logo.png')],
    ['LICENSE', readSafe('LICENSE')],
    ['README.md', readSafe('plugins/PACKAGE-README.md')],
  ]);
  for (const name of ACTIVE_SKILLS) {
    const content = Buffer.from(entries.find(s => s.name === name)!.content);
    const shipped = readSafe(`skills/${name}/SKILL.md`);
    if (!content.equals(shipped)) throw new Error(`Stale generated skill: ${name}; run npm run generate:skills`);
    files.set(`skills/${name}/SKILL.md`, Buffer.from(portableSkill(content.toString())));
  }
  validateFiles(files, target);
  const inputPaths = ['src/skills/master-skill.ts', 'src/skills/server-entry-skills.ts', 'src/skills/routes.ts',
    'plugins/plugin.json', 'plugins/mcp.json', 'plugins/PACKAGE-README.md', 'plugins/assets/logo.png',
    'scripts/plugin-package.ts', 'scripts/export-plugin.ts', 'package.json',
    'plugins/schemas/plugin.schema.json', 'plugins/schemas/mcp.schema.json',
    'LICENSE', ...(target === 'openai' ? ['plugins/openai/extension.json'] : [])];
  const hashMap = (items: Files) => Object.fromEntries([...items].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, sha256(bytes)]));
  // A generated export must survive the commit which adds that export. Pin the
  // most recent canonical-input commit, rather than its own output commit.
  const commit = execFileSync('git', ['log', '-1', '--format=%H', '--', ...inputPaths], { cwd: REPO, encoding: 'utf8' }).trim();
  const inputState = execFileSync('git', ['status', '--porcelain', '--', ...inputPaths], { cwd: REPO, encoding: 'utf8' }).trim() ? 'modified' : 'clean';
  files.set('source-lock.json', json({ format: 1, target, pluginVersion: manifest.version,
    source: { repository: 'https://github.com/gooseworks-ai/gooseworks', commit, inputState, cliVersion: readJson('package.json').version },
    inputs: hashMap(new Map(inputPaths.map(path => [path, readSafe(path)]))),
    skills: Object.fromEntries(ACTIVE_SKILLS.map(name => [name, {
      sourceSha256: sha256(Buffer.from(entries.find(skill => skill.name === name)!.content)),
      exportedSha256: sha256(files.get(`skills/${name}/SKILL.md`)!),
      transformation: 'agent-skills-frontmatter-v1',
    }])),
    files: hashMap(files),
  }));
  return files;
}

/** Strict release policy for these candidates, narrower than the full portable schema. */
export function validateFiles(files: Files, target: Target): void {
  assertTarget(target);
  const allowed = ['plugin.json', 'mcp.json', 'assets/logo.png', 'LICENSE', 'README.md', 'source-lock.json',
    ...ACTIVE_SKILLS.map(name => `skills/${name}/SKILL.md`)];
  for (const [name, bytes] of files) {
    if (!allowed.includes(name) || name.includes('..') || name.startsWith('/')) throw new Error(`Unexpected package path: ${name}`);
    if (bytes.subarray(0, 100).toString().includes('version https://git-lfs.github.com/spec/v1')) throw new Error(`LFS pointer: ${name}`);
    if (name !== 'assets/logo.png' && /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-|live-|test-)[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|https?:\/\/[^\s/]+:[^\s/@]+@)/.test(bytes.toString())) {
      throw new Error(`Possible credential in ${name}`);
    }
  }
  for (const path of allowed.filter(name => name !== 'source-lock.json')) {
    if (!files.has(path)) throw new Error(`Missing package file: ${path}`);
  }
  const manifest = JSON.parse(files.get('plugin.json')!.toString());
  const keys = ['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
  if (Object.keys(manifest).some(key => !keys.includes(key)) || manifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' ||
      manifest.name !== 'gooseworks' || manifest.version !== readJson('plugins/plugin.json').version ||
      !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Unexpected plugin identity/schema');
  if (target === 'portable' && manifest.extensions) throw new Error('Portable candidate contains provider fields');
  if (target === 'openai') {
    const extension = manifest.extensions?.['com.openai'];
    if (JSON.stringify(extension) !== JSON.stringify(openAiExtension(manifest))) throw new Error('OpenAI public listing or country restrictions changed');
    if ('apps' in extension || 'hooks' in extension) throw new Error('Public OpenAI candidates cannot reference apps or lifecycle hooks');
    const review = extension.review;
    if (review) {
      if ('test_credentials' in review || 'reviewer_instructions' in review) throw new Error('Private reviewer details cannot ship');
      if (review.test_cases?.positive?.length !== 5 || review.test_cases?.negative?.length !== 3) throw new Error('Review metadata needs five positive and three negative cases');
      for (const item of [...review.test_cases.positive, ...review.test_cases.negative]) {
        for (const key of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) {
          if (typeof item[key] !== 'string' || !item[key].trim()) throw new Error(`Missing review case field: ${key}`);
        }
      }
    }
    for (const key of ['logo', 'composerIcon']) {
      const path = extension.interface[key];
      if (!path.startsWith('./') || !files.has(path.slice(2))) throw new Error(`Missing manifest asset: ${path}`);
    }
  }
  const mcp = JSON.parse(files.get('mcp.json')!.toString());
  const expectedMcp = { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { gooseworks: { type: 'streamable-http', url: 'https://mcp.gooseworks.ai/mcp' } } };
  if (JSON.stringify(mcp) !== JSON.stringify(expectedMcp)) throw new Error('MCP must use only the production endpoint, without fallback or credentials');
  if (!files.get('assets/logo.png')!.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Logo is not a PNG');
  for (const name of ACTIVE_SKILLS) {
    const body = files.get(`skills/${name}/SKILL.md`)!.toString();
    if (!body.startsWith(`---\nname: ${name}\n`) || !body.includes('description:')) throw new Error(`Invalid skill identity: ${name}`);
    if (!body.includes('catalog_fetch') && name !== 'goose-product-photos') throw new Error(`Missing hosted workflow: ${name}`);
  }
}

// Standard-library ZIP writer: fixed epoch, paths, permissions and ordering.
// Python is a preparation-only dependency, never shipped or run by the installed plugin.
export function makeZip(files: Files): Buffer {
  const script = [
    'import base64, io, json, sys, zipfile',
    'output = io.BytesIO()',
    'with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:',
    ' for name, encoded in json.load(sys.stdin):',
    '  info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))',
    '  info.create_system = 3',
    '  info.external_attr = 0o100644 << 16',
    '  archive.writestr(info, base64.b64decode(encoded))',
    'sys.stdout.buffer.write(output.getvalue())',
  ].join('\n');
  const input = JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, bytes.toString('base64')]));
  return execFileSync('python3', ['-c', script], { input, maxBuffer: 16 * 1024 * 1024 });
}

export function safeDestination(output: string, base = join(REPO, '.plugin-build')) {
  const full = resolve(output);
  if (!full.startsWith(base + sep)) throw new Error(`Output must be a new directory below ${relative(REPO, base)}/`);
  let part = REPO;
  for (const name of relative(REPO, full).split(sep)) {
    part = join(part, name);
    let stat;
    try { stat = lstatSync(part); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink() || !realpathSync(part).startsWith(REPO + sep)) throw new Error('Output symlink or escaped path');
  }
  return full;
}

/** Existing directories are immutable: --check verifies; build always needs a fresh path. */
export function buildPlugin(target: Target, output = join(REPO, '.plugin-build', target)) {
  const full = safeDestination(output);
  if (existsSync(full)) throw new Error(`Output already exists; use --check or choose a fresh output: ${full}`);
  const files = collectPluginFiles(target);
  const archive = makeZip(files);
  mkdirSync(full, { recursive: true });
  const packageRoot = join(full, 'gooseworks');
  for (const [name, bytes] of files) {
    const path = join(packageRoot, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' });
  }
  writeFileSync(join(full, 'gooseworks.zip'), archive, { flag: 'wx' });
  checkPlugin(target, full);
  return { directory: packageRoot, archive: join(full, 'gooseworks.zip'), archiveSha256: sha256(archive),
    ...(target === 'openai' ? { reviewReadiness: openAiReviewReadiness(files) } : {}) };
}

export function checkPackageDirectory(target: Target, packageRoot: string) {
  const expected = collectPluginFiles(target);
  const actual: Files = new Map();
  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Package symlink: ${path}`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) actual.set(relative(packageRoot, path).split(sep).join('/'), readFileSync(path));
      else throw new Error(`Unsupported package entry: ${path}`);
    }
  }
  if (lstatSync(packageRoot).isSymbolicLink()) throw new Error('Package root is a symlink');
  walk(packageRoot);
  validateFiles(actual, target);
  if (actual.size !== expected.size || [...expected].some(([name, bytes]) => !actual.get(name)?.equals(bytes))) throw new Error('Candidate differs from current canonical source');
  return actual;
}

export function checkPlugin(target: Target, output = join(REPO, '.plugin-build', target)) {
  const full = safeDestination(output);
  const actual = checkPackageDirectory(target, join(full, 'gooseworks'));
  const archivePath = join(full, 'gooseworks.zip');
  if (lstatSync(archivePath).isSymbolicLink() || !readFileSync(archivePath).equals(makeZip(actual))) throw new Error('Archive differs from reviewed package');
}
