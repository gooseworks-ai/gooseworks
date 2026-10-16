// Rule: one make of a video at a time on this computer. A lock is taken over
// only from a process that is gone, never from one that is still starting.
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import * as os from 'os';
import { runLayout } from '../../src/kit/core/paths';
import { takeoverPrefix, takeRunLock } from '../../src/kit/core/save';
import { VIDEO, fakeLine, lineRoute, runMake, tempHome } from './harness';

describe('the run lock', () => {
  it('lets only one of two makes started together through', async () => {
    const layout = runLayout(tempHome(), 'vid_1');
    const results = await Promise.allSettled([takeRunLock(layout, new Date()), takeRunLock(layout, new Date())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('does not take over a lock that is still being written', async () => {
    const layout = runLayout(tempHome(), 'vid_1');
    await takeRunLock(layout, new Date()).then((release) => release());
    writeFileSync(layout.lock, '');
    await expect(takeRunLock(layout, new Date())).rejects.toThrow(/already being made/);
  });

  it('never takes over a stale lock while another live run is taking it over', async () => {
    const layout = runLayout(tempHome(), 'vid_1');
    await takeRunLock(layout, new Date()).then((release) => release());
    const dead = JSON.stringify({ pid: 2 ** 22 + 4242, host: os.hostname(), started_at: '', holder: 'gone' });
    writeFileSync(layout.lock, dead);
    // A live run (this one) claimed the takeover long ago and is still at it.
    const claim = `${takeoverPrefix(layout.lock, dead)}.0`;
    writeFileSync(claim, JSON.stringify({ pid: process.pid, host: os.hostname(), at: '' }));
    const old = new Date(Date.now() - 600_000);
    utimesSync(claim, old, old);
    await expect(takeRunLock(layout, new Date())).rejects.toThrow(/already being made/);
  });

  it('takes over a lock left by a process that is gone', async () => {
    const layout = runLayout(tempHome(), 'vid_1');
    await takeRunLock(layout, new Date()).then((release) => release());
    writeFileSync(layout.lock, JSON.stringify({ pid: 2 ** 22 + 12345, host: require('os').hostname(), started_at: '', holder: 'gone' }));
    await expect(takeRunLock(layout, new Date())).resolves.toBeInstanceOf(Function);
  });
});

describe('a make the lock turns away', () => {
  it('never hands the video over, so the run making it keeps the line', async () => {
    const home = tempHome();
    const release = await takeRunLock(runLayout(home, VIDEO), new Date());
    const line = fakeLine();
    await expect(runMake({ home, line })).rejects.toThrow(/already being made/);
    expect(lineRoute(line.seen, '/device')).toHaveLength(0);
    await release();
  });

  it('starts no log of its own, so the video’s index lists only runs that ran', async () => {
    const home = tempHome();
    const layout = runLayout(home, VIDEO);
    const release = await takeRunLock(layout, new Date());
    await expect(runMake({ home, line: fakeLine() })).rejects.toThrow(/already being made/);
    expect(existsSync(layout.runs) ? readdirSync(layout.runs) : []).toEqual([]);
    expect(existsSync(layout.log)).toBe(false);
    await release();
    expect((await runMake({ home, line: fakeLine() })).status).toBe('done');
    expect(readdirSync(layout.runs)).toHaveLength(1);
    expect(readFileSync(layout.log, 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
