// The published html-frames part is the tested source, built, and keeps the
// part rules: one ES module, Node built-ins only, no network or processes.
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { KIT_PARTS, bundlePart } from '../../../scripts/build-kit-parts';

const ALLOWED_IMPORTS = new Set(['node:crypto', 'node:fs/promises', 'node:path', 'node:url']);

describe.each(KIT_PARTS)('$id $version package', (part) => {
  const folder = path.dirname(part.out);
  const published = readFileSync(part.out, 'utf8');

  it('part.mjs is the current source, built', async () => {
    expect(published).toBe(await bundlePart(part));
  }, 60_000);

  it('imports only the Node built-ins a part may use, and never spawns, fetches or opens sockets', () => {
    const imports = [...published.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const name of imports) expect(ALLOWED_IMPORTS).toContain(name);
    expect(published).not.toMatch(/\brequire\(|\bimport\(|child_process|\bfetch\(|node:(http|https|net|dns|tls|worker_threads)\b|process\.env/);
  });

  it('part.json names this part and lists every file it ships', () => {
    const manifest = JSON.parse(readFileSync(path.join(folder, 'part.json'), 'utf8')) as { id: string; version: string; files: string[]; entry: string };
    expect([manifest.id, manifest.version, manifest.entry]).toEqual([part.id, part.version, 'part.mjs']);
    for (const file of manifest.files) expect(existsSync(path.join(folder, file))).toBe(true);
  });
});
