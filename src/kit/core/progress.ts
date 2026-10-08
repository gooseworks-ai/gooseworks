// Progress for the card (private-line.md (c)): one row per kind group, in a
// fixed order, with live counts. The rows come from the part's kind, so the
// style needs no labels; the words are the card's, not any part's.
import type { PartKind } from '../part-interface';
import type { ProgressRequest, ProgressStep } from '../line/types';

/** The card's rows, in order. A row shows only when the video has a step of that kind. */
const ROWS: Array<{ label: string; kinds: PartKind[] }> = [
  { label: 'Voice', kinds: ['generate_voice'] },
  { label: 'Pictures', kinds: ['generate_image'] },
  { label: 'Clips', kinds: ['generate_video'] },
  { label: 'Music', kinds: ['generate_music', 'generate_sfx'] },
  { label: 'Putting it together', kinds: ['render_html', 'compose', 'caption', 'mix', 'end_card'] },
  { label: 'Final check', kinds: ['check'] },
];

export function rowOf(kind: PartKind): string {
  return ROWS.find((row) => row.kinds.includes(kind))?.label ?? 'Putting it together';
}

interface Tracked {
  id: string;
  kind: PartKind;
  typical_s: number;
  state: 'todo' | 'now' | 'done' | 'failed';
  done: number;
  total: number;
  fraction?: number;
}

/** What has been made so far, as the card shows it. */
export class ProgressBook {
  private readonly steps = new Map<string, Tracked>();
  note = 'Getting your video ready';

  plan(steps: Array<{ id: string; kind: PartKind; typical_s: number }>): void {
    for (const step of steps) {
      if (!this.steps.has(step.id)) this.steps.set(step.id, { ...step, state: 'todo', done: 0, total: 1 });
    }
  }

  start(id: string): void {
    const step = this.steps.get(id);
    if (step) {
      step.state = 'now';
      step.done = 0;
      step.fraction = undefined;
    }
  }

  count(id: string, update: { done?: number; total?: number; fraction?: number }): void {
    const step = this.steps.get(id);
    if (!step) return;
    if (typeof update.total === 'number' && update.total >= 1) step.total = Math.min(Math.floor(update.total), 200);
    if (typeof update.done === 'number' && update.done >= 0) step.done = Math.min(Math.floor(update.done), step.total);
    if (typeof update.fraction === 'number' && update.fraction >= 0 && update.fraction <= 1) step.fraction = update.fraction;
  }

  finish(id: string, state: 'done' | 'failed' = 'done'): void {
    const step = this.steps.get(id);
    if (!step) return;
    step.state = state;
    if (state === 'done') step.done = step.total;
  }

  request(): ProgressRequest {
    const all = [...this.steps.values()];
    const total = all.reduce((n, s) => n + s.total, 0);
    const done = all.reduce((n, s) => n + (s.state === 'done' ? s.total : Math.min(s.done, s.total)), 0);
    const eta = all.reduce((n, s) => {
      if (s.state === 'done') return n;
      const left = s.fraction !== undefined ? 1 - s.fraction : s.total ? 1 - s.done / s.total : 1;
      return n + s.typical_s * (s.state === 'now' ? left : 1);
    }, 0);
    const rows: ProgressStep[] = [];
    for (const row of ROWS) {
      const members = all.filter((s) => row.kinds.includes(s.kind));
      if (!members.length) continue;
      const rowTotal = members.reduce((n, s) => n + s.total, 0);
      const rowDone = members.reduce((n, s) => n + (s.state === 'done' ? s.total : Math.min(s.done, s.total)), 0);
      const state: ProgressStep['state'] = members.some((s) => s.state === 'failed')
        ? 'failed'
        : members.every((s) => s.state === 'done')
          ? 'done'
          : members.some((s) => s.state === 'now' || s.state === 'done')
            ? 'now'
            : 'todo';
      rows.push({ label: row.label, state, ...(rowTotal > 1 ? { detail: `${Math.min(rowDone, rowTotal)} of ${rowTotal}` } : {}) });
    }
    return {
      pieces_done: Math.min(done, 500),
      pieces_total: Math.min(Math.max(total, done), 500),
      eta_seconds: Math.min(Math.round(eta), 86_400),
      note: this.note,
      ...(rows.length ? { steps: rows.slice(0, 12) } : {}),
    };
  }
}
