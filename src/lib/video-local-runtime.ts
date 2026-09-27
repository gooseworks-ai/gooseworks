import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { createReadStream } from 'fs';
import { open, stat } from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import type { CaptionClaim, CaptionClaimStatus, CaptionRuntime, CaptionTransport, MediaProbe } from './video-local-captions';
import { MAX_CAPTION_SOURCE_BYTES } from './video-local-captions';

const MAX_OUTPUT_BYTES = 150 * 1024 * 1024;

function run(bin: string, args: string[], cwd?: string, timeoutMs = 10 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-1024 * 1024);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`${bin} failed (${code ?? 'timeout'}): ${output.slice(-500)}`));
    });
  });
}

export const LOCAL_UPLOAD_TIMEOUT_MS = 10 * 60_000;

async function fetchJson<T>(url: string, apiKey: string, init: RequestInit, timeoutMs = 30_000): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Video-local API returned HTTP ${response.status}`);
  const parsed = await response.json() as { status?: string; data?: T };
  if (parsed.status !== 'success') throw new Error('Video-local API returned an unsuccessful response');
  return parsed.data as T;
}

/** HTTP transport uses only the scoped, authenticated local-node route. */
export function createCaptionTransport(apiBase: string, apiKey: string): CaptionTransport {
  if (!apiKey.startsWith('cal_')) throw new Error('A cal_ GooseWorks token is required for local video claims');
  const base = `${apiBase.replace(/\/$/, '')}/api/ads/video-local`;
  return {
    async next(projectId, workerId) {
      const query = new URLSearchParams({ project_id: projectId, worker_id: workerId });
      return fetchJson<CaptionClaim | null>(`${base}/claims/next?${query}`, apiKey, { method: 'GET' });
    },
    async status(claimId, leaseToken) {
      return fetchJson<CaptionClaimStatus>(`${base}/claims/${encodeURIComponent(claimId)}`, apiKey, {
        method: 'GET', headers: { 'X-Video-Local-Lease': leaseToken },
      });
    },
    async heartbeat(claimId, leaseToken) {
      await fetchJson(`${base}/claims/${encodeURIComponent(claimId)}/heartbeat`, apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lease_token: leaseToken }),
      });
    },
    async complete(claimId, leaseToken, outputPath, sha256) {
      const info = await stat(outputPath);
      if (!info.isFile() || info.size < 1024 || info.size > MAX_OUTPUT_BYTES) {
        throw new Error('Caption output exceeds the allowed upload size');
      }
      const boundary = `goose-local-${randomBytes(16).toString('hex')}`;
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="lease_token"\r\n\r\n${leaseToken}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="sha256"\r\n\r\n${sha256}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="captioned.mp4"\r\n` +
        'Content-Type: video/mp4\r\n\r\n',
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Readable.from((async function* () {
        yield head;
        for await (const chunk of createReadStream(outputPath)) yield chunk;
        yield tail;
      })());
      await fetchJson(`${base}/claims/${encodeURIComponent(claimId)}/complete`, apiKey, {
        method: 'POST', body: body as unknown as RequestInit['body'],
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(head.length + info.size + tail.length) },
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }, LOCAL_UPLOAD_TIMEOUT_MS);
    },
  };
}

/** Reviewed, fixed ffmpeg flags. Neither the server package nor the user supplies flags. */
export const ffmpegCaptionArgs = (sourceName = 'source.mp4'): string[] => [
  '-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', sourceName,
  '-map', '0:v:0', '-map', '0:a?', '-vf', 'ass=captions.ass',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'copy', '-sn', '-dn', '-movflags', '+faststart', 'captioned.mp4',
];

export function createCaptionRuntime(ffmpeg = 'ffmpeg', ffprobe = 'ffprobe'): CaptionRuntime {
  return {
    async preflight() {
      const version = (await run(ffmpeg, ['-version'])).split('\n')[0];
      const encoders = await run(ffmpeg, ['-hide_banner', '-encoders']);
      const filters = await run(ffmpeg, ['-hide_banner', '-filters']);
      if (!/\blibx264\b/.test(encoders) || !/\bass\b/.test(filters)) {
        throw new Error('ffmpeg requires libx264 and the libass ass filter');
      }
      await run(ffprobe, ['-version']);
      return version;
    },
    async download(url, target, expectedSha256) {
      const response = await fetch(url, {
        redirect: 'error', signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok || !response.body) throw new Error(`Caption source download failed (HTTP ${response.status})`);
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_CAPTION_SOURCE_BYTES) throw new Error('Caption source exceeds size cap');
      const file = await open(target, 'w', 0o600);
      const hash = createHash('sha256');
      let size = 0;
      try {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_CAPTION_SOURCE_BYTES) throw new Error('Caption source exceeds size cap');
          hash.update(value);
          await file.write(value);
        }
      } finally {
        await file.close();
      }
      if (size < 1024) throw new Error('Caption source is too small');
      const actual = hash.digest('hex');
      if (expectedSha256 && actual !== expectedSha256.toLowerCase()) throw new Error('Caption source checksum mismatch');
      return actual;
    },
    async render(source, ass, output) {
      const dir = path.dirname(output);
      if (path.dirname(source) !== dir || path.dirname(ass) !== dir ||
          path.basename(source) !== 'source.mp4' || path.basename(ass) !== 'captions.ass' ||
          path.basename(output) !== 'captioned.mp4') {
        throw new Error('Caption renderer requires its private claim directory');
      }
      await run(ffmpeg, ffmpegCaptionArgs(), dir);
    },
    async probe(output): Promise<MediaProbe> {
      const raw = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration', '-of', 'json', output]);
      const data = JSON.parse(raw) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
      return { width: Number(data.streams?.[0]?.width), height: Number(data.streams?.[0]?.height),
        duration_s: Number(data.format?.duration) };
    },
  };
}
