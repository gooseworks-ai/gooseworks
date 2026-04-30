import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import {
  ApiError,
  deleteStyle,
  getStyleDesignMd,
  listStyles,
  publishStyle,
} from '../../src/lib/graphics-api';
import { resolveExampleFiles } from '../../src/lib/graphics-manifest';

type Responder = (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>;

async function startServer(respond: Responder) {
  const server = http.createServer(async (req, res) => {
    try {
      await respond(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('graphics-api', () => {
  let server: { url: string; close: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  describe('listStyles', () => {
    it('GETs /api/graphics/styles with query params and returns envelope', async () => {
      let captured: { url?: string; auth?: string } = {};
      server = await startServer((req, res) => {
        captured.url = req.url;
        captured.auth = req.headers['authorization'] as string | undefined;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: [{ id: 's1', slug: 'x', name: 'X' }],
            meta: { total: 1 },
          })
        );
      });

      const env = await listStyles(
        { apiBase: server.url, apiKey: 'cal_test' },
        { q: 'foo', mood: 'Organic & Warm', limit: 5 }
      );

      expect(captured.url).toBe(
        '/api/graphics/styles?q=foo&mood=Organic+%26+Warm&limit=5'
      );
      expect(captured.auth).toBe('Bearer cal_test');
      expect(env.data).toEqual([{ id: 's1', slug: 'x', name: 'X' }]);
    });

    it('throws ApiError on 401', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(401);
        res.end(JSON.stringify({ status: 'error', error: 'unauthorized' }));
      });

      await expect(
        listStyles({ apiBase: server.url, apiKey: 'bad' }, {})
      ).rejects.toMatchObject({ name: 'ApiError', status: 401, code: 'unauthorized' });
    });
  });

  describe('getStyleDesignMd', () => {
    it('returns markdown body and etag on 200', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain', ETag: 'W/"v1"' });
        res.end('# hello');
      });

      const out = await getStyleDesignMd(
        { apiBase: server.url, apiKey: null },
        'desert-sunset'
      );
      expect(out.status).toBe(200);
      expect(out.body).toBe('# hello');
      expect(out.etag).toBe('W/"v1"');
    });

    it('forwards If-None-Match and returns 304', async () => {
      let receivedIfNoneMatch: string | undefined;
      server = await startServer((req, res) => {
        receivedIfNoneMatch = req.headers['if-none-match'] as string | undefined;
        res.writeHead(304);
        res.end();
      });

      const out = await getStyleDesignMd(
        { apiBase: server.url, apiKey: null },
        'desert-sunset',
        'W/"v1"'
      );
      expect(receivedIfNoneMatch).toBe('W/"v1"');
      expect(out.status).toBe(304);
      expect(out.body).toBeNull();
      expect(out.etag).toBe('W/"v1"');
    });
  });

  describe('publishStyle', () => {
    let tmpDir: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pub-'));
      fs.writeFileSync(path.join(tmpDir, 'poster.png'), Buffer.from('PNGDATA'));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function manifest() {
      return {
        name: 'Desert Sunset',
        slug: 'desert-sunset',
        description: 'A long enough description for validation purposes.',
        designMd: 'x'.repeat(100),
        examples: [{ format: 'poster', isHero: true, file: './poster.png' }],
      };
    }

    it('uploads multipart and returns the slug+id on 201', async () => {
      let receivedMethod: string | undefined;
      let receivedContentType: string | undefined;
      let receivedBody: Buffer = Buffer.alloc(0);
      let receivedAuth: string | undefined;
      server = await startServer(async (req, res) => {
        receivedMethod = req.method;
        receivedContentType = req.headers['content-type'] as string | undefined;
        receivedAuth = req.headers['authorization'] as string | undefined;
        receivedBody = await readBody(req);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: { slug: 'desert-sunset', id: 'sty_123' },
          })
        );
      });

      const files = resolveExampleFiles(tmpDir, manifest().examples);
      const out = await publishStyle(
        { apiBase: server.url, apiKey: 'cal_test' },
        manifest(),
        files
      );

      expect(out).toEqual({ slug: 'desert-sunset', id: 'sty_123' });
      expect(receivedMethod).toBe('POST');
      expect(receivedAuth).toBe('Bearer cal_test');
      expect(receivedContentType).toMatch(/^multipart\/form-data; boundary=/);
      const bodyStr = receivedBody.toString('utf-8');
      expect(bodyStr).toContain('"name":"Desert Sunset"');
      expect(bodyStr).toContain('PNGDATA');
      expect(bodyStr).toContain('name="poster.png"');
      // Server's image allowlist rejects application/octet-stream — assert
      // we infer the right Content-Type from the file extension.
      expect(bodyStr).toContain('Content-Type: image/png');
      expect(bodyStr).not.toContain('Content-Type: application/octet-stream');
    });

    it('infers image/jpeg Content-Type for .jpg example files', async () => {
      let receivedBody: Buffer = Buffer.alloc(0);
      server = await startServer(async (req, res) => {
        receivedBody = await readBody(req);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: { slug: 'desert-sunset', id: 'sty_123' },
          })
        );
      });

      fs.writeFileSync(path.join(tmpDir, 'hero.jpg'), Buffer.from('JPEGDATA'));
      const m = {
        ...manifest(),
        examples: [{ format: 'poster', isHero: true, file: './hero.jpg' }],
      };
      const files = resolveExampleFiles(tmpDir, m.examples);
      await publishStyle({ apiBase: server.url, apiKey: 'cal_test' }, m, files);

      const bodyStr = receivedBody.toString('utf-8');
      expect(bodyStr).toContain('name="hero.jpg"');
      expect(bodyStr).toContain('Content-Type: image/jpeg');
    });

    it('throws ApiError with body on 400 validation_failed', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'error',
            error: 'validation_failed',
            errors: [{ path: 'description', message: 'too short' }],
          })
        );
      });

      const files = resolveExampleFiles(tmpDir, manifest().examples);
      await expect(
        publishStyle({ apiBase: server.url, apiKey: 'cal_test' }, manifest(), files)
      ).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        code: 'validation_failed',
      });
    });

    it('throws ApiError with code slug_taken on 409', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'error',
            error: 'slug_taken',
            suggested_slug: 'desert-sunset-2',
          })
        );
      });

      const files = resolveExampleFiles(tmpDir, manifest().examples);
      try {
        await publishStyle(
          { apiBase: server.url, apiKey: 'cal_test' },
          manifest(),
          files
        );
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe('slug_taken');
        expect((apiErr.body as { suggested_slug?: string }).suggested_slug).toBe(
          'desert-sunset-2'
        );
      }
    });

    it('throws ApiError on 401', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(401);
        res.end();
      });

      const files = resolveExampleFiles(tmpDir, manifest().examples);
      await expect(
        publishStyle({ apiBase: server.url, apiKey: 'cal_test' }, manifest(), files)
      ).rejects.toMatchObject({ status: 401 });
    });

    it('throws ApiError on 413', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: 'file_too_large', file: 'poster.png' }));
      });

      const files = resolveExampleFiles(tmpDir, manifest().examples);
      await expect(
        publishStyle({ apiBase: server.url, apiKey: 'cal_test' }, manifest(), files)
      ).rejects.toMatchObject({ status: 413 });
    });
  });

  describe('deleteStyle', () => {
    it('sends DELETE and resolves on 200', async () => {
      let receivedMethod: string | undefined;
      let receivedUrl: string | undefined;
      server = await startServer((req, res) => {
        receivedMethod = req.method;
        receivedUrl = req.url;
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'success' }));
      });

      await deleteStyle({ apiBase: server.url, apiKey: 'cal_test' }, 'desert-sunset');
      expect(receivedMethod).toBe('DELETE');
      expect(receivedUrl).toBe('/api/graphics/styles/desert-sunset');
    });

    it('throws ApiError on 403', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: 'forbidden', message: 'not owner' }));
      });

      await expect(
        deleteStyle({ apiBase: server.url, apiKey: 'cal_test' }, 'x')
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
