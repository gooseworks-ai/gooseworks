// The published html-frames part is the tested source, built, and keeps the
// part rules: one ES module, Node built-ins only, no network or processes.
import { existsSync, readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { KIT_PARTS, bundlePart } from '../../../scripts/build-kit-parts';
import { bindInputs } from '../../../src/kit/core/bind';
import { schemaErrors } from '../../../src/kit/core/schema';
import { KIT_VERSION } from '../../../src/kit/core/version';
import type { FileRef } from '../../../src/kit/part-interface';
import { createPartLoader } from '../../../src/kit/parts/loader';
import { FIXTURES, fileRef } from './helpers';

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
    // The page runtime is text the browser runs (it refuses fetch for the page); the part's own code is the rest.
    const partCode = published.replace(/var RUNTIME = String\.raw`[\s\S]*?\n}\)\(\);`;/, '');
    expect(partCode).not.toBe(published);
    expect(partCode).not.toMatch(/\brequire\(|\bimport\(|child_process|\bfetch\(|node:(http|https|net|dns|tls|worker_threads)\b|process\.env/);
  });

  it('part.json names this part and lists every file it ships', () => {
    const manifest = JSON.parse(readFileSync(path.join(folder, 'part.json'), 'utf8')) as { id: string; version: string; files: string[]; entry: string };
    expect([manifest.id, manifest.version, manifest.entry]).toEqual([part.id, part.version, 'part.mjs']);
    for (const file of manifest.files) expect(existsSync(path.join(folder, file))).toBe(true);
  });
});

describe('html-frames through the kit', () => {
  const partsDir = path.join(__dirname, '..', '..', '..', 'src', 'kit', 'maker');

  it("loads with the kit's parts loader, and its input schema takes each pilot step as the core binds it", async () => {
    const loader = createPartLoader({ kitVersion: KIT_VERSION, importModule: async () => ({ run: async () => ({}) }) });
    const loaded = await loader.load({
      ref: { id: 'html-frames', version: '1.1.0' },
      lock: null,
      dev: true,
      home: os.tmpdir(),
      env: { GOOSE_KIT_PARTS_DIR: partsDir, GOOSEWORKS_API_BASE: 'http://localhost:5999' },
      signal: new AbortController().signal,
    });
    expect(loaded.manifest).toMatchObject({ kind: 'render_html', needs: { browser: true, network: false, models: [] }, cost: { basis: 'free' }, determinism: 'pure' });
    const brand = { name: 'Brand', logo: null, colors: { primary: '#123456' }, fonts: {}, pronunciations: [], cta: null };
    for (const style of ['logo-equation-card', 'search-grid', 'photo-grid-promo-card']) {
      const dir = path.join(FIXTURES, 'pilots', style);
      const step = JSON.parse(readFileSync(path.join(dir, 'step.json'), 'utf8')) as { id: string; inputs: Record<string, unknown> };
      const plan = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8')) as { scenes: Array<Record<string, unknown>> };
      // Plan files arrive as files: the scene's uploaded image becomes a FileRef, as the core hands it over.
      plan.scenes.forEach((scene) => {
        scene.picture = null;
        if (typeof scene.image === 'string') scene.image = fileRef(path.join(FIXTURES, scene.image));
      });
      const assets = new Map<string, FileRef>();
      const collect = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        const asset = (value as { asset?: unknown }).asset;
        if (typeof asset === 'string') assets.set(asset, fileRef(path.join(dir, asset)));
        Object.values(value).forEach(collect);
      };
      collect(step.inputs);
      const inputs = bindInputs(step.inputs, { plan: { ...plan, products: [] }, brand, steps: new Map(), assets }, step.id);
      expect([style, schemaErrors(loaded.manifest.inputs, inputs)]).toEqual([style, []]);
    }
  });
});
