// Rule: the kit hands the video over before a first run's slow setup it
// doesn't need for that, so the card shows the video started within seconds.
// The browser is set up after the hand-over, while the kit keeps reporting,
// unless the line won't hand over without it.
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

it('hands the video over first, then sets up the browser while the card hears from the kit', async () => {
  const events: string[] = [];
  const base = fakeLine();
  const line = {
    ...base,
    fetch: (async (input: any, init: any) => {
      const route = new URL(String(input)).pathname.split('/').pop();
      if (route === 'device' || route === 'progress') events.push(route === 'device' ? 'hand-over' : `progress: ${JSON.parse(init.body).note}`);
      return base.fetch(input, init);
    }) as typeof fetch,
  };
  const home = tempHome();
  const result = await runMake({ home, line, host: settingUpHost(events) });
  expect(result.status).toBe('done');
  expect(events.slice(0, 4)).toEqual(['browser check, setup false', 'hand-over', 'progress: Setting up your computer for the video', 'browser check, setup true']);
  // Later reports go back to the run's own notes.
  expect(lineRoute(base.seen, '/progress').slice(-1)[0].body.note).not.toBe('Setting up your computer for the video');
  // The hand-over went before the browser was there; the steps were made with it.
  expect(lineRoute(base.seen, '/device')[0].body.device.browser.ok).toBe(false);
  expect(JSON.parse(readFileSync(runLayout(home, VIDEO).run, 'utf8')).kit.toolchain).toMatch(/chromium-chromium-test$/);
});

it('sets up the browser before handing over again when the line won’t hand over without it', async () => {
  const events: string[] = [];
  const line = fakeLine({
    device: (body, n) =>
      n === 0 && !body.device.browser.ok
        ? json(409, { error: { code: 'device_cannot_make', error: 'This computer can’t make this video’s style yet.', fix: 'Run the check again so it sets up what is missing.', next: 'stop', details: { missing: ['browser'] } } })
        : undefined,
  });
  const result = await runMake({ home: tempHome(), line, host: settingUpHost(events) });
  expect(result.status).toBe('done');
  expect(events).toEqual(['browser check, setup false', 'browser check, setup true']);
  expect(lineRoute(line.seen, '/device').map((s) => s.body.device.browser.ok)).toEqual([false, true]);
});

it('stops on the line’s words when something else is missing', async () => {
  const line = fakeLine({
    device: () => json(409, { error: { code: 'device_cannot_make', error: 'This computer can’t make this video’s style yet.', fix: 'Run the check again so it sets up what is missing.', next: 'stop', details: { missing: ['ffmpeg'] } } }),
  });
  const result = await runMake({ home: tempHome(), line, host: settingUpHost([]) });
  expect(result).toEqual({ status: 'stopped', message: 'This computer can’t make this video’s style yet.' });
  expect(lineRoute(line.seen, '/device')).toHaveLength(1);
});
