import { Command } from 'commander';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { getCredentials } from '../auth/credentials';
import { loadCheckpoint, prepareSave, resumeSave, type SaveManifest } from '../lib/video-save';
import { createSaveTransport } from '../lib/video-save-mcp';
import * as logger from '../utils/logger';

export const videoSaveCommand = new Command('video-save')
  .description('Save an already checked local video; resume interrupted uploads without generating media');

async function run(checkpoint: string, manifest?: string): Promise<void> {
  try {
    const creds = getCredentials();
    if (!creds) throw new Error('Run "gooseworks login" and reconnect to the original account before saving');
    const transport = await createSaveTransport(creds);
    const target = path.resolve(checkpoint);
    if (manifest) {
      const input = JSON.parse(await readFile(path.resolve(manifest), 'utf8')) as SaveManifest;
      await prepareSave(target, input, transport);
      logger.success(`Finished-video checkpoint saved: ${target}. Run gooseworks video-save resume --checkpoint "${target}".`);
    } else {
      const result = await resumeSave(target, transport);
      logger.success(`Saved and selected the same render ${result.binding.render_id}. Local video: ${result.binding.final.path}`);
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Finished-video saving was interrupted');
    logger.info('Keep the finished files and checkpoint. No video generation was requested.');
    const saved = await loadCheckpoint(path.resolve(checkpoint)).catch(() => null);
    if (saved) {
      logger.info(`Local final recorded in the checkpoint: ${saved.binding.final.path}`);
      logger.info(`Recovery checkpoint: ${path.resolve(checkpoint)}`);
    }
    process.exitCode = 1;
  }
}
videoSaveCommand.command('prepare')
  .description('Bind the completed final/poster and existing passing quality evidence before uploading')
  .requiredOption('--manifest <file>', 'Finished-video manifest JSON (no credentials)')
  .requiredOption('--checkpoint <file>', 'Durable local checkpoint path')
  .action((opts: { manifest: string; checkpoint: string }) => run(opts.checkpoint, opts.manifest));
videoSaveCommand.command('resume')
  .description('Read current state, then finish only missing save steps on the same render')
  .requiredOption('--checkpoint <file>', 'Existing finished-video checkpoint')
  .action((opts: { checkpoint: string }) => run(opts.checkpoint));
