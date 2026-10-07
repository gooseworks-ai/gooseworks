import * as os from 'os';
import * as path from 'node:path';

export type GooseEnvironment = 'production' | 'staging';
let selected: GooseEnvironment = 'production';

export function selectEnvironment(value: string): void {
  if (value !== 'production' && value !== 'staging') throw new Error('--env must be production or staging');
  selected = value;
}
export function getEnvironment(): GooseEnvironment { return selected; }
export function profileRoot(): string {
  // A launched agent has a different home, but uses the same selected Goose login.
  return path.join(process.env.GOOSEWORKS_USER_HOME || os.homedir(), '.gooseworks', 'profiles', selected);
}
export function sourceBranch(): 'main' | 'dev' { return selected === 'staging' ? 'dev' : 'main'; }

/** Bootstrap before importing command modules, whose defaults read config. */
export function consumeEnvironment(args: string[]): string[] {
  const result: string[] = []; let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { result.push(...args.slice(i)); break; }
    if (arg === '--env' || arg.startsWith('--env=')) {
      if (value !== undefined) throw new Error('Pass --env only once');
      value = arg === '--env' ? args[++i] : arg.slice(6);
      if (!value) throw new Error('--env requires production or staging');
    } else result.push(arg);
  }
  // A staging launcher pins child commands too; an explicit production override is refused.
  const pinned = process.env.GOOSEWORKS_SESSION_ENV;
  if (pinned && value && value !== pinned) throw new Error('This agent session is pinned to staging. Start a separate production session.');
  selectEnvironment(value || pinned || 'production');
  return result;
}

export function assertConnection(value: string, kind: 'api' | 'mcp'): void {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${kind} connection URL`);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && selected === 'production' && ['http:', 'https:'].includes(url.protocol)) return;
  if (url.protocol !== 'https:') throw new Error(`${kind} connection must use HTTPS`);
  const staged = url.hostname.endsWith('.staging.gooseworks.ai');
  if (selected === 'staging' ? !staged : staged) throw new Error(`${kind} connection does not match --env ${selected}. Sign in to that environment again.`);
  const allowed = kind === 'api'
    ? ['api.gooseworks.ai', 'app.gooseworks.ai', 'api.staging.gooseworks.ai']
    : ['mcp.gooseworks.ai', 'sandbox-mcp.gooseworks.ai', 'mcp.staging.gooseworks.ai'];
  if (!allowed.includes(url.hostname)) throw new Error(`Unrecognized ${kind} connection host`);
  if (kind === 'api' && url.pathname !== '/' && url.pathname !== '') throw new Error('API base must be an origin');
}
