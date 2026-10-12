// Runner-only adapter: reuse the part's take planner and require its exact payload.
// No provider payload or production kit changes; unknown sources get no guessed timings.
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { PieceCall } from './providers';

export interface FakeBeat { line: string | null; start: number; end: number }
export interface FakeTake { beats: FakeBeat[]; offset: number; seconds: number }
const load = new Function('url', 'return import(url)') as (url: string) => Promise<any>;

export async function fakeTakeFor(runRoot: string, partsDir: string, pieceKey: string, call: PieceCall): Promise<FakeTake | null> {
  if (!call.path.startsWith('bytedance/seedance-2.0/') || !/^[a-zA-Z0-9_-]+\./.test(pieceKey)) return null;
  const step = pieceKey.split('.')[0];
  const recordPath = path.join(runRoot, 'steps', step, 'record.json');
  if (!existsSync(recordPath)) return null;
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  if (record.part?.id !== 'video-seedance-2' || !['take', 'takes'].includes(record.inputs?.mode)) return null;
  const source = path.join(partsDir, 'parts', 'video-seedance-2', 'src');
  const sourceManifest = await load(pathToFileURL(path.join(source, 'manifest.mjs')).href);
  if (sourceManifest.manifest.version !== record.part.version) throw new Error('Fake take planner version differs from the actual part.');
  const { sdTakeJobs } = await load(pathToFileURL(path.join(source, 'takes.mjs')).href);
  const template = JSON.parse(readFileSync(record.inputs.template.path, 'utf8'));
  const jobs = sdTakeJobs(record.inputs, template);
  const job = jobs.find((j: any) => j.prompt === call.body.prompt && j.duration === call.body.duration);
  if (!job) throw new Error('Fake take planner did not reproduce the actual provider payload.');
  const scenes = new Map(record.inputs.scenes.map((s: any) => [String(s.id), s]));
  return { offset: job.index * job.seconds, seconds: job.seconds, beats: job.scene_ids.map((id: string, i: number) => ({
    line: (scenes.get(id) as any)?.line ?? null, start: job.windows[i].start, end: job.windows[i].end,
  })) };
}

/** Only pieces referenced by the current run's completed native take records. */
export function fakeTakeKeysFor(runRoot: string): string[] {
  const runPath = path.join(runRoot, 'run.json');
  if (!existsSync(runPath)) return [];
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  return Object.keys(run.steps || {}).filter((id) => /^[a-zA-Z0-9_-]+$/.test(id)).flatMap((id) => {
    const recordPath = path.join(runRoot, 'steps', id, 'record.json');
    if (!existsSync(recordPath)) return [];
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    if (record.status !== 'done' || record.part?.id !== 'video-seedance-2' || !['take', 'takes'].includes(record.inputs?.mode)) return [];
    return (record.pieces || []).map((p: any) => p.idempotency_key).filter((k: unknown): k is string => typeof k === 'string');
  });
}
