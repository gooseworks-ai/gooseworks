import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getCredentials } from '../auth/credentials';
import { getEnvironment, profileRoot } from '../environment';
import { getSkillsBasePath } from '../skills/installer';
import { getVersion } from '../version';
export { stagingContent } from '../skills/staging-content';

export type StagingAgent = 'claude' | 'codex';
interface Manifest { environment: 'staging'; project: string; version: string; sourceBranch: 'dev'; sourceRevision: string | null; mcpEndpoint: string; agents: StagingAgent[]; skills: Record<string, string>; }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export function projectProfile(project: string): { project: string; root: string; home: string; manifest: string } {
  if (!project) throw new Error('Staging requires --project <folder>');
  const resolved = fs.realpathSync(path.resolve(project));
  if (!fs.statSync(resolved).isDirectory()) throw new Error('--project must be a directory');
  const root = path.join(profileRoot(), 'projects', hash(resolved).slice(0, 20));
  return { project: resolved, root, home: path.join(root, 'home'), manifest: path.join(root, 'manifest.json') };
}

/** Project/parent customizations could reintroduce a production plugin or MCP. */
export function assertCleanProject(project: string): void {
  const userHome = fs.realpathSync(process.env.GOOSEWORKS_USER_HOME || os.homedir());
  for (let dir = project; ; dir = path.dirname(dir)) {
    // User-global roots are excluded by the child home; they must stay installed.
    if (dir !== userHome) {
      for (const name of ['.claude', '.codex', '.agents', '.cursor', '.mcp.json']) {
        if (fs.existsSync(path.join(dir, name))) throw new Error(`Staging cannot safely load project customization ${path.join(dir, name)}. Use a clean test folder outside that project tree.`);
      }
    }
    if (path.dirname(dir) === dir) break;
  }
}

