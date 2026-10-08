/**
 * GOOSE-3718 — `gooseworks doctor` must prove the machine can run the local
 * video worker, not just that binaries resolve on PATH.
 */
import { spawnSync } from 'child_process';

jest.mock('child_process', () => ({ spawnSync: jest.fn() }));
jest.mock('../../src/utils/browser-preflight', () => ({ checkBrowserPreflight: jest.fn() }));
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
import { createDoctorCommand, runDoctorChecks } from '../../src/commands/doctor';
import { checkBrowserPreflight } from '../../src/utils/browser-preflight';

const mockSpawn = spawnSync as jest.MockedFunction<typeof spawnSync>;
const mockBrowser = checkBrowserPreflight as jest.MockedFunction<typeof checkBrowserPreflight>;
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
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreds.mockReturnValue({ api_key: 'k', api_base: 'https://x', email: 'e', mcp_server_url: 'https://x/mcp' } as never);
  mockBrowser.mockReturnValue({ ok: true, code: 'ready', detail: 'Chromium launched and closed; /cache/ms-playwright', fix: '' });
  process.exitCode = undefined;
});

describe('runDoctorChecks', () => {
  it('passes general setup without claiming to certify a selected renderer', () => {
    machine(healthy);
    const checks = runDoctorChecks();
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.id)).toEqual(['login', 'mcp', 'node', 'ffmpeg', 'ffprobe', 'chromium']);
    expect(checks.find((c) => c.id === 'chromium')?.detail).toContain('ms-playwright');
    expect(checks.find((c) => c.id === 'chromium')?.label).toContain('General');
    expect(mockBrowser).toHaveBeenCalledWith({ rendererScript: undefined });
  });

  it('fails Chromium when the Playwright package resolves but the browser was never downloaded', () => {
    machine(healthy);
    mockBrowser.mockReturnValue({ ok: false, code: 'missing_browser', detail: 'Chromium is not downloaded', fix: 'cd scripts && node playwright/cli.js install chromium' });
    const chromium = runDoctorChecks().find((c) => c.id === 'chromium')!;
    expect(chromium.ok).toBe(false);
    expect(chromium.detail).toMatch(/not downloaded/);
    expect(chromium.fix).toContain('scripts');
  });

  it('passes the exact renderer path to the bounded browser probe', () => {
    machine(healthy);
    const chromium = runDoctorChecks({ rendererScript: '/fetched with spaces/scripts/record-chat.js' }).find((c) => c.id === 'chromium')!;
    expect(chromium.label).toContain('Selected renderer');
    expect(mockBrowser).toHaveBeenCalledWith({ rendererScript: '/fetched with spaces/scripts/record-chat.js' });
  });

  it('does not probe any browser for non-browser/common setup', () => {
    machine(healthy);
    mockBrowser.mockReturnValue({ ok: false, code: 'missing_module', detail: 'missing', fix: 'install' });
    expect(runDoctorChecks({ includeBrowser: false }).map((c) => c.id)).toEqual(['login', 'mcp', 'node', 'ffmpeg', 'ffprobe']);
    expect(mockBrowser).not.toHaveBeenCalled();
  });

  it('rejects bypassing an explicitly selected renderer', () => {
    expect(() => runDoctorChecks({ includeBrowser: false, rendererScript: 'scripts/record.js' })).toThrow(/cannot be combined/);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockCreds).not.toHaveBeenCalled();
  });

  it('allows Pillow captions when the build lacks libass', () => {
    machine({ ...healthy, 'ffmpeg -hide_banner -filters': { status: 0, stdout: ' ... scale V->V\n' } });
    const ffmpeg = runDoctorChecks().find((c) => c.id === 'ffmpeg')!;
    expect(ffmpeg.ok).toBe(true);
    expect(ffmpeg.detail).toMatch(/Pillow overlays supported/);
  });

  it('rejects a build without H.264 encoding', () => {
    machine({ ...healthy, 'ffmpeg -hide_banner -encoders': { status: 0, stdout: 'mpeg4' } });
    expect(runDoctorChecks().find(c => c.id === 'ffmpeg')).toMatchObject({ ok: false, detail: 'ffmpeg is installed but lacks libx264 encoder' });
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
    await createDoctorCommand().parseAsync(['node', 'doctor']);
    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('ffprobe on PATH  →  fix: bundled with ffmpeg'));
    expect(process.exitCode).toBe(1);
  });

  it('--json prints the checks for an agent to parse', async () => {
    machine(healthy);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await createDoctorCommand().parseAsync(['node', 'doctor', '--json']);
    const parsed = JSON.parse(log.mock.calls[0][0] as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.checks).toHaveLength(6);
    expect(process.exitCode).toBeUndefined();
    log.mockRestore();
  });

  it('--no-browser keeps auth/Node/ffmpeg checks and prints scoped success', async () => {
    machine(healthy);
    await createDoctorCommand().parseAsync(['node', 'doctor', '--no-browser']);
    expect(mockBrowser).not.toHaveBeenCalled();
    expect(loggerModule.success).toHaveBeenCalledWith(expect.stringContaining('After fetching a browser renderer'));
  });

  it('--renderer-script emits actionable selected-package JSON failures', async () => {
    machine(healthy);
    mockBrowser.mockReturnValue({ ok: false, code: 'launch_failed', detail: 'missing shared library', fix: 'folder repair', modulePath: '/fetched/playwright/index.js' });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await createDoctorCommand().parseAsync(['node', 'doctor', '--json', '--renderer-script', '/fetched/record.js']);
    const parsed = JSON.parse(log.mock.calls[0][0] as string);
    expect(parsed.ok).toBe(false);
    expect(parsed.checks.find((c: { id: string }) => c.id === 'chromium')).toMatchObject({ code: 'launch_failed', modulePath: '/fetched/playwright/index.js' });
    expect(process.exitCode).toBe(1);
    log.mockRestore();
  });

  it('rejects contradictory CLI flags instead of silently skipping the renderer', async () => {
    const cmd = createDoctorCommand().exitOverride().configureOutput({ writeErr: () => undefined });
    await expect(cmd.parseAsync(['node', 'doctor', '--no-browser', '--renderer-script', '/fetched/record.js'])).rejects.toThrow(/cannot be combined/);
    expect(mockBrowser).not.toHaveBeenCalled();
  });
});
