// Rule: the device report lists exactly the part versions this computer has a
// verified copy of, so the line's "styles ready" count matches what loads.
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { cachedParts } from '../../src/kit/core/device';
import { tempHome } from './harness';

describe('the device report’s parts', () => {
  it('lists a version that has a verified copy folder, and nothing else', () => {
    const home = tempHome();
    const parts = path.join(home, 'kit', 'parts');
    const copy = (id: string, version: string, key: string | null) => {
      const dir = key ? path.join(parts, id, version, key) : path.join(parts, id, version);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'part.json'), '{}');
    };
    copy('html-frames', '1.0.0', 'a1b2c3');
    copy('html-frames', '1.1.0', 'd4e5f6');
    copy('old-layout', '1.0.0', null);
    mkdirSync(path.join(parts, 'empty-part', '2.0.0', 'k'), { recursive: true });
    mkdirSync(path.join(parts, '.tmp', 'x'), { recursive: true });

    expect(cachedParts(home)).toEqual([{ id: 'html-frames', versions: ['1.0.0', '1.1.0'] }]);
  });
});

describe('the device id', () => {
  it('is one id for every run that starts at once, even over a damaged file', async () => {
    const { deviceId } = await import('../../src/kit/core/device');
    for (const damaged of [false, true]) {
      const home = tempHome();
      if (damaged) {
        mkdirSync(path.join(home, 'kit'), { recursive: true });
        writeFileSync(path.join(home, 'kit', 'device.json'), '{"device_id": ');
      }
      const ids = await Promise.all(Array.from({ length: 8 }, () => deviceId(home)));
      expect(new Set(ids).size).toBe(1);
    }
  });
});
