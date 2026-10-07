import { randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { executeNextCaptionClaim } from '../lib/video-local-captions';
import { createCaptionRuntime, createCaptionTransport } from '../lib/video-local-runtime';
import * as logger from '../utils/logger';
import { profileRoot } from '../environment';

/**
 * Narrow local worker for server-rendered video orders (GOOSE-3718). Those
 * orders are paused (gooseworks-app server-video-orders.ts) and goose-video no
 * longer runs this, so the command is hidden from --help. Kept so it works again
 * if server orders are turned back on; client formats never use it.
 */
export const videoLocalCommand = new Command('video-local')
  .description('Run a server-vetted local video node (experimental)');

videoLocalCommand.command('captions')
  .description('Claim and run one approved local captions node for a CreativeSpec project')
  .requiredOption('--project-id <id>', 'Existing video project ID')
  .action(async ({ projectId }: { projectId: string }) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exitCode = 1;
      return;
    }
    try {
      const result = await executeNextCaptionClaim({
        projectId,
        workerId: randomUUID(),
        workRoot: path.join(profileRoot(), 'video-local'),
        transport: createCaptionTransport(creds.api_base, creds.api_key),
        runtime: createCaptionRuntime(),
      });
      if (!result) {
        logger.info('No eligible captions node is offered for this project. Nothing was rendered or charged.');
        return;
      }
      logger.success(`Completed local captions claim ${result.claimId}. Recovery journal: ${result.journalPath}`);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : 'Local captions failed');
      logger.error('Any claimed lease and output remain in the private video-local journal for recovery.');
      process.exitCode = 1;
    }
  });
