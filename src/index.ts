#!/usr/bin/env node
import { Command } from 'commander';
import { installCommand } from './commands/install';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { updateCommand } from './commands/update';
import { creditsCommand } from './commands/credits';

const program = new Command();
program
  .name('gooseworks')
  .description('GooseWorks CLI — give your coding agent real data tools')
  .version('0.1.0');

program.addCommand(installCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(updateCommand);
program.addCommand(creditsCommand);

program.parse();
