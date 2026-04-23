import chalk from 'chalk';
import ora, { type Ora } from 'ora';

const GOOSE_ASCII = [
  ' ██████╗  ██████╗  ██████╗ ███████╗███████╗',
  '██╔════╝ ██╔═══██╗██╔═══██╗██╔════╝██╔════╝',
  '██║  ███╗██║   ██║██║   ██║███████╗█████╗  ',
  '██║   ██║██║   ██║██║   ██║╚════██║██╔══╝  ',
  '╚██████╔╝╚██████╔╝╚██████╔╝███████║███████╗',
  ' ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝╚══════╝',
];

export function banner(version: string): void {
  console.log('');
  for (const line of GOOSE_ASCII) {
    console.log('  ' + chalk.cyan.bold(line));
  }
  console.log('');
  console.log(
    '  ' + chalk.bold(`GooseWorks CLI v${version}`) +
      chalk.dim('  ·  give your coding agent real data tools')
  );
  console.log('');
}

export function step(current: number, total: number, label: string): void {
  console.log(chalk.dim(`  [${current}/${total}]`) + ` ${label}`);
}

export function info(message: string): void {
  console.log(chalk.dim('    →') + ` ${message}`);
}

export function success(message: string): void {
  console.log(chalk.green('    ✓') + ` ${message}`);
}

export function error(message: string): void {
  console.log(chalk.red('    ✗') + ` ${message}`);
}

export function warn(message: string): void {
  console.log(chalk.yellow('    ⚠') + ` ${message}`);
}

export function example(message: string): void {
  console.log(chalk.cyan('    ›') + ' ' + chalk.bold(message));
}

export function spinner(text: string): Ora {
  return ora({ text: `  ${text}`, indent: 2 }).start();
}

export function done(message: string): void {
  console.log('');
  console.log(`  ${message}`);
  console.log('');
}
