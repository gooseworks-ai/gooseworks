// Rule: the kit hands the video over before a first run's slow setup, so the
// card shows the video started within seconds. Without the browser the
// hand-over is a claim; the full report follows once the browser is set up.
// An older line gets the full report first, as before.
import { readFileSync } from 'fs';
import type { KitHost } from '../../src/kit/core/host';
import { runLayout } from '../../src/kit/core/paths';
import { VIDEO, fakeLine, lineRoute, runMake, tempHome, testHost, testParts } from './harness';

/** A host whose browser is set up only when asked to, recording each check. */
function settingUpHost(events: string[]): KitHost {
  const host = testHost(testParts());
  let installed = false;
  host.browser.check = async ({ setup }) => {
    events.push(`browser check, setup ${setup}`);
    if (setup) installed = true;
    return installed ? { ok: true, version: 'chromium-test', bundled: true } : { ok: false, version: null, bundled: true, problem: 'the video browser is not set up yet' };
  };
  return host;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An older line: it doesn't take the `setup` claim. */
const noClaims = (body: any) =>
  body.device.setup !== undefined
    ? json(400, { error: { code: 'unknown_fields', error: 'The request has fields this line doesn’t take.', fix: 'Remove device.setup.', next: 'change_request', details: { fields: ['device.setup'] } } })
    : undefined;

const cannotMake = (missing: string[]) =>
  json(409, { error: { code: 'device_cannot_make', error: 'This computer can’t make this video’s style yet.', fix: 'Run the check again so it sets up what is missing.', next: 'stop', details: { missing } } });

it('claims the video first, sets up the browser while the card hears from the kit, then sends the full report', async () => {
  const events: string[] = [];
  const base = fakeLine();
  const line = {
    ...base,
    fetch: (async (input: any, init: any) => {
      const route = new URL(String(input)).pathname.split('/').pop();
      if (route === 'device') {
        const { device } = JSON.parse(init.body);
        events.push(device.setup ? `claim, browser ${device.browser.ok}` : `hand-over, browser ${device.browser.ok}`);
      }
      if (route === 'progress') events.push(`progress: ${JSON.parse(init.body).note}`);
      return base.fetch(input, init);
    }) as typeof fetch,
  };
  const home = tempHome();
  const result = await runMake({ home, line, host: settingUpHost(events) });
  expect(result.status).toBe('done');
  expect(events.slice(0, 5)).toEqual(['browser check, setup false', 'claim, browser false', 'progress: Setting up your computer for the video', 'browser check, setup true', 'hand-over, browser true']);
  // Later reports go back to the run's own notes.
  expect(lineRoute(base.seen, '/progress').slice(-1)[0].body.note).not.toBe('Setting up your computer for the video');
  expect(JSON.parse(readFileSync(runLayout(home, VIDEO).run, 'utf8')).kit.toolchain).toMatch(/chromium-chromium-test$/);
});

it('stops on the line’s words when the full report after the claim shows the computer can’t make the video', async () => {
  const events: string[] = [];
  const host = settingUpHost(events);
  host.browser.check = async () => ({ ok: false, version: null, bundled: true, problem: 'the browser download failed' });
  const line = fakeLine({ device: (body) => (body.device.setup ? undefined : cannotMake(['browser'])) });
  const result = await runMake({ home: tempHome(), line, host });
  expect(result).toMatchObject({ code: 'device_cannot_make', status: 'stopped', message: 'This computer can’t make this video’s style yet. Run the check again so it sets up what is missing.' });
  expect(lineRoute(line.seen, '/pieces')).toEqual([]);
});

it('hands over on the full report to an older line, then tells it once the browser is set up', async () => {
  const events: string[] = [];
  const line = fakeLine({ device: noClaims });
  const result = await runMake({ home: tempHome(), line, host: settingUpHost(events) });
  expect(result.status).toBe('done');
  expect(lineRoute(line.seen, '/device').map((s) => [s.body.device.setup ?? null, s.body.device.browser.ok])).toEqual([
    ['in_progress', false],
    [null, false],
    [null, true],
  ]);
});

it('sets up the browser before handing over again when an older line won’t hand over without it', async () => {
  const events: string[] = [];
  const line = fakeLine({ device: (body, n) => noClaims(body) ?? (n === 1 && !body.device.browser.ok ? cannotMake(['browser']) : undefined) });
  const result = await runMake({ home: tempHome(), line, host: settingUpHost(events) });
  expect(result.status).toBe('done');
  expect(events).toEqual(['browser check, setup false', 'browser check, setup true']);
  expect(lineRoute(line.seen, '/device').map((s) => s.body.device.browser.ok)).toEqual([false, false, true]);
});

it('stops on the line’s words when something else is missing', async () => {
  const line = fakeLine({ device: () => cannotMake(['ffmpeg']) });
  const result = await runMake({ home: tempHome(), line, host: settingUpHost([]) });
  expect(result).toMatchObject({ code: 'device_cannot_make', status: 'stopped', message: 'This computer can’t make this video’s style yet. Run the check again so it sets up what is missing.' });
  expect(lineRoute(line.seen, '/device')).toHaveLength(1);
});
