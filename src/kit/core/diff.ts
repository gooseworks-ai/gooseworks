// A unified diff (as `diff -u` writes it) of one edited part file, for the record an edited
// step uploads. Myers' O(ND) line diff; past MAX_EDITS the changed middle is shown whole.

const CONTEXT = 3;
/** Edits past this show the changed middle as one block instead of a line-by-line diff. */
const MAX_EDITS = 2000;

type Op = { kind: ' ' | '-' | '+'; line: string };

/** Text when the bytes are UTF-8 with no NUL, else null (a binary file). */
export function textOf(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null;
  const text = bytes.toString('utf8');
  return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
}

function linesOf(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The shortest edit script, or null when it needs more than `maxEdits` edits. */
function myers(a: string[], b: string[], maxEdits: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // v as each round started, kept only over the diagonals that round can read.
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, maxEdits) && found < 0; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const at = (k: number) => trace[d][k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) ops.push({ kind: ' ', line: a[--x] }), y--;
    if (d === 0) break;
    if (x === prevX) ops.push({ kind: '+', line: b[--y] });
    else ops.push({ kind: '-', line: a[--x] });
  }
  return ops.reverse();
}

/** Every line of `a` out and every line of `b` in, around their shared start and end. */
function wholeMiddle(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return [
    ...a.slice(0, start).map((line): Op => ({ kind: ' ', line })),
    ...a.slice(start, a.length - end).map((line): Op => ({ kind: '-', line })),
    ...b.slice(start, b.length - end).map((line): Op => ({ kind: '+', line })),
    ...a.slice(a.length - end).map((line): Op => ({ kind: ' ', line })),
  ];
}

function hunks(ops: Op[]): string[] {
  // Line numbers (1-based) in a and b where each op sits.
  const aAt: number[] = [];
  const bAt: number[] = [];
  let ai = 1;
  let bi = 1;
  for (const op of ops) {
    aAt.push(ai);
    bAt.push(bi);
    if (op.kind !== '+') ai++;
    if (op.kind !== '-') bi++;
  }
  const changed = ops.flatMap((op, i) => (op.kind === ' ' ? [] : [i]));
  const out: string[] = [];
  for (let c = 0; c < changed.length; c++) {
    const first = changed[c];
    // Changes with at most two contexts of unchanged lines between them share a hunk, as diff -u does.
    while (c + 1 < changed.length && changed[c + 1] - changed[c] - 1 <= 2 * CONTEXT) c++;
    const start = Math.max(0, first - CONTEXT);
    const end = Math.min(ops.length, changed[c] + CONTEXT + 1);
    const slice = ops.slice(start, end);
    const aCount = slice.filter((op) => op.kind !== '+').length;
    const bCount = slice.filter((op) => op.kind !== '-').length;
    // An empty side is numbered by the line before it, as diff -u does.
    out.push(`@@ -${aCount ? aAt[start] : aAt[start] - 1},${aCount} +${bCount ? bAt[start] : bAt[start] - 1},${bCount} @@`);
    for (const op of slice) out.push(`${op.kind}${op.line}`);
  }
  return out;
}

/** `--- a/<path>`, `+++ b/<path>` and the hunks between two versions of one file. */
export function unifiedDiff(file: string, before: Buffer, after: Buffer): string {
  const a = textOf(before);
  const b = textOf(after);
  if (a === null || b === null) return `Binary file ${file} changed\n`;
  const aLines = linesOf(a);
  const bLines = linesOf(b);
  const ops = myers(aLines, bLines, MAX_EDITS) ?? wholeMiddle(aLines, bLines);
  return [`--- a/${file}`, `+++ b/${file}`, ...hunks(ops)].join('\n') + '\n';
}
