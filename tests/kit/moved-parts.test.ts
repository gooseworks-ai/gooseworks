// Rule: our server may move a part to a newer published version after the style pinned it (a free
// part's patch, or a paid part that orders the same pieces), recording the version it moved from.
// The kit then runs the moved version for that step and orders its pieces as it; a lock that names
// another version without saying it moved is still refused before anything is spent.
import { fakeLine, runMake, tempHome, testParts } from './harness';

const moved = (from: string | undefined) => (lock: any) => ({
  ...lock,
  parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], version: '1.0.1', ...(from ? { moved_from: from, pieces_as: from } : {}) } },
});

describe('a part the lock moved to a newer patch', () => {
  it('runs the moved version for the step the style pins at the old one', async () => {
    const loads: string[] = [];
    const line = fakeLine({ lock: moved('1.0.0') });
    const result = await runMake({ home: tempHome(), line, parts: testParts({ clip: { version: '1.0.1' } }), loads });
    expect(result.status).toBe('done');
    expect(loads).toContain('clip-maker@1.0.1');
    expect(line.pieces.map((p) => p.part)).toEqual([
      { id: 'clip-maker', version: '1.0.1' },
      { id: 'clip-maker', version: '1.0.1' },
    ]);
  });

  it('refuses another version the lock does not say it moved to', async () => {
    const line = fakeLine({ lock: moved(undefined) });
    const result = await runMake({ home: tempHome(), line, parts: testParts({ clip: { version: '1.0.1' } }) });
    expect(result.status).toBe('failed');
    expect(line.pieces).toHaveLength(0);
  });
});
