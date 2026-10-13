import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordRefusal } from '../../src/kit/core/refusal-log';

const VIDEO = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
let home: string;

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-refusal-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('recordRefusal', () => {
  it('leaves one line in the video log before the run has its own log', () => {
    recordRefusal(home, VIDEO, 'hand-over refused', { code: 'wrong_account', status: 403, next: 'sign_in' });
    const lines = fs.readFileSync(path.join(home, 'videos', VIDEO, 'log.ndjson'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: 'warn', message: 'hand-over refused', fields: { code: 'wrong_account', status: 403, next: 'sign_in' } });
  });

  it('never throws for an id that has no video folder', () => {
    expect(() => recordRefusal(home, '../nope', 'access refused', { code: 'not_found', status: 404, next: 'stop' })).not.toThrow();
    expect(fs.existsSync(path.join(home, 'videos'))).toBe(false);
  });
});
