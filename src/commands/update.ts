import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { installManagedEntrySkills } from '../skills/installer';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp } from '../agents/claude-mcp';
import { configureCodex, configureCodexMcp } from '../agents/codex';
import { configureCursor, hasExistingCursorMcpEntry } from '../agents/cursor';
import { isAgentInstalled } from '../agents/detect';
import { getEntrySkills } from '../skills/master-skill';
import * as logger from '../utils/logger';
import { readEntryFreshnessReport, reportEntrySkillFreshness } from './skills';
import { getEnvironment } from '../environment';
import { installStagingProject, stagingContent, stagingLaunch } from '../agents/staging';

export const updateCommand = new Command('update')
  .description('Refresh entry skills from this installed CLI; preserve edited files and saved recipes')
  .option('--overwrite-modified', 'Replace edited or untracked managed entry files after you back them up')
  .option('--project <folder>', 'Required for the staging installation to refresh')
  .action(async (opts: { overwriteModified?: boolean; project?: string }) => {
    if (getEnvironment() === 'staging') {
      if (!opts.project) throw new Error('Staging update requires --project <folder>');
      const { projectProfile } = await import('../agents/staging');
      const fs = await import('node:fs');
      const manifest = JSON.parse(fs.readFileSync(projectProfile(opts.project).manifest, 'utf8'));
      for (const agent of manifest.agents) stagingLaunch(opts.project, agent);
      const results = installManagedEntrySkills(getEntrySkills().map(skill => ({ ...skill, content: stagingContent(skill.content) })), { overwriteModified: opts.overwriteModified });
      if (results.some(result => result.action === 'preserved')) throw new Error('Review/back up edited staging entry files before --overwrite-modified');
      installStagingProject(opts.project, manifest.agents);
      logger.done('Staging updated. Close the previous staging session and launch a fresh one.');
      return;
    }
    if (opts.project) throw new Error('This is a staging project install. Pass --env staging update --project <folder>.');
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const freshness = await readEntryFreshnessReport();
    await reportEntrySkillFreshness(freshness);
    if (freshness.cli === 'outdated') {
      logger.error('Entry refresh refused: upgrade this CLI before installing its bundled instructions. No skill files were changed.');
      process.exit(1);
      return;
    }
    logger.step(1, 2, 'Updating skills...');
    for (const r of installManagedEntrySkills(getEntrySkills(), { overwriteModified: opts.overwriteModified })) {
      if (r.action === 'preserved') logger.warn(`Preserved edited or untracked ${r.name}; review/back up before --overwrite-modified.`);
      else logger.success(`${r.action === 'installed' ? 'Updated' : 'Kept'} ${r.name} skill`);
    }

    logger.step(2, 2, 'Reconfiguring agents...');

    if (isAgentInstalled('claude')) {
      configureClaude();
      logger.success('Claude Code symlinks updated');

      if (creds.mcp_server_url) {
        if (configureClaudeMcp()) {
          logger.success('Claude Code MCP config refreshed');
        }
      }
    }

    if (isAgentInstalled('codex')) {
      configureCodex();
      logger.success('Codex symlinks updated');

      if (creds.mcp_server_url) {
        if (configureCodexMcp()) {
          logger.success('Codex MCP config refreshed');
        }
      }
    }

    if (isAgentInstalled('cursor')) {
      if (hasExistingCursorMcpEntry()) {
        const result = configureCursor({ mcp: true });
        if (result.wroteMcp) {
          logger.success('Cursor MCP config refreshed');
        } else {
          logger.info('Cursor MCP entry exists but could not be refreshed (no mcp_server_url in credentials)');
        }
      } else {
        logger.info('Cursor installed but MCP was not previously configured — skipped');
      }
    }

    logger.done('Bundled entry refresh complete. Standalone recipes and project-pinned packages were preserved.');
  });
