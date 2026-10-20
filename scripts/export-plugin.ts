/** Generate the installable Git snapshot and its Cursor repository entry. */
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkPackageDirectory, collectPluginFiles, Files, REPO, safeDestination } from './plugin-package';

export function distributionFiles(): { version: string; root: string; files: Files; marketplace: Buffer } {
  const files = collectPluginFiles('portable');
  const manifest = JSON.parse(files.get('plugin.json')!.toString());
  const source = `distributions/${manifest.version}/gooseworks`;
  const marketplace = Buffer.from(JSON.stringify({
    name: 'gooseworks-plugin-candidates',
    owner: { name: manifest.author.name },
    metadata: { description: 'GooseWorks plugin candidates for installation and testing.' },
    plugins: [{ name: manifest.name, source, version: manifest.version, description: manifest.description,
      logo: 'assets/logo.png' }],
  }, null, 2) + '\n');
  return { version: manifest.version, root: join(REPO, source), files, marketplace };
}

export function exportPlugin(check = false) {
  const candidate = distributionFiles();
  safeDestination(candidate.root, join(REPO, 'distributions'));
  const marketplacePath = join(REPO, '.cursor-plugin/marketplace.json');
  safeDestination(marketplacePath, join(REPO, '.cursor-plugin'));
  if (check) {
    checkPackageDirectory('portable', candidate.root);
    if (lstatSync(marketplacePath).isSymbolicLink() || !readFileSync(marketplacePath).equals(candidate.marketplace)) {
      throw new Error('Cursor marketplace differs from generated candidate');
    }
  } else {
    if (existsSync(candidate.root)) throw new Error('Versioned distribution already exists; use --check or bump the plugin version');
    // Only this exporter's known single-plugin catalog may be refreshed.
    if (existsSync(marketplacePath)) {
      const previous = JSON.parse(readFileSync(marketplacePath, 'utf8'));
      if (previous.name !== 'gooseworks-plugin-candidates' || previous.owner?.name !== 'GooseWorks' ||
          previous.plugins?.length !== 1 || previous.plugins[0].name !== 'gooseworks') {
        throw new Error('Existing Cursor marketplace is not owned by this generator');
      }
    }
    for (const [name, bytes] of candidate.files) {
      const path = join(candidate.root, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: 'wx' });
    }
    mkdirSync(dirname(marketplacePath), { recursive: true });
    writeFileSync(marketplacePath, candidate.marketplace);
    checkPackageDirectory('portable', candidate.root);
  }
  return { packageRoot: candidate.root, marketplace: marketplacePath, version: candidate.version,
    status: 'prepared; provider installation and review evidence remain separate' };
}

if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: npm run export:plugin -- [--check]');
  console.log(JSON.stringify(exportPlugin(process.argv.includes('--check')), null, 2));
}
