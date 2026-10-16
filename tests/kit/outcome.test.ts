/**
 * How a `video make` ended, for whoever runs it: every outcome keeps its exit code, and
 * `--detach` runs the same command again in a process of its own with JSON output.
 */
import { detachedArgs } from '../../src/kit/core/detach';
import { EXIT_CODES, outcomeOf, resultRecord, verifyOf, verifyLines } from '../../src/kit/core/outcome';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { runLayout } from '../../src/kit/core/paths';
import { hashFile } from '../../src/kit/core/files';

it('keeps one exit code per outcome', () => {
  expect(EXIT_CODES).toEqual({ done: 0, failed: 1, stopped: 3, run_again: 4, update_kit: 5, sign_in: 6 });
});

it.each([
  [{ status: 'done' }, 'done'],
  [{ status: 'update_kit' }, 'update_kit'],
  [{ status: 'stopped', next: 'sign_in' }, 'sign_in'],
  [{ status: 'stopped', next: 'retry' }, 'run_again'],
  [{ status: 'failed', code: 'timeout' }, 'run_again'],
  [{ status: 'stopped', code: 'unreachable' }, 'run_again'],
  [{ status: 'failed', code: 'check_failed' }, 'failed'],
  [{ status: 'stopped' }, 'stopped'],
] as const)('reads %j as %s', (ended, outcome) => {
  expect(outcomeOf(ended)).toBe(outcome);
});

it('names the final, the frame sheet and the warnings only for a finished video', () => {
  const at = new Date('2026-10-13T00:00:00Z');
  expect(resultRecord('v1', { status: 'done', message: 'Ready.', final: '/f.mp4', contact_sheet: '/s.png', warnings: ['Too fast.'] }, at)).toEqual({
    event: 'result',
    video_id: 'v1',
    status: 'done',
    outcome: 'done',
    exit_code: 0,
    message: 'Ready.',
    final: '/f.mp4',
    contact_sheet: '/s.png',
    warnings: ['Too fast.'],
    ended_at: '2026-10-13T00:00:00.000Z',
  });
  expect(resultRecord('v1', { status: 'failed', message: 'No.', final: '/f.mp4', contact_sheet: '/s.png' }, at)).not.toHaveProperty('contact_sheet');
});

it('runs the detached process as the same command without --detach, with JSON output', () => {
  expect(detachedArgs(['video', 'make', 'v1', '--detach'])).toEqual(['video', 'make', 'v1', '--json']);
  expect(detachedArgs(['--env', 'staging', 'video', 'make', 'v1', '--json', '--detach'])).toEqual(['--env', 'staging', 'video', 'make', 'v1', '--json']);
});

it('does not reuse review evidence after the final bytes change', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'review-version-'));
  try {
    const layout = runLayout(home, 'v1');
    await mkdir(layout.final, { recursive: true });
    const final = path.join(layout.final, 'final.mp4');
    const sheet = path.join(layout.final, 'contact-sheet.png');
    await writeFile(final, 'first version');
    await writeFile(sheet, 'sheet');
    await writeFile(layout.result, JSON.stringify(resultRecord('v1', { status: 'done', message: 'File checks passed.', final })));
    await writeFile(path.join(layout.final, 'eyes.json'), JSON.stringify({ contact_sheet: sheet, tiles: [], warnings: [], output_sha256: (await hashFile(final)).sha256, coverage: { complete: true, missing_scenes: [], unreadable_tiles: [] }, audio: { required: false, final_mix: null, before_sound: null, windows: [] } }));
    expect(await verifyOf(home, 'v1')).toMatchObject({ review_status: 'required', contact_sheet: sheet });
    await writeFile(final, 'second version');
    const changed = await verifyOf(home, 'v1');
    expect(changed.review_status).toBe('incomplete');
    expect(changed.contact_sheet).toBeUndefined();
    expect(verifyLines(changed).join(' ')).toContain('does not certify clean speech');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
