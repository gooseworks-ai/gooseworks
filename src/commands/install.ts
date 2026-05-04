import { Command } from 'commander';
import { ensureLoggedIn } from './login';
import { installMasterSkill, installStandaloneSkill, removeAllSkills, SkillNotFoundError } from '../skills/installer';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp } from '../agents/claude-mcp';
import { configureCodex } from '../agents/codex';
import { configureCursor } from '../agents/cursor';
import { detectAgents, type AgentType } from '../agents/detect';
import * as logger from '../utils/logger';
import { getMasterSkillContent } from '../skills/master-skill';
import { API_BASE } from '../config';
import { getVersion } from '../version';

interface InstallOptions {
  claude?: boolean;
  codex?: boolean;
  cursor?: boolean;
  all?: boolean;
  mcp?: boolean;
  apiBase?: string;
  with?: string[];
}

export function createInstallCommand(): Command {
  return new Command('install')
  .description(`Install GooseWorks data tools into your coding agent

Examples:
  $ gooseworks install --claude --with goose-graphics
  $ gooseworks install --claude --with goose-graphics --with goose-aeo`)
  .option('--claude', 'Configure for Claude Code')
  .option('--codex', 'Configure for Codex')
  .option('--cursor', 'Configure for Cursor')
  .option('--all', 'Configure for all detected agents (implies --mcp)')
  .option('--mcp', 'Also register the GooseWorks MCP server')
  .option('--with <skill-slug>', 'Also install a standalone GooseWorks skill (repeatable)', collectSkillSlug, [])
  .option('--api-base <url>', 'API base URL', API_BASE)
  .action(async (opts: InstallOptions) => {
    logger.banner(getVersion());

    const targetAgents = resolveTargetAgents(opts);
    if (targetAgents.length === 0) {
      logger.error('No agent specified. Use --claude, --codex, --cursor, or --all');
      process.exit(1);
    }

    // --all implies MCP
    const wantMcp = !!(opts.mcp || opts.all);

    // Step 1: Authenticate
    logger.step(1, 3, 'Authenticating...');
    const creds = await ensureLoggedIn(opts.apiBase);
    logger.success(`Logged in as ${creds.email}`);

    // Step 2: Install master skill (clean old skills first)
    logger.step(2, 3, 'Installing GooseWorks skill...');
    removeAllSkills();
    const masterContent = getMasterSkillContent();
    installMasterSkill(masterContent);
    logger.success('Installed GooseWorks skill to ~/.agents/skills/gooseworks/');
    for (const slug of opts.with || []) {
      try {
        logger.info(`Installing standalone skill ${slug}...`);
        let lastReported = 0;
        await installStandaloneSkill(slug, {
          onProgress: ({ downloaded, total }) => {
            const step = Math.max(1, Math.min(5, Math.ceil(total / 10)));
            if (downloaded === total || downloaded - lastReported >= step) {
              logger.info(`  Downloaded ${downloaded}/${total} files for ${slug}`);
              lastReported = downloaded;
            }
          },
        });
        logger.success(`Installed standalone skill ${slug} to ~/.agents/skills/${slug}/`);
      } catch (error) {
        if (error instanceof SkillNotFoundError) {
          logger.error(`Could not install standalone skill ${slug}: skill not found.`);
          if (error.available.length > 0) {
            logger.info(`Available skills (${error.available.length}):`);
            for (const s of error.available) logger.bullet(s);
          }
        } else {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`Could not install standalone skill ${slug}: ${message}`);
        }
      }
    }

    // Step 3: Configure agents
    logger.step(3, 3, 'Configuring agents...');
    for (const agent of targetAgents) {
      if (agent === 'claude') {
        logger.info('Creating symlinks in ~/.claude/skills/');
        configureClaude();
        if (wantMcp) {
          if (configureClaudeMcp()) {
            logger.success("Registered 'gooseworks' MCP server in ~/.claude.json");
          } else {
            logger.info("Skipped MCP (no mcp_server_url in credentials — older backend?)");
          }
        }
        logger.success('Claude Code configured');
      }
      if (agent === 'codex') {
        logger.info('Creating symlinks in ~/.codex/skills/');
        configureCodex();
        logger.success('Codex configured');
      }
      if (agent === 'cursor') {
        if (wantMcp) {
          logger.info('Writing MCP config for Cursor');
          const result = configureCursor({ mcp: wantMcp });
          logger.success(`Global config: ${result.globalPath}`);
          if (result.projectPath) {
            logger.success(`Project config: ${result.projectPath}`);
          } else {
            logger.info('No .cursor/ project directory found — skipped project-level config');
          }
          if (!result.wroteMcp) {
            logger.info("Skipped MCP (no mcp_server_url in credentials — older backend?)");
          }
        } else {
          logger.info('No MCP flag passed; skipping Cursor MCP config. (Pass --mcp to register the GooseWorks MCP server.)');
        }
        logger.success('Cursor configured');
      }
    }

    const agentNames = targetAgents.map((a) =>
      a === 'claude' ? 'Claude Code' : a === 'codex' ? 'Codex' : 'Cursor'
    ).join(' and ');
    logger.done(`Setup complete! Open ${agentNames} and try one of these:`);
    logger.example('/gooseworks find people who know <linkedin-profile-url>');
    logger.example('/gooseworks find what <linkedin-profile-url> has been posting about');
    logger.example('/gooseworks find leads similar to <linkedin-company-url>');
    logger.example('/gooseworks research <company name>');
    console.log('');
  });
}

export const installCommand = createInstallCommand();

function resolveTargetAgents(opts: InstallOptions): AgentType[] {
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
  if (opts.codex) targets.push('codex');
  if (opts.cursor) targets.push('cursor');
  return targets;
}

function collectSkillSlug(value: string, previous: string[]): string[] {
  return [...previous, value];
}
