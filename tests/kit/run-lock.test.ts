// Rule: one make of a video at a time on this computer. A lock is taken over
// only from a process that is gone, never from one that is still starting.
import { utimesSync, writeFileSync } from 'fs';
import * as os from 'os';
import { runLayout } from '../../src/kit/core/paths';
import { takeoverPrefix, takeRunLock } from '../../src/kit/core/save';
import { tempHome } from './harness';

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
