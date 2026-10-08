// Rule: one make of a video at a time on this computer. A lock is taken over
// only from a process that is gone, never from one that is still starting.
import { writeFileSync } from 'fs';
import { runLayout } from '../../src/kit/core/paths';
import { takeRunLock } from '../../src/kit/core/save';
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

  it('takes over a lock left by a process that is gone', async () => {
    const layout = runLayout(tempHome(), 'vid_1');
    await takeRunLock(layout, new Date()).then((release) => release());
    writeFileSync(layout.lock, JSON.stringify({ pid: 2 ** 22 + 12345, host: require('os').hostname(), started_at: '', holder: 'gone' }));
    await expect(takeRunLock(layout, new Date())).resolves.toBeInstanceOf(Function);
  });
});
