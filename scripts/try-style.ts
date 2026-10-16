// try-style: make one video from a style file, a plan and a brand on this
// computer, with no server and (by default) no spend. It runs the real kit
// (makeVideo: binding, parts, layers, checks, upload) against an in-process
// private line (scripts/try-style/line.ts). Parts load from a goose-skills
// checkout and the style from a styles folder, so unpublished parts and styles
// can be tried. Paid pieces are answered by scripts/try-style/providers.ts:
// labelled stand-ins by default, or the real providers under a spend cap.
//
//   GOOSE_KIT_PARTS_DIR=<goose-skills checkout> \
//   GOOSE_KIT_STYLES_DIR=<goose-studio>/one-shot-videos \
//   npx tsx scripts/try-style.ts --style <id> --plan plan.json --brand brand.json --out <dir>
//
// Writes <out>/final/final.mp4, <out>/verdict.json, <out>/contact.png,
// <out>/run.json, <out>/pieces.jsonl and (real mode) <out>/spend.json.
// See scripts/try-style/README.md.
import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defaultHost } from '../src/kit/core/host';
import { KitLog } from '../src/kit/core/log';
import { makeVideo, type MakeResult } from '../src/kit/core/run';
import { inspectFfmpeg } from '../src/kit/core/toolchain';
import { VideoLine } from '../src/kit/line/client';
import { createKitBrowserSupport } from '../src/kit/maker/browser';
import { FixtureFiles, freezeBrand, planBody } from './try-style/fixtures';
import { API, tryLine } from './try-style/line';
import { ffmpegFor, probe, run } from './try-style/media';
import { stageStyle } from './try-style/dev-styles';
import { fileSha, MAX_NIGHT_CAP_USD, readEnvKeys, realGateProblems } from './try-style/gates';
import { FakeProvider, RealProvider, SpendLedger, type Provider } from './try-style/providers';

const USAGE = `Usage: npx tsx scripts/try-style.ts --style <id> --plan <plan.json> --brand <brand.json> --out <dir>
  [--providers fake|real] [--cap-usd <n>] [--spend-ledger <file>] [--night-cap-usd <n>]
  [--env-file <.env>] [--reason <text>] [--fixtures <dir>]... [--tools-home <dir>] [--fresh]

Environment: GOOSE_KIT_PARTS_DIR (a goose-skills checkout), GOOSE_KIT_STYLES_DIR (a folder of <style>/style.json).
Real providers need --cap-usd (at most the style's cost.high_usd and $40), --spend-ledger, and a passing
stand-in run of the same style file in a folder next to --out. Keys come from --env-file (FAL_API_KEY or
FAL_KEY, ELEVENLABS_API_KEY) or, without it, from the environment.`;

interface Args {
  style: string;
  plan: string;
  brand: string;
  out: string;
  providers: 'fake' | 'real';
  capUsd: number | null;
  nightCapUsd: number;
  ledger: string | null;
  envFile: string | null;
  reason: string | null;
  fixtures: string[];
  toolsHome: string;
  fresh: boolean;
}

const VALUE_FLAGS = new Set(['style', 'plan', 'brand', 'out', 'providers', 'cap-usd', 'night-cap-usd', 'spend-ledger', 'env-file', 'reason', 'fixtures', 'tools-home']);

function parseArgs(argv: string[]): Args {
  const get = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument ${a}`);
    const [name, inline] = a.slice(2).split('=', 2);
    if (name === 'fresh' || name === 'help') {
      flags.add(name);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new Error(`Unknown flag --${name}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    get.set(name, [...(get.get(name) ?? []), value]);
  }
  if (flags.has('help')) {
    console.log(USAGE);
    process.exit(0);
  }
  const one = (n: string, required = true) => {
    const v = get.get(n)?.at(-1);
    if (!v && required) throw new Error(`--${n} is required`);
    return v ?? '';
  };
  const providers = (one('providers', false) || 'fake') as Args['providers'];
  if (providers !== 'fake' && providers !== 'real') throw new Error('--providers is fake or real');
  const cap = one('cap-usd', false);
  const night = one('night-cap-usd', false) || process.env.GOOSE_TRY_NIGHT_CAP_USD || String(MAX_NIGHT_CAP_USD);
  const envFile = one('env-file', false);
  return {
    style: one('style'),
    plan: path.resolve(one('plan')),
    brand: path.resolve(one('brand')),
    out: path.resolve(one('out')),
    providers,
    capUsd: cap ? Number(cap) : null,
    nightCapUsd: Number(night),
    ledger: one('spend-ledger', false) || process.env.GOOSE_TRY_SPEND_LEDGER || null,
    envFile: envFile ? path.resolve(envFile) : null,
    reason: one('reason', false).trim() || null,
    fixtures: [...(get.get('fixtures') ?? []), ...(process.env.GOOSE_TRY_FIXTURES ?? '').split(path.delimiter).filter(Boolean)].map((d) => path.resolve(d)),
    toolsHome: path.resolve(one('tools-home', false) || process.env.GOOSE_TRY_TOOLS_HOME || path.join(os.homedir(), '.gooseworks-try-style')),
    fresh: flags.has('fresh'),
  };
}

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

