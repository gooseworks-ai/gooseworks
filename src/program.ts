import { Command } from 'commander';
import { installCommand } from './commands/install';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { whoamiCommand } from './commands/whoami';
import { updateCommand } from './commands/update';
import { creditsCommand } from './commands/credits';
import { searchCommand } from './commands/search';
import { fetchCommand } from './commands/fetch';
import { envCommand } from './commands/env';
import { callCommand } from './commands/call';
import { orthogonalCommand } from './commands/orthogonal';
import { stylesCommand } from './commands/styles';
import { formatsCommand } from './commands/formats';
import { doctorCommand } from './commands/doctor';
import { logCommand } from './commands/log';
import { videoLocalCommand } from './commands/video-local';
import { videoSaveCommand } from './commands/video-save';
import { getVersion } from './version';
import { skillsCommand } from './commands/skills';
import { launchCommand } from './commands/launch';

export async function run(args: string[]): Promise<void> {
const program = new Command();
program
  .name('gooseworks')
  .description('GooseWorks CLI — give your coding agent real data tools')
  .version(getVersion())
  .option('--env <environment>', 'production (default) or staging; may appear before or after the command');

program.addCommand(installCommand);
program.addCommand(launchCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(updateCommand);
program.addCommand(skillsCommand);
program.addCommand(creditsCommand);
program.addCommand(searchCommand);
program.addCommand(fetchCommand);
program.addCommand(envCommand);
program.addCommand(callCommand);
program.addCommand(orthogonalCommand);
program.addCommand(stylesCommand);
program.addCommand(formatsCommand);
program.addCommand(doctorCommand);
program.addCommand(logCommand);
// Hidden: serves only paused server video orders (see commands/video-local.ts).
program.addCommand(videoLocalCommand, { hidden: true });
program.addCommand(videoSaveCommand);

await program.parseAsync(args, { from: 'user' });
}
