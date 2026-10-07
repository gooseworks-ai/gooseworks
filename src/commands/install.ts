import { Command } from 'commander';
import { ensureLoggedIn } from './login';
import { installManagedEntrySkills, installStandaloneSkill } from '../skills/installer';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp, verifyMcpReachable } from '../agents/claude-mcp';
import { configureCodex, configureCodexMcp } from '../agents/codex';
import { configureCursor } from '../agents/cursor';
import { detectAgents, type AgentType } from '../agents/detect';
import * as logger from '../utils/logger';
import { getEntrySkills } from '../skills/master-skill';
import { API_BASE } from '../config';
import { getVersion } from '../version';
import { runDoctorChecks } from './doctor';
import { readEntryFreshnessReport, reportEntrySkillFreshness } from './skills';
import { getEnvironment } from '../environment';
import { assertCleanProject, installStagingProject, projectProfile, stagingContent } from '../agents/staging';

interface InstallOptions {
  claude?: boolean;
  codex?: boolean;
  cursor?: boolean;
  all?: boolean;
  mcp?: boolean;
  apiBase?: string;
  with?: string[];
  ref?: string;
  overwriteModified?: boolean;
  project?: string;
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
  .option('--overwrite-modified', 'Replace edited or untracked managed skill files after you back them up')
  .option('--mcp', 'Also register the GooseWorks MCP server')
  .option('--with <skill-slug>', 'Also install a standalone GooseWorks skill (repeatable)', collectSkillSlug, [])
  .option('--api-base <url>', 'API base URL', API_BASE)
  .option('--ref <code>', 'Referral or marketing campaign code for attribution')
  .option('--project <folder>', 'Required staging test folder; used only by gooseworks launch')
  .action(async (opts: InstallOptions) => {
    logger.banner(getVersion());

    const targetAgents = resolveTargetAgents(opts);
    if (getEnvironment() === 'staging') {
      if (targetAgents.some(agent => agent === 'cursor')) throw new Error('Cursor staging isolation is not verified. Use --claude or --codex.');
      assertCleanProject(projectProfile(opts.project || '').project);
      await ensureLoggedIn(opts.apiBase, opts.ref);
      const entries = getEntrySkills().map(skill => ({ ...skill, content: stagingContent(skill.content) }));
      const results = installManagedEntrySkills(entries, { overwriteModified: opts.overwriteModified });
      if (results.some(result => result.action === 'preserved')) throw new Error('Staging entry has edits. Review/back up the files before --overwrite-modified.');
      for (const slug of opts.with || []) await installStandaloneSkill(slug, { overwriteModified: opts.overwriteModified });
      installStagingProject(opts.project!, targetAgents);
      logger.done(`Staging installed. Start a new isolated session: gooseworks --env staging launch --agent ${targetAgents[0]} --project ${JSON.stringify(opts.project)}`);
      return;
    }
    if (opts.project) throw new Error('--project is for isolated staging installs; omit it for the normal production install');
    if (targetAgents.length === 0) {
      logger.error('No agent specified. Use --claude, --codex, --cursor, or --all');
      process.exit(1);
    }

    // --all implies MCP
    const wantMcp = !!(opts.mcp || opts.all);

    // Step 1: Authenticate
    logger.step(1, 3, 'Authenticating...');
    const creds = await ensureLoggedIn(opts.apiBase, opts.ref);
    logger.success(`Logged in as ${creds.email}`);

    // Step 2: Refresh bundled entries; preserve standalone and edited copies.
    const freshness = await readEntryFreshnessReport();
    await reportEntrySkillFreshness(freshness);
    if (freshness.cli === 'outdated') {
      logger.error('Entry refresh refused: upgrade this CLI before installing its bundled instructions. No skill files were changed.');
      process.exit(1);
      return;
    }
    logger.step(2, 3, 'Installing GooseWorks skills...');
    for (const r of installManagedEntrySkills(getEntrySkills(), { overwriteModified: opts.overwriteModified })) {
      if (r.action === 'preserved') logger.warn(`Preserved edited or untracked ${r.name}; review/back up before --overwrite-modified.`);
      else logger.success(`${r.action === 'installed' ? 'Installed' : 'Kept'} ${r.name} skill at ~/.agents/skills/${r.name}/`);
    }
    for (const slug of opts.with || []) {
      try {
        logger.info(`Installing standalone skill ${slug}...`);
        let lastReported = 0;
        await installStandaloneSkill(slug, {
          overwriteModified: opts.overwriteModified,
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
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Could not install standalone skill ${slug}: ${message}`);
      }
    }

    // Step 3: Configure agents
    logger.step(3, 3, 'Configuring agents...');
    for (const agent of targetAgents) {
      if (agent === 'claude') {
        logger.info('Creating symlinks in ~/.claude/skills/');
        // Skill linking must never abort MCP registration — on Windows a symlink
        // privilege error used to throw here and skip MCP entirely (GOOSE-2418).
        try {
          configureClaude();
        } catch (err) {
          logger.warn(
            `Skill linking failed: ${err instanceof Error ? err.message : String(err)}. ` +
              'Continuing — the MCP server will still be registered.'
          );
        }
        if (wantMcp) {
          if (configureClaudeMcp()) {
            logger.success("Registered 'gooseworks' MCP server in ~/.claude.json");
            // Ads creation REQUIRES a reachable MCP server — verify and fail loud.
            const mcp = await verifyMcpReachable();
            if (mcp.ok) {
              logger.success('GooseWorks MCP server reachable');
            } else {
              logger.warn(
                `GooseWorks MCP server NOT reachable (${mcp.error}). Ads creation requires it — ` +
                  'restart Claude Code and check your connection; the goose-ads skill will fail without MCP.'
              );
            }
          } else {
            logger.info("Skipped MCP (no mcp_server_url in credentials — older backend?)");
          }
        }
        logger.success('Claude Code configured');
      }
      if (agent === 'codex') {
        logger.info('Creating symlinks in ~/.codex/skills/');
        try {
          configureCodex();
        } catch (err) {
          logger.warn(
            `Skill linking failed: ${err instanceof Error ? err.message : String(err)}. ` +
              'Continuing — the MCP server will still be registered.'
          );
        }
        if (wantMcp) {
          if (configureCodexMcp()) {
            logger.success("Registered 'gooseworks' MCP server in ~/.codex/config.toml");
            const mcp = await verifyMcpReachable();
            if (mcp.ok) {
              logger.success('GooseWorks MCP server reachable');
            } else {
              logger.warn(
                `GooseWorks MCP server NOT reachable (${mcp.error}). Ads creation requires it — ` +
                  'restart Codex and check your connection; the goose-ads skill will fail without MCP.'
              );
            }
          } else {
            logger.info("Skipped MCP (no mcp_server_url in credentials — older backend?)");
          }
        }
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

    // General setup only; selected renderers are checked after they are fetched.
    reportLocalVideoToolchain();

    const agentNames = targetAgents.map((a) =>
      a === 'claude' ? 'Claude Code' : a === 'codex' ? 'Codex' : 'Cursor'
    ).join(' and ');
    logger.done(`Setup complete! Open ${agentNames} and ask for the work you want done.`);

    console.log('');
    if (wantMcp) {
      logger.info('You do not need a special onboarding command. Ask GooseWorks to do a normal task, or say:');
      logger.example('Set up GooseWorks for https://yourcompany.com');
      logger.info('The agent preserves that request while it completes any missing company setup.');
    } else {
      const flag = targetAgents.length === 1 ? `--${targetAgents[0]}` : '--all';
      logger.info('Shared onboarding needs the GooseWorks MCP connection. Enable it with:');
      logger.example(`gooseworks install ${flag} --mcp`);
    }
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

function reportLocalVideoToolchain(): void {
  let missing: ReturnType<typeof runDoctorChecks>;
  try {
    missing = runDoctorChecks({ includeAuth: false }).filter((c) => !c.ok);
  } catch {
    return; // a broken probe must never fail the install
  }
  if (missing.length === 0) {
    logger.success('Local video toolchain ready for general setup (ffmpeg, ffprobe, Playwright Chromium, Node). Check the selected renderer with `gooseworks doctor --renderer-script <path>` before paid work.');
    return;
  }
  logger.info('Video ads are made on this machine and need these tools. To make them here, install:');
  for (const c of missing) {
    logger.warn(`  ${c.label}  →  ${c.fix}`);
  }
  logger.info('Then run `gooseworks doctor` for general setup; check the selected browser renderer with `--renderer-script <path>` before paid work.');
}

function collectSkillSlug(value: string, previous: string[]): string[] {
  return [...previous, value];
}
