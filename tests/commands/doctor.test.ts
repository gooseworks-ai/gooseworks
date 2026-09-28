/**
 * GOOSE-3718 — `gooseworks doctor` must prove the machine can run the local
 * video worker, not just that binaries resolve on PATH.
 */
import * as fs from 'fs';
import { spawnSync } from 'child_process';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));
jest.mock('../../src/auth/credentials', () => ({ getCredentials: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
  spinner: jest.fn().mockReturnValue({ stop: jest.fn() }),
  done: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import * as loggerModule from '../../src/utils/logger';
import { doctorCommand, runDoctorChecks } from '../../src/commands/doctor';

const mockSpawn = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockExists = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockCreds = getCredentials as jest.MockedFunction<typeof getCredentials>;

type Reply = { status: number; stdout?: string };

/** Script the machine: which probes succeed and what they print. */
function machine(replies: Record<string, Reply>) {
  mockSpawn.mockImplementation(((bin: string, args: string[]) => {
    const key = `${bin} ${args.join(' ')}`;
    const match = Object.keys(replies).find((k) => key.includes(k));
    const r = match ? replies[match] : { status: 1 };
    return { status: r.status, stdout: r.stdout ?? '', stderr: '' } as never;
  }) as never);
}

const healthy = {
  'which ffmpeg': { status: 0 },
  'which ffprobe': { status: 0 },
  'ffmpeg -hide_banner -encoders': { status: 0, stdout: ' V..... libx264 H.264\n' },
  'ffmpeg -hide_banner -filters': { status: 0, stdout: ' ... ass  V->V  Render ASS subtitles\n' },
  "require('playwright')": { status: 0, stdout: '/cache/ms-playwright/chromium-1200/chrome-mac/Chromium.app' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreds.mockReturnValue({ api_key: 'k', api_base: 'https://x', email: 'e', mcp_server_url: 'https://x/mcp' } as never);
  mockExists.mockReturnValue(true);
  process.exitCode = undefined;
});

describe('runDoctorChecks', () => {
  it('passes on a healthy machine and reports where Chromium lives', () => {
    machine(healthy);
    const checks = runDoctorChecks();
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.id)).toEqual(['login', 'mcp', 'node', 'ffmpeg', 'ffprobe', 'chromium']);
    expect(checks.find((c) => c.id === 'chromium')?.detail).toContain('ms-playwright');
  });

  it('fails Chromium when the Playwright package resolves but the browser was never downloaded', () => {
    machine(healthy);
    mockExists.mockReturnValue(false);
    const chromium = runDoctorChecks().find((c) => c.id === 'chromium')!;
    expect(chromium.ok).toBe(false);
    expect(chromium.detail).toMatch(/not downloaded/);
    expect(chromium.fix).toBe('npx playwright install chromium');
  });

  it('falls back to the playwright CLI dry run when the package is not resolvable', () => {
    machine({
      ...healthy,
      "require('playwright')": { status: 2 },
      'playwright install --dry-run chromium': { status: 0, stdout: 'browser: chromium\n  Install location:    /home/u/.cache/ms-playwright/chromium-1200\n' },
    });
    const chromium = runDoctorChecks().find((c) => c.id === 'chromium')!;
    expect(chromium.ok).toBe(true);
    expect(chromium.detail).toBe('/home/u/.cache/ms-playwright/chromium-1200');
  });

  it('fails ffmpeg when the build lacks libx264 or libass, even though ffmpeg is on PATH', () => {
    machine({ ...healthy, 'ffmpeg -hide_banner -filters': { status: 0, stdout: ' ... scale V->V\n' } });
    const ffmpeg = runDoctorChecks().find((c) => c.id === 'ffmpeg')!;
    expect(ffmpeg.ok).toBe(false);
    expect(ffmpeg.detail).toMatch(/lacks libass/);
  });

  it('skips the auth checks when asked (install runs it before login is guaranteed)', () => {
    machine(healthy);
    const ids = runDoctorChecks({ includeAuth: false }).map((c) => c.id);
    expect(ids).toEqual(['node', 'ffmpeg', 'ffprobe', 'chromium']);
    expect(mockCreds).not.toHaveBeenCalled();
  });
});

describe('doctor command', () => {
  it('prints a fix per failing check and exits non-zero', async () => {
    machine({ ...healthy, 'which ffprobe': { status: 1 } });
    await doctorCommand.parseAsync(['node', 'doctor']);
    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('ffprobe on PATH  →  fix: bundled with ffmpeg'));
    expect(process.exitCode).toBe(1);
  });

  it('--json prints the checks for an agent to parse', async () => {
    machine(healthy);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await doctorCommand.parseAsync(['node', 'doctor', '--json']);
    const parsed = JSON.parse(log.mock.calls[0][0] as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.checks).toHaveLength(6);
    expect(process.exitCode).toBeUndefined();
    log.mockRestore();
  });
});
