// Rule: `video make` asks for the process to end once it returns, but only the
// entry point ends it, so the command can be run in-process by tests.
import { exitIfRequested, exitWhenDone } from '../../src/utils/exit';

describe('ending the process after a command', () => {
  const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  afterAll(() => exit.mockRestore());

  it('ends it only once a command asked, with the exit code it set', async () => {
    await exitIfRequested();
    expect(exit).not.toHaveBeenCalled();
    exitWhenDone();
    expect(exit).not.toHaveBeenCalled();
    process.exitCode = 1;
    await exitIfRequested();
    process.exitCode = undefined;
    expect(exit).toHaveBeenCalledWith(1);
  });
});
