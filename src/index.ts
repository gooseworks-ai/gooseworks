#!/usr/bin/env node
import { consumeEnvironment } from './environment';

async function main(): Promise<void> {
try {
  const args = consumeEnvironment(process.argv.slice(2));
  await require('./program').run(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'GooseWorks failed');
  process.exitCode = 1;
}
}
void main();
