import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { installMasterSkill, removeAllSkills } from '../skills/installer';
import { configureClaude } from '../agents/claude';
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
    const masterContent = getMasterSkillContent(creds.api_base);
    installMasterSkill(masterContent);
    logger.success('Updated GooseWorks skill');

    logger.step(2, 2, 'Reconfiguring agents...');
    if (isAgentInstalled('claude')) {
      configureClaude();
      logger.success('Claude Code symlinks updated');
    }

    logger.done('Update complete!');
  });
