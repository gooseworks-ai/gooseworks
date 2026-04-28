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

  it('refuses to write outside the cache root for slugs with path separators', () => {
    const { readCache, writeCache } = load();
    // Path-traversal attempt — must not write to ../escape or anywhere
    // outside `tmpDir`. writeCache silently no-ops on invalid slugs.
    writeCache('styles', '../escape', 'md', 'pwn', null);
    writeCache('styles', '..', 'md', 'pwn', null);
    writeCache('styles', 'a/b', 'md', 'pwn', null);

    // Nothing should appear anywhere outside tmpDir.
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escape'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escape.md'))).toBe(false);

    // And reads return null instead of leaking.
    expect(readCache('styles', '../escape', 'md')).toBeNull();
    expect(readCache('styles', 'a/b', 'md')).toBeNull();
  });

  it('survives a torn write by writing via temp+rename', () => {
    const { readCache, writeCache } = load();
    writeCache('styles', 'a', 'md', 'first', 'etag-1');
    writeCache('styles', 'a', 'md', 'second', 'etag-2');
    expect(readCache('styles', 'a', 'md')).toEqual({ body: 'second', etag: 'etag-2' });

    // No leftover .tmp.* siblings.
    const dir = path.join(tmpDir, 'styles');
    const stragglers = fs.readdirSync(dir).filter((f) => f.includes('.tmp.'));
    expect(stragglers).toEqual([]);
  });
});
