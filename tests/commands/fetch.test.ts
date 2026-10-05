import * as http from 'http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'net';

jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

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
import { fetchCommand, createFetchCommand } from '../../src/commands/fetch';
import { getGooseVideoSkillContent } from '../../src/skills/master-skill';
import { skillContentHash } from '../../src/skills/releases';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

type Responder = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(respond: Responder): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(respond);
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

describe('fetch command', () => {
  let processExitSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let server: { url: string; close: () => Promise<void> } | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    processExitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('exits when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
  });

  it('prints skill JSON on happy path', async () => {
    server = await startServer((req, res) => {
      expect(req.method).toBe('GET');
      expect(req.url).toBe('/api/skills/catalog/reddit-scraper');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: {
          slug: 'reddit-scraper',
          name: 'Reddit Scraper',
          description: 'Scrape Reddit',
          content: '# Reddit Scraper SKILL.md',
          scripts: { 'scrape.py': 'print("hi")' },
          requiresSkills: [],
          dependencySkills: [],
        },
      }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await fetchCommand.parseAsync(['node', 'test', 'reddit-scraper']);

    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('reddit-scraper');
    expect(logged).toContain('Reddit Scraper');
    expect(logged).toContain('# Reddit Scraper SKILL.md');
  });

  it('url-encodes the slug', async () => {
    let receivedUrl: string | undefined;
    server = await startServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: { slug: 'a/b', name: 'X', content: '' } }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await fetchCommand.parseAsync(['node', 'test', 'a/b']);

    expect(receivedUrl).toBe('/api/skills/catalog/a%2Fb');
  });

  it('reports Unauthorized on 401', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_bad',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
  });

  it('reports Server error on 500', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Server error (500)'));
  });

  it('reports Invalid response on malformed JSON', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('<<<not json>>>');
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Invalid response from server');
  });
  it('reports stale saved dependency metadata and leaves the saved package unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa37-saved-'));
    const target = path.join(dir, 'package.json');
    const saved = JSON.stringify({slug: 'recipe', contentHash: 'root', dependencySkills: [{slug: 'helper', contentHash: 'old'}]});
    fs.writeFileSync(target, saved);
    try {
      server = await startServer((_req, res) => {res.writeHead(200, {'Content-Type': 'application/json'});res.end(JSON.stringify({status: 'success',data: {slug: 'recipe', name: 'Recipe', content: '# current', contentHash: 'root', dependencySkills: [{slug: 'helper',contentHash: 'new'}]}}));});
      mockGetCredentials.mockReturnValue({api_key: 'cal_test',email: 'u@example.com',agent_id: 'agent-1',api_base: server.url});
      await createFetchCommand().parseAsync(['node','test','recipe','--saved-package',target]);
      const result = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
      expect(result.freshness).toMatchObject({status: 'stale',changes: ['helper']});
      expect(result.content).toBe('# current');
      expect(fs.readFileSync(target,'utf8')).toBe(saved);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });

  it('fetches the current video entry for a new run and compares an old approved package without changing it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-first-video-'));
    const target = path.join(dir, 'approved-package.json');
    const old = JSON.stringify({ slug: 'goose-video', version: '0.3.0', content: '# approved old entry', contentHash: skillContentHash('# approved old entry') });
    fs.writeFileSync(target, old);
    const content = getGooseVideoSkillContent();
    const current = { slug: 'goose-video', name: 'Goose Video', version: '3.0.1', content, contentHash: skillContentHash(content) };
    let requests = 0;
    server = await startServer((req, res) => {
      expect(req.url).toBe('/api/skills/catalog/goose-video');
      requests++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: current }));
    });
    mockGetCredentials.mockReturnValue({ api_key: 'cal_test', email: 'u@example.com', agent_id: 'agent-1', api_base: server.url });
    try {
      await createFetchCommand().parseAsync(['node', 'test', 'goose-video']);
      expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]))).toMatchObject({ ...current, freshness: { status: 'not_compared' } });
      await createFetchCommand().parseAsync(['node', 'test', 'goose-video', '--saved-package', target]);
      expect(JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]))).toMatchObject({ ...current, freshness: { status: 'stale', changes: ['goose-video'] } });
      expect(requests).toBe(2);
      expect(fs.readFileSync(target, 'utf8')).toBe(old);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a non-file saved package before requesting the catalog', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa37-directory-'));
    mockGetCredentials.mockReturnValue({api_key:'cal_test',email:'u@example.com',agent_id:'agent-1',api_base:'http://127.0.0.1:1'});
    try {
      await expect(createFetchCommand().parseAsync(['node','test','recipe','--saved-package',dir])).rejects.toThrow('process.exit called');
      expect(loggerModule.error).toHaveBeenCalledWith('Saved package must be a regular JSON file');
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });

  it('delivers compatible current entry instructions through the old production catalog shape without inventing receipts', async () => {
    // This is the observed old API shape: entry bytes come from CLI main, while
    // the catalog metadata has no backend brand-context capability declaration.
    const current = {
      slug: 'goose-video', name: 'GooseWorks Video Ads', version: 'cli-current',
      content: getGooseVideoSkillContent(), scripts: null, files: null, config: {},
      metadata: { source: 'cli-entry-skill', source_url: 'https://raw.githubusercontent.com/gooseworks-ai/gooseworks/main/skills/goose-video/SKILL.md' },
      requiresSkills: [], dependencySkills: [],
    };
    server = await startServer((req, res) => {
      expect(req.url).toBe('/api/skills/catalog/goose-video');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: current }));
    });
    mockGetCredentials.mockReturnValue({ api_key: 'cal_test', email: 'u@example.com', agent_id: 'agent-1', api_base: server.url });
    await createFetchCommand().parseAsync(['node', 'test', 'goose-video']);
    const emitted = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0]));
    expect(emitted.content).toBe(current.content);
    expect(emitted).not.toHaveProperty('brand_context');
    expect(emitted).not.toHaveProperty('brand_context_digest');
    expect(emitted.content).toContain('brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }');
    expect(emitted.content).toContain('An older API returns the actual four brand sections');
    expect(emitted.content).toContain('Do not fabricate a receipt or send nonexistent bundle/digest fields');
    expect(emitted.content).toContain('Binding is required');
    expect(emitted.content).toContain('That refusal never permits the older-API');
    expect(emitted.content).toContain('Guide returns `not_found`');
  });

});
