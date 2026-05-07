#!/usr/bin/env node
import { Command } from 'commander';
import { installCommand } from './commands/install';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { updateCommand } from './commands/update';
import { creditsCommand } from './commands/credits';
import { searchCommand } from './commands/search';
import { fetchCommand } from './commands/fetch';
import { envCommand } from './commands/env';
import { callCommand } from './commands/call';
import { orthogonalCommand } from './commands/orthogonal';
import { stylesCommand } from './commands/styles';
import { formatsCommand } from './commands/formats';
import { getVersion } from './version';

const program = new Command();
program
  .name('gooseworks')
  .description('GooseWorks CLI — give your coding agent real data tools')
  .version(getVersion());

program.addCommand(installCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(updateCommand);
program.addCommand(creditsCommand);
program.addCommand(searchCommand);
program.addCommand(fetchCommand);
program.addCommand(envCommand);
program.addCommand(callCommand);
program.addCommand(orthogonalCommand);
program.addCommand(stylesCommand);
program.addCommand(formatsCommand);

program.parse();
