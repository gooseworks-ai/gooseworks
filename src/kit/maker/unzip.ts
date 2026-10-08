// A small zip reader for the kit's browser download, with Node built-ins only.
// The archive's sha256 is checked against its pin before this runs; this only
// refuses entries that would land outside the target folder.
import { mkdir, readFile, symlink, writeFile } from 'fs/promises';
import * as path from 'path';
import { inflateRawSync } from 'zlib';

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;

function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Unpacks `zipFile` into `dest` (which must be empty or new). */
export async function unzipTo(zipFile: string, dest: string): Promise<void> {
  const zip = await readFile(zipFile);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('the browser download is not a zip file');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff) throw new Error('the browser download uses a zip format the kit does not read');
  const root = path.resolve(dest);
  await mkdir(root, { recursive: true });
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== DIRECTORY_ENTRY) throw new Error('the browser download is damaged');
    const method = zip.readUInt16LE(at + 10);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const mode = zip.readUInt32LE(at + 38) >>> 16;
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (packed === 0xffffffff || size === 0xffffffff) throw new Error('the browser download uses a zip format the kit does not read');
    if (name.includes('\\') || name.startsWith('/')) throw new Error(`the browser download holds a bad path: ${name}`);
    const target = path.resolve(root, name);
    if (!inside(root, target)) throw new Error(`the browser download holds a path outside its folder: ${name}`);
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true });
      continue;
    }
    if (zip.readUInt32LE(local) !== LOCAL_ENTRY) throw new Error('the browser download is damaged');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + packed);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data || data.length !== size) throw new Error(`the browser download is damaged at ${name}`);
    await mkdir(path.dirname(target), { recursive: true });
    if ((mode & 0o170000) === 0o120000) {
      const link = data.toString('utf8');
      if (path.isAbsolute(link) || !inside(root, path.resolve(path.dirname(target), link))) {
        throw new Error(`the browser download links outside its folder: ${name}`);
      }
      await symlink(link, target);
    } else {
      await writeFile(target, data, { mode: mode & 0o777 || 0o644 });
    }
  }
}
