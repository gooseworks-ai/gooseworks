import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { installMasterSkill, removeAllSkills } from '../skills/installer';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp } from '../agents/claude-mcp';
import { configureCodex } from '../agents/codex';
import { configureCursor, hasExistingCursorMcpEntry } from '../agents/cursor';
import { isAgentInstalled } from '../agents/detect';
import { getMasterSkillContent } from '../skills/master-skill';
import * as logger from '../utils/logger';

export const updateCommand = new Command('update')
  .description('Update GooseWorks skill to the latest version')
  .action(async () => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    logger.step(1, 2, 'Updating skill...');
    removeAllSkills();
    const masterContent = getMasterSkillContent();
    installMasterSkill(masterContent);
    logger.success('Updated GooseWorks skill');

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

    logger.done('Update complete!');
  });
