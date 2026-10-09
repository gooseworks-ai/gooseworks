jest.mock('../../src/auth/credentials', () => ({ getCredentials: jest.fn() }));
jest.mock('../../src/lib/mcp-client', () => {
  const actual = jest.requireActual('../../src/lib/mcp-client');
  return { ...actual, connectMcp: jest.fn() };
});
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), success: jest.fn() }));

import { getCredentials } from '../../src/auth/credentials';
import { connectMcp, McpError } from '../../src/lib/mcp-client';
import * as logger from '../../src/utils/logger';
import { createToolCommand, formatToolResult, normalizeToolName, readToolArgs } from '../../src/commands/tool';

const mockConnect = connectMcp as jest.MockedFunction<typeof connectMcp>;
const creds = { api_key: 'cal_x', email: 'u@x.test', agent_id: 'a', api_base: 'https://api.gooseworks.ai', mcp_server_url: 'https://mcp.gooseworks.ai' };

function fakeMcp(overrides: Partial<Record<'callTool' | 'listTools', jest.Mock>> = {}) {
  return {
    instructions: 'Paid work needs the user\'s yes.',
    listTools: overrides.listTools ?? jest.fn().mockResolvedValue([
      { name: 'brand_read', description: 'Read brands without changing them. Lots more.', inputSchema: { type: 'object', properties: { brand_id: { type: 'string' } } } },
      { name: 'account_whoami', description: 'Who the caller is.', inputSchema: { type: 'object' } },
    ]),
    callTool: overrides.callTool ?? jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"ok":true}' }] }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

const run = (...args: string[]) => createToolCommand().parseAsync(['node', 'test', ...args]);

describe('tool command', () => {
  let out: string[];
  let logSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    out = [];
    logSpy = jest.spyOn(console, 'log').mockImplementation((line?: unknown) => { out.push(String(line)); });
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
    (getCredentials as jest.Mock).mockReturnValue(creds);
  });
  afterEach(() => { logSpy.mockRestore(); exitSpy.mockRestore(); });

  it('calls the named tool with the JSON arguments and closes the session', async () => {
    const mcp = fakeMcp();
    mockConnect.mockResolvedValue(mcp as never);
    await run('mcp__gooseworks__brand_read', '{"brand_id":"b1"}');
    expect(mcp.callTool).toHaveBeenCalledWith('brand_read', { brand_id: 'b1' });
    expect(out.join('\n')).toBe(JSON.stringify({ ok: true }, null, 2));
    expect(mcp.close).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('prints a tool error and exits 1, still closing the session', async () => {
    const mcp = fakeMcp({ callTool: jest.fn().mockResolvedValue({ isError: true, content: [{ type: 'text', text: '{"error":{"code":"brand_not_found"}}' }] }) });
    mockConnect.mockResolvedValue(mcp as never);
    await expect(run('brand_read', '{"brand_id":"nope"}')).rejects.toThrow('process.exit called');
    expect(out.join('\n')).toContain('brand_not_found');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mcp.close).toHaveBeenCalled();
  });

  it('lists the tools after the server\'s rules', async () => {
    mockConnect.mockResolvedValue(fakeMcp() as never);
    await run('--list');
    const text = out.join('\n');
    expect(text.indexOf('Paid work needs the user\'s yes.')).toBeLessThan(text.indexOf('2 tools.'));
    expect(text).toContain('account_whoami — Who the caller is.');
    expect(text).toContain('brand_read — Read brands without changing them.');
    expect(text).not.toContain('Lots more');
  });

  it('shows a tool\'s schema, and names close matches for an unknown tool', async () => {
    mockConnect.mockResolvedValue(fakeMcp() as never);
    await run('brand_read', '--schema');
    expect(out.join('\n')).toContain('"brand_id"');

    const unknown = fakeMcp({ callTool: jest.fn().mockRejectedValue(new McpError('GooseWorks refused the request: Tool brand_reed not found')) });
    mockConnect.mockResolvedValue(unknown as never);
    await expect(run('brand_reed')).rejects.toThrow('process.exit called');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Did you mean: brand_read'));
  });

  it('tells a signed-out user how to sign in, including from a cloud sandbox', async () => {
    (getCredentials as jest.Mock).mockReturnValue(null);
    await expect(run('account_whoami')).rejects.toThrow('process.exit called');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('login --device --no-wait'));
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe('tool helpers', () => {
  it('normalizes prefixed tool names', () => {
    expect(normalizeToolName('mcp__gooseworks__account_whoami')).toBe('account_whoami');
    expect(normalizeToolName('mcp__gooseworks-staging__brand_read')).toBe('brand_read');
    expect(normalizeToolName(' brand_read ')).toBe('brand_read');
  });

  it('reads arguments inline, from stdin or a file, and only as a JSON object', () => {
    expect(readToolArgs(undefined, undefined)).toEqual({});
    expect(readToolArgs('{"a":1}', undefined)).toEqual({ a: 1 });
    expect(readToolArgs('-', undefined, () => '{"b":2}')).toEqual({ b: 2 });
    expect(() => readToolArgs('[1]', undefined)).toThrow(/JSON object/);
    expect(() => readToolArgs('{oops', undefined)).toThrow(/JSON object/);
    expect(() => readToolArgs('{}', '/tmp/x.json')).toThrow(/not both/);
  });

  it('shows the structured data when the text is only a sentence, and not twice when the text is JSON', () => {
    const sentence = formatToolResult({
      content: [{ type: 'text', text: 'Onboarding is ready to start.' }],
      structuredContent: { result: { next_step: 'start' } },
    });
    expect(sentence).toContain('Onboarding is ready to start.');
    expect(sentence).toContain('"next_step": "start"');

    const json = formatToolResult({
      content: [{ type: 'text', text: '{"user":{"email":"u@x.test"}}' }],
      structuredContent: { result: { user: { email: 'u@x.test' } } },
    });
    expect(json.match(/"email"/g)).toHaveLength(1);

    expect(formatToolResult({ content: [{ type: 'image', mimeType: 'image/png' }] })).toBe('[image image/png]');
  });
});
