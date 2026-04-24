import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import { detectAgents, isAgentInstalled } from '../../src/agents/detect';

describe('agents/detect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
  });

  it('returns empty array when no agent dirs exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(detectAgents()).toEqual([]);
  });

  it('detects only Claude when only ~/.claude exists', () => {
    mockFs.existsSync.mockImplementation((p) => p === '/mock-home/.claude');

    const agents = detectAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].type).toBe('claude');
    expect(agents[0].configDir).toBe('/mock-home/.claude');
  });

  it('detects Cursor via ~/.cursor', () => {
    mockFs.existsSync.mockImplementation((p) => p === '/mock-home/.cursor');

    const agents = detectAgents();
    expect(agents.find((a) => a.type === 'cursor')).toBeDefined();
  });

  it('detects Cursor via macOS Application Support path', () => {
    mockFs.existsSync.mockImplementation(
      (p) => p === '/mock-home/Library/Application Support/Cursor'
    );

    const agents = detectAgents();
    const cursor = agents.find((a) => a.type === 'cursor');
    expect(cursor).toBeDefined();
    expect(cursor?.configDir).toBe('/mock-home/Library/Application Support/Cursor');
  });

  it('detects all three agents when all dirs exist', () => {
    mockFs.existsSync.mockImplementation((p) =>
      p === '/mock-home/.claude' ||
      p === '/mock-home/.cursor' ||
      p === '/mock-home/.codex'
    );

    const agents = detectAgents();
    expect(agents.map((a) => a.type).sort()).toEqual(['claude', 'codex', 'cursor']);
  });

  it('isAgentInstalled returns true/false based on detection', () => {
    mockFs.existsSync.mockImplementation((p) => p === '/mock-home/.codex');

    expect(isAgentInstalled('codex')).toBe(true);
    expect(isAgentInstalled('claude')).toBe(false);
    expect(isAgentInstalled('cursor')).toBe(false);
  });
});
