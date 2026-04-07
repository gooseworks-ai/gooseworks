import { Command } from 'commander';
import { ensureLoggedIn } from './login';
import { installMasterSkill, removeAllSkills } from '../skills/installer';
import { configureClaude } from '../agents/claude';
import { configureCursor } from '../agents/cursor';
import { detectAgents, type AgentType } from '../agents/detect';
import * as logger from '../utils/logger';
import { getMasterSkillContent } from '../skills/master-skill';
import { API_BASE } from '../config';

export const installCommand = new Command('install')
  .description('Install GooseWorks data tools into your coding agent')
  .option('--claude', 'Configure for Claude Code')
  .option('--cursor', 'Configure for Cursor')
  .option('--all', 'Configure for all detected agents')
  .option('--api-base <url>', 'API base URL', API_BASE)
  .action(async (opts) => {
    logger.banner('0.1.0');

    // Determine which agents to configure
    const targetAgents = resolveTargetAgents(opts);
    if (targetAgents.length === 0) {
      logger.error('No agent specified. Use --claude, --cursor, or --all');
      process.exit(1);
    }

    // Step 1: Authenticate
    logger.step(1, 3, 'Authenticating...');
    const creds = await ensureLoggedIn(opts.apiBase);
    logger.success(`Logged in as ${creds.email}`);

    // Step 2: Install master skill (clean old skills first)
    logger.step(2, 3, 'Installing GooseWorks skill...');
    removeAllSkills();
    const masterContent = getMasterSkillContent(creds.api_base);
    installMasterSkill(masterContent);
    logger.success('Installed GooseWorks skill to ~/.agents/skills/gooseworks-master/');

    // Step 3: Configure agents
    logger.step(3, 3, 'Configuring agents...');
    for (const agent of targetAgents) {
      if (agent === 'claude') {
        logger.info('Creating symlinks in ~/.claude/skills/');
        configureClaude();
        logger.success('Claude Code configured');
      }
      if (agent === 'cursor') {
        logger.info('Writing MCP config for Cursor');
        configureCursor();
        logger.success('Cursor configured');
      }
    }

    // Done
    const agentNames = targetAgents.map((a) =>
      a === 'claude' ? 'Claude Code' : 'Cursor'
    ).join(' and ');
    logger.done(
      `Setup complete! Open ${agentNames} and say "/gooseworks find me leads" to get started.`
    );
  });

function resolveTargetAgents(opts: {
  claude?: boolean;
  cursor?: boolean;
  all?: boolean;
}): AgentType[] {
  if (opts.all) {
    const detected = detectAgents();
    if (detected.length === 0) {
      logger.warn('No coding agents detected. Installing skills only.');
      return ['claude']; // Default to claude file layout
    }
    return detected.map((a) => a.type);
  }

  const targets: AgentType[] = [];
  if (opts.claude) targets.push('claude');
  if (opts.cursor) targets.push('cursor');
  return targets;
}
