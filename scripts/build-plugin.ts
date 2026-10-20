import { resolve } from 'node:path';
import { buildPlugin, checkPlugin, Target } from './plugin-package';

const args = process.argv.slice(2);
const check = args.includes('--check');
const positional = args.filter(arg => arg !== '--check');
if (positional.length < 1 || positional.length > 2 || !['portable', 'openai'].includes(positional[0])) {
  console.error('Usage: npm run build:plugin -- <portable|openai> [output-under-.plugin-build] [--check]');
  process.exit(1);
}
try {
  const target = positional[0] as Target;
  const output = positional[1] ? resolve(positional[1]) : undefined;
  if (check) { checkPlugin(target, output); console.log(`${target}: package and archive match canonical source`); }
  else console.log(JSON.stringify(buildPlugin(target, output), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