function privateWrite(file: string, body: string, mode = 0o600): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Refusing linked staging config: ${file}`);
  fs.writeFileSync(file, body, { mode }); fs.chmodSync(file, mode);
}

export function installStagingProject(project: string, agents: string[]): Manifest {
  if (getEnvironment() !== 'staging') throw new Error('Project isolation is available with --env staging');
  if (!agents.length || agents.some(agent => !['claude', 'codex'].includes(agent))) throw new Error('Staging supports --claude and --codex. Cursor staging is refused until its skill isolation can be verified.');
  const profile = projectProfile(project); assertCleanProject(profile.project);
  if (fs.existsSync(profile.manifest)) {
    const previous: Manifest = JSON.parse(fs.readFileSync(profile.manifest, 'utf8'));
    for (const agent of previous.agents) stagingLaunch(project, agent);
  }
  const credentials = getCredentials();
  if (!credentials?.mcp_server_url) throw new Error('Staging requires a staging GooseWorks login with an MCP connection. Run gooseworks --env staging login.');
  const skills: Record<string, string> = {};
  const source = getSkillsBasePath();
  for (const name of fs.readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const directory = path.join(source, name);
    if (!fs.statSync(directory).isDirectory() || !fs.existsSync(path.join(directory, 'SKILL.md'))) continue;
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`Linked staging package refused: ${name}`);
    for (const agent of agents) {
      const target = path.join(profile.home, `.${agent}`, 'skills', name);
      // Refuse edits instead of silently destroying previously tested instructions.
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
      fs.cpSync(directory, target, { recursive: true, dereference: false });
    }
    skills[name] = treeHash(directory);
  }
  if (!skills.gooseworks) throw new Error('Install the bundled staging entry skills first');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
  const manifest: Manifest = { environment: 'staging', project: profile.project, version: getVersion(), sourceBranch: 'dev', sourceRevision: pkg.gooseworksRelease?.commit || null, mcpEndpoint: credentials.mcp_server_url, agents: agents as StagingAgent[], skills };
  privateWrite(profile.manifest, JSON.stringify(manifest, null, 2) + '\n');
  writeConnections(profile.home, credentials);
  return manifest;
}

function writeConnections(home: string, credentials: NonNullable<ReturnType<typeof getCredentials>>): void {
  const endpoint = credentials.mcp_server_url!.replace(/\/$/, '');
  const url = endpoint.endsWith('/mcp') ? endpoint : `${endpoint}/mcp`;
  privateWrite(path.join(home, 'mcp.json'), JSON.stringify({ mcpServers: { 'gooseworks-staging': { type: 'http', url, headers: { Authorization: `Bearer ${credentials.api_key}` } } } }));
  // Codex shells can otherwise filter custom environment variables or reset PATH.
  const pinned = { HOME: home, GOOSEWORKS_USER_HOME: process.env.GOOSEWORKS_USER_HOME || os.homedir(), GOOSEWORKS_SESSION_ENV: 'staging', GOOSEWORKS_API_BASE: credentials.api_base, PATH: `${path.join(home, 'bin')}${path.delimiter}${process.env.PATH || ''}` };
  const shell = Object.entries(pinned).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n');
  privateWrite(path.join(home, '.codex', 'config.toml'), `allow_login_shell = false\n[shell_environment_policy]\ninherit = "all"\n[shell_environment_policy.set]\n${shell}\n[mcp_servers.gooseworks-staging]\nurl = ${JSON.stringify(url)}\n[mcp_servers.gooseworks-staging.http_headers]\nAuthorization = ${JSON.stringify(`Bearer ${credentials.api_key}`)}\n`);
}

export function stagingLaunch(project: string, agent: string): { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; home: string; manifest: Manifest } {
  if (!['claude', 'codex'].includes(agent)) throw new Error('Use --agent claude or --agent codex for an isolated staging session');
  const profile = projectProfile(project); assertCleanProject(profile.project);
  const manifest: Manifest = JSON.parse(fs.readFileSync(profile.manifest, 'utf8'));
  if (manifest.environment !== 'staging' || manifest.project !== profile.project || !manifest.agents.includes(agent as StagingAgent)) throw new Error('Project/environment mismatch. Install staging for this project and agent first.');
  const root = path.join(profile.home, `.${agent}`, 'skills');
  const actual = fs.readdirSync(root).filter(name => !name.startsWith('.'));
  if (actual.length !== Object.keys(manifest.skills).length) throw new Error('Unexpected skill in staging profile; reinstall into a fresh test folder');
  for (const [name, expected] of Object.entries(manifest.skills)) {
    const file = path.join(root, name, 'SKILL.md');
    if (treeHash(path.dirname(file)) !== expected) throw new Error(`Staging skill changed or linked: ${name}. Review it and install into a fresh test folder.`);
  }
  const credentials = getCredentials();
  if (!credentials?.mcp_server_url) throw new Error('Sign in to staging again before launching');
  writeConnections(profile.home, credentials);
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Do not carry production Goose tokens, custom provider homes, or daemon handles.
  for (const key of Object.keys(env)) if (/^(GOOSEWORKS_|CODEX_|CLAUDE_|CLAUDECODE$|CURSOR_|XDG_)/.test(key)) delete env[key];
  Object.assign(env, { HOME: profile.home, USERPROFILE: profile.home, XDG_CONFIG_HOME: path.join(profile.home, '.config'), XDG_DATA_HOME: path.join(profile.home, '.local', 'share'), CODEX_HOME: path.join(profile.home, '.codex'), CLAUDE_CONFIG_DIR: path.join(profile.home, '.claude'), GOOSEWORKS_USER_HOME: process.env.GOOSEWORKS_USER_HOME || os.homedir(), GOOSEWORKS_SESSION_ENV: 'staging', GOOSEWORKS_API_BASE: credentials.api_base });
  // Use this exact CLI build inside the agent, even if its PATH has an older global CLI.
  const bin = path.join(profile.home, 'bin');
  if (process.platform === 'win32') throw new Error('Isolated staging launch currently requires macOS or Linux');
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  privateWrite(path.join(bin, 'gooseworks'), `#!/bin/sh\nGOOSEWORKS_SESSION_ENV=staging\nexport GOOSEWORKS_SESSION_ENV\nexec ${quote(process.execPath)} ${quote(path.resolve(__dirname, '..', 'index.js'))} "$@"\n`, 0o700);
  env.PATH = `${bin}${path.delimiter}${process.env.PATH || ''}`;
  return { command: agent, cwd: profile.project, env, home: profile.home, manifest, args: agent === 'claude' ? ['--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', path.join(profile.home, 'mcp.json')] : ['--cd', profile.project] };
}

