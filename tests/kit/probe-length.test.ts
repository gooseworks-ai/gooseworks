// A playable recording written as a stream (WebM, Matroska through a pipe)
// has no length in its header; the probe still finds one.
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { kitTools, packetSpan, parseProbe } from '../../src/kit/core/toolchain';

const probeJson = (format: Record<string, unknown>, streams: Array<Record<string, unknown>>) => JSON.stringify({ format, streams });

describe('the probe finds a length without one in the header', () => {
  it('uses the header length first', () => {
    expect(parseProbe(probeJson({ duration: '4.5' }, [{ codec_type: 'video', duration: '9' }])).duration_s).toBe(4.5);
  });

  it('falls back to the video stream, then the audio stream', () => {
    expect(parseProbe(probeJson({}, [{ codec_type: 'video', duration: '3.2' }, { codec_type: 'audio', duration: '3.4' }])).duration_s).toBe(3.2);
    expect(parseProbe(probeJson({}, [{ codec_type: 'video' }, { codec_type: 'audio', duration: '3.4' }])).duration_s).toBe(3.4);
  });

  it('reads a Matroska DURATION tag', () => {
    expect(parseProbe(probeJson({}, [{ codec_type: 'video', tags: { DURATION: '00:01:02.500000000' } }])).duration_s).toBe(62.5);
    expect(parseProbe(probeJson({}, [{ codec_type: 'audio', tags: { 'DURATION-eng': '00:00:07.250000000' } }])).duration_s).toBe(7.25);
  });

  it('leaves the length out when nothing names one', () => {
    expect(parseProbe(probeJson({}, [{ codec_type: 'video', tags: {} }])).duration_s).toBeUndefined();
  });

  it('spans packets from the first time to the last packet’s end', () => {
    expect(packetSpan('0.000000,0.033000\n2.967000,0.033000\n1.000000,N/A\n')).toBe(3);
    expect(packetSpan('1.000000,N/A\n3.500000,N/A\n')).toBe(2.5);
    expect(packetSpan('')).toBeUndefined();
    expect(packetSpan('N/A,N/A\n')).toBeUndefined();
  });
});

const which = (name: string): string | null => {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
};
const ffmpeg = process.env.FFMPEG_PATH || which('ffmpeg');
const ffprobe = process.env.FFPROBE_PATH || which('ffprobe');
const withTools = ffmpeg && ffprobe ? describe : describe.skip;

withTools('a Matroska file remuxed through a pipe (needs ffmpeg)', () => {
  it('gets its length from the last packet', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'kit-probe-'));
    const source = path.join(dir, 'source.mp4');
    const made = spawnSync(ffmpeg!, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=25', '-t', '2', '-c:v', 'mpeg4', source]);
    expect(made.status).toBe(0);
    const piped = spawnSync(ffmpeg!, ['-v', 'error', '-i', source, '-c', 'copy', '-f', 'matroska', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
    expect(piped.status).toBe(0);
    const streamed = path.join(dir, 'streamed.mkv');
    writeFileSync(streamed, piped.stdout);

    const tools = kitTools({ ffmpeg: ffmpeg!, ffprobe: ffprobe!, toolchain: 'test' }, new AbortController().signal);
    const header = await tools.exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', streamed]);
    // The case this guards: the header names no length at all.
    expect(parseProbe(header.stdout).duration_s).toBeUndefined();
    const info = await tools.probe(streamed);
    expect(info.duration_s).toBeCloseTo(2, 1);
    expect(info.width).toBe(160);
  });
});
