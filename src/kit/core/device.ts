// This computer as the line sees it: a device id made once (never a hardware
// id) and the device report `video check` and the hand-over send.
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, statSync } from 'fs';
import { mkdir, readFile, statfs } from 'fs/promises';
import * as path from 'path';
import type { DeviceReport, ToolReport } from '../line/types';
import { devicePath, partsCacheDir } from './paths';
import { sha256Hex } from './canonical';
import { atomicWrite, claimJob, createExclusive } from './save';
import { isExactVersion, KIT_INTERFACES, KIT_VERSION } from './version';
import type { Toolchain } from './toolchain';

const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
const PART_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The device id kept in ~/.gooseworks/kit/device.json, made on first use. */
export async function deviceId(home: string): Promise<string> {
  const file = devicePath(home);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  for (let tries = 0; tries < 100; tries++) {
    const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
    const saved = raw === null ? null : parseDevice(raw);
    if (saved) return saved;
    const record = JSON.stringify({ device_id: randomUUID(), created_at: new Date().toISOString() }, null, 2) + '\n';
    if (raw === null) {
      // The first run to create it wins; everyone reads back what was saved.
      await createExclusive(file, record);
      continue;
    }
    // Damaged: one run repairs it; the others wait and read what it saved.
    if ((await claimJob(`${file}.repair.${sha256Hex(raw).slice(0, 32)}`)) === 'mine') {
      const again = await readFile(file, 'utf8').catch(() => null);
      if (again === raw) await atomicWrite(file, record);
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('This computer’s video kit id could not be read.');
}

function parseDevice(raw: string): string | null {
  try {
    const id = (JSON.parse(raw) as { device_id?: unknown }).device_id;
    return typeof id === 'string' && DEVICE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function hasCopy(versionDir: string): boolean {
  try {
    return readdirSync(versionDir, { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(path.join(versionDir, entry.name, 'part.json')));
  } catch {
    return false;
  }
}

/** Part versions in the cache, by id (at most 200 parts, 50 versions each). */
export function cachedParts(home: string): Array<{ id: string; versions: string[] }> {
  const root = partsCacheDir(home);
  if (!existsSync(root)) return [];
  const parts: Array<{ id: string; versions: string[] }> = [];
  for (const id of readdirSync(root).sort()) {
    if (!PART_ID.test(id) || id.length > 64) continue;
    const dir = path.join(root, id);
    if (!statSync(dir).isDirectory()) continue;
    // Each verified copy lives in its own folder: <id>/<version>/<copy key>/part.json.
    const versions = readdirSync(dir)
      .filter((v) => isExactVersion(v) && hasCopy(path.join(dir, v)))
      .sort()
      .slice(0, 50);
    if (versions.length) parts.push({ id, versions });
    if (parts.length >= 200) break;
  }
  return parts;
}

export async function freeDiskMb(dir: string): Promise<number> {
  let probe = dir;
  while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const stats = await statfs(probe);
  return Math.max(0, Math.floor((Number(stats.bavail) * Number(stats.bsize)) / (1024 * 1024)));
}

function osOf(): DeviceReport['os'] {
  if (process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32') return process.platform;
  throw new Error('This computer’s system is not one the video kit runs on.');
}

function archOf(): DeviceReport['arch'] {
  if (process.arch === 'arm64' || process.arch === 'x64') return process.arch;
  throw new Error('This computer’s processor is not one the video kit runs on.');
}

export async function deviceReport(input: {
  home: string;
  worker: boolean;
  tools: Toolchain;
  browser: ToolReport;
}): Promise<DeviceReport> {
  const { problem: _ignored, ...browser } = input.browser as ToolReport & { problem?: string };
  return {
    device_id: await deviceId(input.home),
    kind: input.worker ? 'worker' : 'computer',
    os: osOf(),
    arch: archOf(),
    kit_version: KIT_VERSION,
    interfaces: [...KIT_INTERFACES],
    ffmpeg: input.tools.ffmpeg.report,
    ffprobe: input.tools.ffprobe.report,
    browser,
    disk_free_mb: await freeDiskMb(input.home),
    parts: cachedParts(input.home),
  };
}
