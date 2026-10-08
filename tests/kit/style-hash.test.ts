// Rule: the kit fingerprints a style exactly as our server does, or every
// approved video is refused as "not the style approved".
//
// The server's rule (gooseworks-app apps/api/src/services/video-styles):
//   hashStyleFile(style) = canonicalHash(style without its top-level `cost`)
//   canonicalHash(v)     = sha256 hex of canonicalJson(v)
//   canonicalJson(v)     = arrays as [a,b]; objects with keys sorted by code
//                          unit (a < b), undefined values dropped, no spaces,
//                          each key and leaf by JSON.stringify.
// Only the top-level cost block is left out; a field named cost anywhere else
// counts. The hex below was computed with the server's own canonical-json.ts
// and hashStyleFile on the fixture (the style-file contract's example).
import { readFileSync } from 'fs';
import * as path from 'path';
import { canonicalHash } from '../../src/kit/core/canonical';
import { styleHash } from '../../src/kit/core/style';
import { fakeLine, runMake, style, tempHome } from './harness';

const fixture = JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', 'kit-style', 'search-grid.style.json'), 'utf8'));
const SERVER_HASH = '52735b4c3197e69b24e78f860d636272ac3b326fdfae045c850051dd2e563bd2';

describe('the style fingerprint', () => {
  it('is the server’s, for the contract’s example style', () => {
    expect(styleHash(fixture)).toBe(SERVER_HASH);
  });

  it('ignores only the top-level cost block', () => {
    expect(styleHash({ ...fixture, cost: { ...fixture.cost, usd: 0.07 } })).toBe(SERVER_HASH);
    expect(styleHash({ ...fixture, traits: { ...fixture.traits, cost: 1 } })).not.toBe(SERVER_HASH);
  });

  it('lets a video whose style carries a cost block be made', async () => {
    const priced = { ...style, cost: { usd: 0.05, low_usd: 0.03, high_usd: 0.08, basis: 'estimated', as_of: '2026-10-08' } };
    // The hash the server pins at the yes: the style without its cost, as canonical JSON.
    const { cost: _cost, ...made } = priced;
    const pinned = canonicalHash(made);
    const line = fakeLine({
      style: priced,
      handOver: (handed) => ({ ...handed, plan: { ...handed.plan, style_hash: pinned }, style_package: { ...handed.style_package, style_hash: pinned } }),
    });
    expect((await runMake({ home: tempHome(), line })).status).toBe('done');
  });
});
