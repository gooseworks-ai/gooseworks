import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { getEnvironment } from '../environment';
import { inspectClaudeSkills, inspectCodexSkills, stagingLaunch } from '../agents/staging';

export const launchCommand = new Command('launch')
  .description('Start a fresh agent session that can load only staging GooseWorks skills and MCP')
  .requiredOption('--project <folder>', 'The clean folder to test in')
  .requiredOption('--agent <name>', 'claude or codex')
  .option('--inspect', 'Check isolation and print a token-free inventory without starting an AI request')
  .option('--login', 'Sign in to the agent provider inside the isolated profile')
  .action(async (options: { project: string; agent: string; inspect?: boolean; login?: boolean }) => {
    try {
      if (getEnvironment() !== 'staging') throw new Error('Use gooseworks --env staging launch; use your normal agent command for production');
      const launch = stagingLaunch(options.project, options.agent);
      const skills = options.agent === 'codex' ? await inspectCodexSkills(launch) : await inspectClaudeSkills(launch);
      if (options.inspect) {
        console.log(JSON.stringify({ environment: 'staging', project: launch.cwd, agent: launch.command, version: launch.manifest.version, skills, mcp: 'gooseworks-staging' }, null, 2));
        return;
      }
      console.log(`Starting ${launch.command} with staging GooseWorks only. This profile has its own agent-provider login.`);
      const args = options.login ? (options.agent === 'codex' ? ['login'] : ['auth', 'login']) : launch.args;
      const child = spawn(launch.command, args, { cwd: launch.cwd, env: launch.env, stdio: 'inherit' });
      child.on('error', () => { console.error(`Could not start ${launch.command}. Install that agent CLI first.`); process.exitCode = 1; });
      child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
    } catch (error) { console.error(error instanceof Error ? error.message : 'Staging launch failed'); process.exitCode = 1; }
  });
