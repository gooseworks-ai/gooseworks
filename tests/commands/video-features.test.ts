// The server reads `gooseworksKit.features` from a kit version's npm manifest to choose its hand-off
// (--detach, video status and video verify only when listed), so every listed feature must exist here.
jest.mock('../../src/kit/core/run', () => ({ makeVideo: jest.fn() }));
jest.mock('../../src/kit/core/host', () => ({ defaultHost: () => ({}) }));

import { readFileSync } from 'fs';
import * as path from 'path';
import type { Command } from 'commander';
import { videoCommand } from '../../src/commands/video';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
  gooseworksKit?: { features?: unknown };
};

function sub(name: string): Command | undefined {
  return videoCommand.commands.find((command) => command.name() === name);
}

function hasOption(name: string, flag: string): boolean {
  return !!sub(name)?.options.some((option) => option.long === flag);
}

/** Where each feature the manifest may list lives in `gooseworks video`. */
const FEATURE_CHECKS: Record<string, () => boolean> = {
  detach: () => hasOption('make', '--detach'),
  status: () => !!sub('status'),
  verify: () => !!sub('verify'),
  log: () => !!sub('log'),
  json: () => hasOption('make', '--json') && hasOption('status', '--json') && hasOption('verify', '--json'),
  step_edit: () => hasOption('step', '--edit'),
  patched: () => hasOption('make', '--patched'),
};

describe('package.json gooseworksKit.features', () => {
  const features = pkg.gooseworksKit?.features;

  it('is a list of distinct names', () => {
    expect(Array.isArray(features)).toBe(true);
    expect(new Set(features as string[]).size).toBe((features as string[]).length);
  });

  it.each(Array.isArray(features) ? (features as string[]) : [])('%s is a real command or flag', (feature) => {
    expect(FEATURE_CHECKS[feature]).toBeDefined();
    expect(FEATURE_CHECKS[feature]()).toBe(true);
  });
});
