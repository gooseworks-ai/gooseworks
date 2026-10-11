// The style folder, copied into the run folder before each run.
//
// The kit sends a provider only files inside the video's own folder
// (src/kit/core/pieces.ts hostPayload: "a file outside this video was named in
// a payload"). In production the style package is downloaded into that folder,
// so a step that sends one of the style's own files (a `style_refs` picture, a
// reference frame) works. A styles folder somewhere else (GOOSE_KIT_STYLES_DIR)
// would stop that step. So the runner gives the kit a copy of the one style it
// runs, under <run folder>/dev-styles/<style>/: an APFS clone where the disk
// allows it (no extra space), a plain copy elsewhere. The style file's sha256
// the runner records and the real-mode gate checks stays the original file's.
import { constants, cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'fs';
import * as path from 'path';

/** Copies <stylesDir>/<styleId>/ to <runRoot>/dev-styles/<styleId>/ and returns the folder to hand the kit as GOOSE_KIT_STYLES_DIR. */
export function stageStyle(stylesDir: string, styleId: string, runRoot: string): string {
  // One plain folder name, so neither the copy nor the delete below can leave its folder.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(styleId) || styleId.includes('..')) throw new Error(`Bad style name ${JSON.stringify(styleId)}.`);
  const from = path.join(path.resolve(stylesDir), styleId);
  if (!existsSync(path.join(from, 'style.json'))) throw new Error(`No style ${styleId} at ${from}.`);
  const copies = path.join(path.resolve(runRoot), 'dev-styles');
  const to = path.join(copies, styleId);
  // The copy must be a real folder of its own, never the original style (or a link to it).
  if (existsSync(copies) && lstatSync(copies).isSymbolicLink()) throw new Error(`${copies} is a link; remove it.`);
  if (existsSync(to) && (lstatSync(to).isSymbolicLink() || realpathSync(to) === realpathSync(from))) throw new Error(`${to} is the style folder itself or a link; remove it.`);
  // A fresh copy every run, so an edited style file is what the kit reads (the kit still checks it against the pinned hash).
  rmSync(to, { recursive: true, force: true });
  mkdirSync(copies, { recursive: true });
  // dereference: the copy holds the files themselves, so nothing in it points back outside the run folder.
  cpSync(from, to, { recursive: true, dereference: true, mode: constants.COPYFILE_FICLONE });
  return copies;
}
