// The server reads `gooseworksKit.features` from a kit version's npm manifest to choose its hand-off
// (--detach, video status and video verify only when listed), so every listed feature must exist here.
jest.mock('../../src/kit/core/run', () => ({ makeVideo: jest.fn() }));
jest.mock('../../src/kit/core/host', () => ({ defaultHost: () => ({}) }));

import { readFileSync } from 'fs';
import * as path from 'path';
import type { Command } from 'commander';
import { videoCommand } from '../../src/commands/video';
import { ASSEMBLY_FORMAT, finalContentReviewProblems, normalizeAssemblyTimeline } from '../../src/kit/core/assembly-timeline';
import { FINAL_MEASURE_FORMAT, measureFinal } from '../../src/kit/core/final-measure';
import { KIT_FEATURES } from '../../src/kit/core/version';

const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
  gooseworksKit?: { features?: unknown };
};

function sub(name: string): Command | undefined {
  return videoCommand.commands.find((command) => command.name() === name);
}

function hasOption(name: string, flag: string): boolean {
  return !!sub(name)?.options.some((option) => option.long === flag);
}

const coreRun = readFileSync(path.join(__dirname, '../../src/kit/core/run.ts'), 'utf8');
const sourceRenderer = JSON.parse(readFileSync(path.join(__dirname, '../../src/kit/maker/parts/html-frames/1.3.1/part.json'), 'utf8'));

/** Command features and the separately advertised runtime contracts. */
const FEATURE_CHECKS: Record<string, () => boolean> = {
  detach: () => hasOption('make', '--detach'),
  status: () => !!sub('status'),
  verify: () => !!sub('verify'),
  log: () => !!sub('log'),
  json: () => hasOption('make', '--json') && hasOption('status', '--json') && hasOption('verify', '--json'),
  step_edit: () => hasOption('step', '--edit'),
  patched: () => hasOption('make', '--patched'),
  assembly_timeline_v1: () => KIT_FEATURES.includes('assembly_timeline_v1') && ASSEMBLY_FORMAT === 'gooseworks-assembly-timeline/1' && normalizeAssemblyTimeline(undefined).status === 'incomplete',
  exact_final_content_review_v1: () => KIT_FEATURES.includes('exact_final_content_review_v1') && finalContentReviewProblems(undefined, '0'.repeat(64), normalizeAssemblyTimeline(undefined), null).length > 0,
  content_review_resume: () => !!sub('make') && KIT_FEATURES.includes('content_review_resume') && coreRun.includes('content-review.json') && coreRun.includes('source-reviews.json'),
  final_measure_v1: () => KIT_FEATURES.includes('final_measure_v1') && FINAL_MEASURE_FORMAT === 'gooseworks-final-measure/1' && typeof measureFinal === 'function' && coreRun.includes('final_measure: finalMeasure'),
  source_linked_html_frames_v1: () => KIT_FEATURES.includes('source_linked_html_frames_v1') && Boolean(sourceRenderer.inputs.properties.under_timeline.properties.assembly_timeline && sourceRenderer.outputs.properties.timeline.properties.assembly_timeline && sourceRenderer.outputs.properties.source_files),
};

describe('package.json gooseworksKit.features', () => {
  const features = pkg.gooseworksKit?.features;

  it('is a list of distinct names', () => {
    expect(Array.isArray(features)).toBe(true);
    expect(new Set(features as string[]).size).toBe((features as string[]).length);
  });

  it.each(Array.isArray(features) ? (features as string[]) : [])('%s has its command or runtime contract', (feature) => {
    expect(FEATURE_CHECKS[feature]).toBeDefined();
    expect(FEATURE_CHECKS[feature]()).toBe(true);
  });
});
