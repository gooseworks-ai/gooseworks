// A command that may leave a handle open (a part's browser, say) asks for the process to end
// once it returns. The entry point ends it, so the command itself stays testable in-process.
let requested = false;

export function exitWhenDone(): void {
  requested = true;
}

/** Ends the process if a command asked for it, once what was printed has been written. */
export async function exitIfRequested(): Promise<void> {
  if (!requested) return;
  await Promise.all([process.stdout, process.stderr].map((stream) => new Promise<void>((resolve) => stream.write('', () => resolve()))));
  process.exit(process.exitCode ?? 0);
}

/** Ends the process now with `code`, once what was printed has been written: for a run that won't end on its own. */
export async function exitNow(code: number): Promise<void> {
  process.exitCode = code;
  requested = true;
  await exitIfRequested();
}