/** Secret-looking names are never handed to the kit, its parts or their tools. */
const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i;

/** Only the pinned ffmpeg build is ever downloaded, and only from its release page. */
async function toolDownload(url: string, maxBytes: number): Promise<Buffer> {
  if (!url.startsWith('https://github.com/eugeneware/ffmpeg-static/releases/download/')) throw new Error(`try-style refused to download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new Error('download larger than expected');
  return data;
}

function layersOf(partsDir: string): Record<string, { id: string; version: string }> {
  for (const file of [path.join(partsDir, 'parts', 'layers.json'), path.join(partsDir, 'layers.json')]) {
    if (existsSync(file)) return (readJson(file) as { layers: Record<string, { id: string; version: string }> }).layers;
  }
  throw new Error(`No layers.json in ${partsDir} (looked in parts/ and the folder itself).`);
}

async function contactSheet(ffmpeg: string, ffprobe: string, video: string, out: string): Promise<void> {
  const tools = { ffmpeg, ffprobe, drawtext: false, font: null };
  const seconds = Math.max(1, Math.round((await probe(tools, video)).duration_s));
  const cols = Math.min(6, seconds);
  const rows = Math.ceil(seconds / cols);
  const r = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-vf', `fps=1,scale=180:-2,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
  if (r.code !== 0) throw new Error(`contact sheet failed: ${r.err.trim().split('\n').at(-1)}`);
}

/** The last run's own log, as the video's log.ndjson names it; log.ndjson itself before per-run logs. */
function lastRunLog(runRoot: string): string {
  const index = path.join(runRoot, 'log.ndjson');
  if (!existsSync(index)) return index;
  for (const line of readFileSync(index, 'utf8').trim().split('\n').reverse()) {
    try {
      const entry = JSON.parse(line) as { message?: unknown; fields?: { file?: unknown } };
      if (entry.message === 'run started' && typeof entry.fields?.file === 'string') return path.join(runRoot, entry.fields.file);
    } catch {
      // A torn line: look further back.
    }
  }
  return index;
}

function lastProblems(logFile: string, n = 12): string[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((l) => /"level":"(warn|error)"/.test(l))
    .slice(-n);
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const partsDir = process.env.GOOSE_KIT_PARTS_DIR;
  const stylesDir = process.env.GOOSE_KIT_STYLES_DIR;
  if (!partsDir || !stylesDir) {
    console.error(`GOOSE_KIT_PARTS_DIR and GOOSE_KIT_STYLES_DIR must both be set.\n\n${USAGE}`);
    return 2;
  }
  const styleFile = path.join(path.resolve(stylesDir), args.style, 'style.json');
  if (!existsSync(styleFile)) {
    console.error(`No style ${args.style} at ${styleFile}.`);
    return 2;
  }
  const style = readJson(styleFile);
  const styleSha = fileSha(styleFile);
  const runId = `${args.style}:${path.basename(args.out)}:${randomUUID().slice(0, 8)}`;

  // The provider first: real mode refuses to start without every gate.
  let provider: Provider;
  let real: RealProvider | null = null;
  if (args.providers === 'real') {
    if (!args.ledger) {
      console.error('--providers real needs --spend-ledger <file> (or GOOSE_TRY_SPEND_LEDGER).');
      return 2;
    }
    const ledger = new SpendLedger(path.resolve(args.ledger));
    const problems = realGateProblems({ style, styleId: args.style, styleSha, out: args.out, capUsd: args.capUsd, nightCapUsd: args.nightCapUsd, reason: args.reason, ledger });
    if (problems.length) {
      console.error(`Real mode refused; nothing was sent:\n- ${problems.join('\n- ')}`);
      return 3;
    }
    let keys: { fal?: string; elevenlabs?: string };
    if (args.envFile) {
      if (!existsSync(args.envFile)) {
        console.error(`No env file at ${args.envFile}.`);
        return 2;
      }
      keys = readEnvKeys(args.envFile);
    } else {
      keys = { fal: process.env.FAL_KEY || process.env.FAL_API_KEY, elevenlabs: process.env.ELEVENLABS_API_KEY };
    }
    real = new RealProvider({ capUsd: args.capUsd!, nightCapUsd: args.nightCapUsd, ledger, run_id: runId, style_id: args.style, style_sha: styleSha, ...(args.reason ? { reason: args.reason } : {}), keys });
    provider = real;
  } else {
    provider = new FakeProvider();
  }

  // The plan and brand, with their files frozen and served by the fake line.
  const files = new FixtureFiles(args.fixtures);
  files.loadIndexNear(path.dirname(args.plan));
  files.loadIndexNear(path.dirname(args.brand));
  const body = planBody(readJson(args.plan), style as { aspects?: string[] }, files, path.dirname(args.plan));
  const brand = freezeBrand(readJson(args.brand), files, path.dirname(args.brand));
  if (files.problems.length) {
    console.error(`The plan or brand has files that do not check out: ${files.problems.join('; ')}`);
    return 2;
  }
  if (files.missing.length) {
    console.error(`These files named in the plan or brand were not found: ${[...new Set(files.missing)].join(', ')}\nLooked next to the JSON files, in --fixtures folders and in ${process.cwd()}.`);
    return 2;
  }

  // The kit's own ffmpeg and browser, set up once in the tools home (never through the line).
  mkdirSync(args.toolsHome, { recursive: true });
  const say = (line: string) => console.log(`[try-style] ${line}`);
  const tools = await inspectFfmpeg({ home: args.toolsHome, setup: true, download: toolDownload, say });
  if (!tools.ffmpeg.path || !tools.ffprobe.path) {
    console.error(`The kit's video tools are not usable: ${tools.ffmpeg.problem ?? tools.ffprobe.problem ?? 'unknown'}`);
    return 2;
  }
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(args.toolsHome, 'kit', 'browsers');
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const browser = await createKitBrowserSupport().check({ home: args.toolsHome, setup: true, env: {}, say });
    if (!browser.ok) say(`the video browser is not ready (${browser.problem ?? 'unknown'}); styles that draw pages will stop`);
  }
  const media = await ffmpegFor(tools.ffmpeg.path, tools.ffprobe.path);

  // The run folder.
  const videoId = `try_${args.style.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 64);
  const home = path.join(args.out, 'home');
  const work = path.join(args.out, 'line');
  const pieceLog = path.join(args.out, 'pieces.jsonl');
  if (args.fresh) {
    rmSync(path.join(home, 'videos', videoId), { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
    rmSync(pieceLog, { force: true });
  }
  rmSync(path.join(args.out, 'final'), { recursive: true, force: true });
  rmSync(path.join(args.out, 'verdict.json'), { force: true });
  rmSync(path.join(args.out, 'contact.png'), { force: true });
  rmSync(path.join(args.out, 'run.json'), { force: true });
  rmSync(path.join(args.out, 'spend.json'), { force: true });
  mkdirSync(work, { recursive: true });
  // The kit reads the style from a copy inside the run folder, so the style's own files can be sent to a provider
  // (the kit hosts only files inside the video's folder). style_sha above stays the original file's.
  const kitStylesDir = stageStyle(stylesDir, args.style, path.join(home, 'videos', videoId));

  const line = tryLine({
    videoId,
    style,
    body,
    brand,
    layers: layersOf(partsDir),
    planFiles: files.served,
    lineFiles: files.lineFiles,
    provider,
    tools: media,
    workDir: work,
    pieceLog,
    ...(provider.mode === 'fake' ? { fakeRun: { runRoot: path.join(home, 'videos', videoId), partsDir } } : {}),
    onRefused: (url) => say(`refused a call to ${new URL(url).origin}`),
    ...(real ? { realFetch: fetch } : {}),
  });
  const client = new VideoLine({ apiBase: API, deviceId: randomUUID(), login: 'try-style-local', fetch: line.fetch });
  const kitEnv: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET.test(k)) kitEnv[k] = v;
  Object.assign(kitEnv, {
    GOOSEWORKS_API_BASE: API,
    GOOSE_KIT_PARTS_DIR: path.resolve(partsDir),
    GOOSE_KIT_STYLES_DIR: kitStylesDir,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  });
  delete kitEnv.GOOSE_KIT_HOME;

  say(`style ${args.style}@${String(style.version)} · providers ${provider.mode} · parts ${partsDir}`);
  const started = Date.now();
  let result: MakeResult;
  try {
    result = await makeVideo(videoId, {
      home,
      env: kitEnv,
      line: client,
      host: defaultHost(),
      log: new KitLog((text) => say(text), (text) => client.redact(text)),
      environment: 'local',
      tools,
    });
  } finally {
    await line.settle();
  }
  const seconds = Math.round((Date.now() - started) / 1000);

  // Outputs.
  const runRoot = path.join(home, 'videos', videoId);
  const finalDir = path.join(args.out, 'final');
  mkdirSync(finalDir, { recursive: true });
  let video: string | null = null;
  const made = path.join(runRoot, 'final', 'final.mp4');
  if (existsSync(made)) {
    video = path.join(finalDir, 'final.mp4');
    copyFileSync(made, video);
    if (existsSync(path.join(runRoot, 'final', 'captions.vtt'))) copyFileSync(path.join(runRoot, 'final', 'captions.vtt'), path.join(finalDir, 'captions.vtt'));
  } else {
    // A failed check keeps no final: the cut it judged is the check layer's input.
    const record = path.join(runRoot, 'layers', 'check', 'record.json');
    const cut = existsSync(record) ? (readJson(record) as { inputs?: { video?: { path?: string } } }).inputs?.video?.path : undefined;
    if (cut && existsSync(cut)) {
      video = path.join(finalDir, 'checked-cut.mp4');
      copyFileSync(cut, video);
    }
  }
  const checkFile = path.join(runRoot, 'final', 'check.json');
  const verdict = existsSync(checkFile) ? readJson(checkFile) : { pass: false, checks: [] };
  const checks = (verdict.checks as Array<{ code: string; status: string; found?: unknown; expected?: unknown }>) ?? [];
  const fails = checks.filter((c) => c.status === 'fail');
  writeFileSync(
    path.join(args.out, 'verdict.json'),
    `${JSON.stringify(
      {
        ...verdict,
        run: {
          status: result.status,
          message: result.message,
          style: { id: args.style, version: style.version },
          providers: provider.mode,
          seconds,
          video: video ? path.relative(args.out, video) : null,
          ...(real ? { usd_estimate: +real.runSpentUsd.toFixed(4) } : {}),
          refused_addresses: line.refused.length,
        },
      },
      null,
      2,
    )}\n`,
  );
  let contactProblem: string | null = null;
  if (video) {
    try {
      await contactSheet(tools.ffmpeg.path, tools.ffprobe.path, video, path.join(args.out, 'contact.png'));
    } catch (error) {
      contactProblem = (error as Error).message;
      say(contactProblem);
    }
  }

  // run.json: what was run, so a later real run can find this stand-in (MASTER-PLAN §4.11).
  let outputSeconds: number | null = null;
  if (video) outputSeconds = (await probe({ ffmpeg: tools.ffmpeg.path, ffprobe: tools.ffprobe.path, drawtext: false, font: null }, video).catch(() => null))?.duration_s ?? null;
  const partVersions: Record<string, string> = {};
  for (const step of (style.timeline as Array<{ id?: string; part?: unknown }> | undefined) ?? []) {
    const part = step?.part as { id?: unknown; version?: unknown } | string | undefined;
    if (!step?.id || !part) continue;
    if (typeof part === 'string') partVersions[step.id] = part;
    else if (typeof part.id === 'string') partVersions[step.id] = `${part.id}@${String(part.version)}`;
  }
  const failed = result.status !== 'done' || fails.length > 0 || !video || !existsSync(path.join(args.out, 'contact.png'));
  writeFileSync(
    path.join(args.out, 'run.json'),
    `${JSON.stringify(
      {
        run_id: runId,
        providers: provider.mode,
        style_id: args.style,
        style_version: style.version ?? null,
        style_sha: styleSha,
        status: failed ? 'failed' : 'done',
        kit_status: result.status,
        checks_failed: fails.map((c) => c.code),
        parts_dir: path.resolve(partsDir),
        part_versions: partVersions,
        layer_versions: Object.fromEntries(Object.entries(layersOf(partsDir)).map(([k, v]) => [k, `${v.id}@${v.version}`])),
        seconds,
        output_seconds: outputSeconds,
        seconds_per_output_second: outputSeconds ? +(seconds / outputSeconds).toFixed(2) : null,
        ...(args.reason ? { reason: args.reason } : {}),
      },
      null,
      2,
    )}\n`,
  );
  if (real) {
    writeFileSync(path.join(args.out, 'spend.json'), `${JSON.stringify({ run_id: runId, style_id: args.style, style_sha: styleSha, usd_estimate: +real.runSpentUsd.toFixed(4), cap_usd: args.capUsd, ledger: path.resolve(args.ledger!) }, null, 2)}\n`);
  }

  // Summary.
  say(`${result.status}: ${result.message}`);
  for (const c of checks) say(`  ${c.status.padEnd(14)} ${c.code}${c.status === 'fail' ? `  found ${JSON.stringify(c.found)} expected ${JSON.stringify(c.expected)}` : ''}`);
  if (result.status !== 'done') for (const l of lastProblems(lastRunLog(runRoot))) say(`  log: ${l.slice(0, 600)}`);
  if (real) say(`spent about $${real.runSpentUsd.toFixed(3)} this run (ledger: ${args.ledger})`);
  if (contactProblem || (video && !existsSync(path.join(args.out, 'contact.png')))) say('no contact sheet was made, so this run does not count as passing');
  if (line.refused.length) say(`${line.refused.length} call(s) to other addresses were refused`);
  say(`out: ${args.out} (${seconds} s)`);
  say(`style file sha256 ${styleSha.slice(0, 12)}…`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);
