import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import { formatsCommand } from '../../src/commands/formats';

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

const baseCreds = (apiBase: string) => ({
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-1',
  api_base: apiBase,
});

describe('formats command', () => {
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
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-cache-formats-'));
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

  it('list renders a table including dimensions', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'success',
          data: [
            {
              id: 'f1',
              slug: 'linkedin-banner',
              name: 'LinkedIn Banner',
              width: 1584,
              height: 396,
              featured: true,
              authorHandle: '@shiv',
            },
          ],
        })
      );
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await formatsCommand.parseAsync(['node', 'gw', 'list']);

    const out = stdoutText();
    expect(out).toContain('LinkedIn Banner');
    expect(out).toContain('linkedin-banner');
    expect(out).toContain('1584×396');
    expect(out).toContain('★');
  });

  it('get prints spec.md body to stdout', async () => {
    server = await startServer((req, res) => {
      expect(req.url).toBe('/api/graphics/formats/linkedin-banner/spec.md');
      res.writeHead(200, { 'Content-Type': 'text/plain', ETag: 'W/"v1"' });
      res.end('## Rules\n');
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await formatsCommand.parseAsync(['node', 'gw', 'get', 'linkedin-banner']);
    expect(stdoutText()).toContain('## Rules');
  });

  it('publish happy path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pub-fmt-'));
    try {
      fs.writeFileSync(path.join(dir, 'example-1.png'), Buffer.from('PNG'));
      fs.writeFileSync(
        path.join(dir, 'gooseworks-format.json'),
        JSON.stringify({
          name: 'LinkedIn Banner',
          slug: 'linkedin-banner',
          description: '1584×396 LinkedIn profile background image specification.',
          width: 1584,
          height: 396,
          contentRulesMd:
            '## Rules\n\nMinimum fifty characters of content rules markdown right here folks.',
          examples: [{ file: './example-1.png' }],
        })
      );

      server = await startServer(async (req, res) => {
        await readBody(req);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: { slug: 'linkedin-banner', id: 'fmt_1' },
          })
        );
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await formatsCommand.parseAsync(['node', 'gw', 'publish', dir]);
      expect(stdoutText()).toContain('Published format: linkedin-banner');
      expect(stdoutText()).toContain('/formats/linkedin-banner');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('publish exits 2 on bad manifest (missing contentRulesMd)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-pub-fmt-bad-'));
    try {
      fs.writeFileSync(path.join(dir, 'example-1.png'), Buffer.from('PNG'));
      fs.writeFileSync(
        path.join(dir, 'gooseworks-format.json'),
        JSON.stringify({
          name: 'X',
          description: 'too short',
          width: 100,
          height: 100,
          examples: [{ file: './example-1.png' }],
        })
      );

      server = await startServer((_req, res) => {
        res.writeHead(500);
        res.end();
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await expect(
        formatsCommand.parseAsync(['node', 'gw', 'publish', dir])
      ).rejects.toThrow(/process\.exit called: 2/);
      expect(stderrText()).toContain('Manifest validation failed');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
