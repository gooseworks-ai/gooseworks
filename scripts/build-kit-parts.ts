// Builds the kit parts this repo carries into the single ES module each one
// publishes (parts/<id>/<version>/part.mjs in goose-skills). A part runs with
// Node built-ins only, so everything else is bundled in.
//
//   npx tsx scripts/build-kit-parts.ts          writes every part.mjs
//   npx tsx scripts/build-kit-parts.ts --check  fails when a part.mjs is stale
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

export interface KitPartBuild {
  id: string;
  version: string;
  entry: string;
  out: string;
}

export const KIT_PARTS: KitPartBuild[] = [
  {
    id: 'html-frames',
    version: '1.1.0',
    entry: path.join(ROOT, 'src/kit/maker/parts/html-frames/src/part.ts'),
    out: path.join(ROOT, 'src/kit/maker/parts/html-frames/1.1.0/part.mjs'),
  },
];

/** The bundle for one part, exactly as it is published. */
export async function bundlePart(part: KitPartBuild): Promise<string> {
  const result = await build({
    entryPoints: [part.entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    charset: 'utf8',
    legalComments: 'none',
    sourcemap: false,
    minify: false,
    logLevel: 'silent',
    banner: { js: `// ${part.id} ${part.version}: built by scripts/build-kit-parts.ts from src/kit/maker. Do not edit by hand.` },
  });
  return result.outputFiles[0].text;
}

async function main() {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const part of KIT_PARTS) {
    const text = await bundlePart(part);
    let current = '';
    try {
      current = readFileSync(part.out, 'utf8');
    } catch {
      current = '';
    }
    if (current === text) continue;
    if (check) {
      console.error(`${path.relative(ROOT, part.out)} is out of date; run npx tsx scripts/build-kit-parts.ts`);
      stale++;
    } else {
      writeFileSync(part.out, text);
      console.log(`wrote ${path.relative(ROOT, part.out)} (${Math.round(text.length / 1024)} KB)`);
    }
  }
  if (stale) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