function treeHash(directory: string): string {
  const digest = createHash('sha256');
  function visit(dir: string): void {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name); const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Linked staging package file refused: ${file}`);
      digest.update(path.relative(directory, file) + '\0');
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) digest.update(fs.readFileSync(file));
      else throw new Error(`Unsupported staging package file: ${file}`);
    }
  }
  visit(directory); return digest.digest('hex');
}

/** Read Claude's startup event and stop before a model request (no provider credential needed). */
export function inspectClaudeSkills(launch: ReturnType<typeof stagingLaunch>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...launch.env, ANTHROPIC_API_KEY: 'sk-ant-gooseworks-inventory-invalid-key' };
    // Inventory must never use a real billable provider connection.
    for (const key of Object.keys(env)) if (/^(ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_USE_|AWS_|GOOGLE_|AZURE_)/.test(key)) delete env[key];
    const child = spawn('claude', [...launch.args, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], { cwd: launch.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let finished = false; let buffer = '';
    const finish = (error?: Error, skills?: string[]) => { if (finished) return; finished = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(skills!); };
    const timer = setTimeout(() => finish(new Error('Claude startup inventory timed out; update Claude and retry')), 30000);
    child.on('error', error => finish(error));
    child.on('exit', () => { if (!finished) finish(new Error('Claude did not provide its skill inventory; update Claude')); });
    child.stderr.on('data', () => undefined);
    child.stdout.on('data', data => {
      buffer += data; if (buffer.length > 2 * 1024 * 1024) return finish(new Error('Invalid Claude startup event'));
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        let message: any; try { message = JSON.parse(buffer.slice(0, end)); } catch { buffer = buffer.slice(end + 1); continue; }
        buffer = buffer.slice(end + 1);
        if (message.type !== 'system' || message.subtype !== 'init') continue;
        if (!Array.isArray(message.skills) || !Array.isArray(message.plugins) || !Array.isArray(message.mcp_servers)) return finish(new Error('Incompatible Claude startup inventory'));
        const expected = Object.keys(launch.manifest.skills);
        if (expected.some(name => !message.skills.includes(name)) || message.skills.some((name: string) => /^(goose|make-custom-video)/.test(name) && !expected.includes(name)) || message.plugins.length || message.mcp_servers.some((server: any) => server.name !== 'gooseworks-staging')) return finish(new Error('Claude loaded an unexpected skill, plugin, or MCP. Staging launch refused.'));
        finish(undefined, message.skills);
      }
    });
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: '/skills' } }) + '\n');
  });
}

/** Real, free Codex discovery. Refuse incompatible versions before starting a session. */
export function inspectCodexSkills(launch: ReturnType<typeof stagingLaunch>): Promise<Array<{ name: string; path: string; enabled: boolean }>> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], { cwd: launch.cwd, env: launch.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = ''; let finished = false; let inventory: any[] | undefined; let configVerified = false;
    const finish = (error?: Error, skills?: any[]) => { if (finished) return; finished = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(skills!); };
    const timer = setTimeout(() => finish(new Error('Codex skill isolation check timed out; update Codex and retry')), 15000);
    child.on('error', error => finish(error));
    child.on('exit', () => { if (!finished) finish(new Error('Codex does not support the staging inventory check; update Codex')); });
    child.stderr.on('data', () => undefined);
    child.stdout.on('data', data => {
      buffer += data; if (buffer.length > 2 * 1024 * 1024) return finish(new Error('Invalid Codex inventory response'));
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message: any; try { message = JSON.parse(line); } catch { continue; }
        if (message.error) return finish(new Error('Codex rejected the staging inventory check; update Codex'));
        if (message.id === 1) {
          child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ id: 2, method: 'skills/list', params: { cwds: [launch.cwd], forceReload: true } }) + '\n');
          child.stdin.write(JSON.stringify({ id: 3, method: 'config/read', params: { cwd: launch.cwd, includeLayers: false } }) + '\n');
        }
        if (message.id === 2) {
          const rows = message.result?.data;
          if (!Array.isArray(rows) || rows.some(row => row.errors?.length)) return finish(new Error('Could not read the complete Codex skill inventory'));
          const skills = rows.flatMap(row => row.skills || []).filter(skill => skill.enabled);
          const allowed = fs.realpathSync(launch.home) + path.sep;
          if (skills.some(skill => !fs.realpathSync(skill.path).startsWith(allowed))) return finish(new Error('Codex discovered skills outside the staging profile. Launch refused.'));
          const names = new Set(skills.map(skill => skill.name));
          if (Object.keys(launch.manifest.skills).some(name => !names.has(name))) return finish(new Error('Codex did not load all staging skills. Launch refused.'));
          inventory = skills.map(skill => ({ name: skill.name, path: skill.path, enabled: skill.enabled }));
          if (configVerified) finish(undefined, inventory);
        }
        if (message.id === 3) {
          const servers = message.result?.config?.mcp_servers;
          const endpoint = launch.manifest.mcpEndpoint.replace(/\/$/, '');
          const expectedUrl = endpoint.endsWith('/mcp') ? endpoint : `${endpoint}/mcp`;
          if (!servers || Object.keys(servers).length !== 1 || !servers['gooseworks-staging'] || servers['gooseworks-staging'].url !== expectedUrl) return finish(new Error('Codex effective MCP configuration is not isolated to staging. Launch refused.'));
          const plugins = message.result?.config?.plugins;
          if (plugins && Object.values(plugins).some((plugin: any) => plugin?.enabled !== false)) return finish(new Error('Codex loaded unexpected plugin configuration. Launch refused.'));
          configVerified = true;
          if (inventory) finish(undefined, inventory);
        }
      }
    });
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'gooseworks-staging-check', version: getVersion() } } }) + '\n');
  });
}
