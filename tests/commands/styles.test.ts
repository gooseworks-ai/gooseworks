import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import { stylesCommand } from '../../src/commands/styles';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

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

function buildSubcommand(name: string) {
  // Re-create the command for each test to avoid commander's shared option
  // state polluting subsequent runs.
  return stylesCommand.commands.find((c) => c.name() === name)!;
}

const baseCreds = (apiBase: string) => ({
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-1',
  api_base: apiBase,
});

describe('styles command', () => {
  let server: { url: string; close: () => Promise<void> } | null = null;
  let exitSpy: jest.SpyInstance;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let cacheDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new Error(`process.exit called: ${code}`);
    });
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-cache-styles-'));
    process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR = cacheDir;
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR;
    if (server) {
      await server.close();
      server = null;
    }
  });

  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  function stderrText(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  describe('list', () => {
    it('renders a table by default', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: [
              {
                id: 's1',
                slug: 'desert-sunset',
                name: 'Desert Sunset',
                moodGroup: 'Organic & Warm',
                featured: true,
                authorHandle: '@shiv',
              },
            ],
          })
        );
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'list']);

      const out = stdoutText();
      expect(out).toContain('Desert Sunset');
      expect(out).toContain('desert-sunset');
      expect(out).toContain('Organic & Warm');
      expect(out).toContain('★');
    });

    it('emits JSON when --json is passed', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: [{ id: '1', slug: 'x', name: 'X' }] }));
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'list', '--json']);

      const out = stdoutText().trim();
      expect(JSON.parse(out)).toEqual([{ id: '1', slug: 'x', name: 'X' }]);
    });
  });

  describe('get (markdown)', () => {
    it('prints body and caches with etag, then serves 304 from cache', async () => {
      let hits = 0;
      let lastIfNoneMatch: string | undefined;
      server = await startServer((req, res) => {
        hits++;
        lastIfNoneMatch = req.headers['if-none-match'] as string | undefined;
        if (hits === 1) {
          res.writeHead(200, { 'Content-Type': 'text/plain', ETag: 'W/"v1"' });
          res.end('# Desert Sunset\n');
          return;
        }
        // second call: expect If-None-Match
        if (lastIfNoneMatch === 'W/"v1"') {
          res.writeHead(304);
          res.end();
        } else {
          res.writeHead(500);
          res.end('expected ETag header');
        }
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'get', 'desert-sunset']);
      expect(stdoutText()).toContain('# Desert Sunset');

      stdoutSpy.mockClear();
      await stylesCommand.parseAsync(['node', 'gw', 'get', 'desert-sunset']);
      expect(lastIfNoneMatch).toBe('W/"v1"');
      expect(stdoutText()).toContain('# Desert Sunset');
    });

    it('serves cached body and warns to stderr on network failure', async () => {
      // Prime cache directly
      const cache = require('../../src/lib/graphics-cache');
      cache.writeCache('styles', 'desert-sunset', 'md', '# cached body\n', 'W/"v1"');

      // Point creds at a closed port
      mockGetCredentials.mockReturnValue(baseCreds('http://127.0.0.1:1'));

      await stylesCommand.parseAsync(['node', 'gw', 'get', 'desert-sunset']);
      expect(stdoutText()).toContain('# cached body');
      expect(stderrText().toLowerCase()).toContain('warning');
    });
  });

  describe('publish', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pub-cmd-'));
      fs.writeFileSync(path.join(dir, 'poster.png'), Buffer.from('PNG'));
      fs.writeFileSync(
        path.join(dir, 'gooseworks-style.json'),
        JSON.stringify({
          name: 'Desert Sunset',
          slug: 'desert-sunset',
          description: 'A long enough description for validation purposes — lorem ipsum.',
          designMd: 'x'.repeat(80),
          examples: [{ format: 'poster', isHero: true, file: './poster.png' }],
        })
      );
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('happy path: prints slug + hub URL on 201', async () => {
      server = await startServer(async (req, res) => {
        await readBody(req);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: { slug: 'desert-sunset', id: 'sty_1' },
          })
        );
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'publish', dir]);

      const out = stdoutText();
      expect(out).toContain('Published style: desert-sunset');
      expect(out).toContain('/styles/desert-sunset');
    });

    it('retries on 409 with --yes and accepts the suggested slug', async () => {
      let firstSlug: string | undefined;
      let secondSlug: string | undefined;
      let calls = 0;
      server = await startServer(async (req, res) => {
        calls++;
        const body = await readBody(req);
        const text = body.toString('utf-8');
        const m = text.match(/"slug":"([^"]+)"/);
        if (calls === 1) {
          firstSlug = m?.[1];
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'error',
              error: 'slug_taken',
              suggested_slug: 'desert-sunset-2',
            })
          );
          return;
        }
        secondSlug = m?.[1];
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: { slug: 'desert-sunset-2', id: 'sty_2' },
          })
        );
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'publish', dir, '--yes']);

      expect(firstSlug).toBe('desert-sunset');
      expect(secondSlug).toBe('desert-sunset-2');
      expect(stdoutText()).toContain('Published style: desert-sunset-2');
    });

    it('exits with 2 on client-side validation failure (bad manifest)', async () => {
      // Overwrite manifest with too-short description
      fs.writeFileSync(
        path.join(dir, 'gooseworks-style.json'),
        JSON.stringify({
          name: 'X',
          description: 'short',
          designMd: 'too short',
          examples: [],
        })
      );
      // Server should never be called; but set up creds anyway.
      server = await startServer((_req, res) => {
        res.writeHead(500);
        res.end('should not be called');
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await expect(
        stylesCommand.parseAsync(['node', 'gw', 'publish', dir])
      ).rejects.toThrow(/process\.exit called: 2/);
      expect(stderrText()).toContain('Manifest validation failed');
    });

    it('exits with 1 when not authenticated', async () => {
      mockGetCredentials.mockReturnValue(null);
      await expect(
        stylesCommand.parseAsync(['node', 'gw', 'publish', dir])
      ).rejects.toThrow(/process\.exit called: 1/);
      expect(stderrText()).toContain('Not authenticated');
    });
  });

  describe('delete', () => {
    it('sends DELETE on --yes and prints success', async () => {
      let saw = 0;
      server = await startServer((req, res) => {
        saw++;
        expect(req.method).toBe('DELETE');
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'success' }));
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await stylesCommand.parseAsync(['node', 'gw', 'delete', 'desert-sunset', '--yes']);
      expect(saw).toBe(1);
      expect(stdoutText()).toContain("Deleted style 'desert-sunset'");
    });
  });
});

// Suppress an unused-warning at typecheck time
void buildSubcommand;
