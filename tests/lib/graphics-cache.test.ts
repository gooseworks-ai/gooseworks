import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('graphics-cache', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-cache-'));
    originalEnv = process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR;
    process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR = tmpDir;
    jest.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR;
    else process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function load() {
    return require('../../src/lib/graphics-cache') as typeof import('../../src/lib/graphics-cache');
  }

  it('returns null for missing entries', () => {
    const { readCache } = load();
    expect(readCache('styles', 'nope', 'md')).toBeNull();
  });

  it('round-trips body + etag', () => {
    const { readCache, writeCache } = load();
    writeCache('styles', 'desert-sunset', 'md', '# hi', 'W/"abc"');
    const got = readCache('styles', 'desert-sunset', 'md');
    expect(got).toEqual({ body: '# hi', etag: 'W/"abc"' });
  });

  it('round-trips json variant', () => {
    const { readCache, writeCache } = load();
    writeCache('formats', 'linkedin-banner', 'json', '{"slug":"x"}', null);
    const got = readCache('formats', 'linkedin-banner', 'json');
    expect(got).toEqual({ body: '{"slug":"x"}', etag: null });
  });

  it('clears stale etag when overwritten with null', () => {
    const { readCache, writeCache } = load();
    writeCache('styles', 'a', 'md', 'v1', 'etag-1');
    writeCache('styles', 'a', 'md', 'v2', null);
    expect(readCache('styles', 'a', 'md')).toEqual({ body: 'v2', etag: null });
  });

  it('honours GOOSEWORKS_GRAPHICS_CACHE_DIR', () => {
    const { writeCache, getCacheRoot } = load();
    writeCache('styles', 'x', 'md', 'body', null);
    expect(getCacheRoot()).toBe(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'styles', 'x.md'))).toBe(true);
  });
});
