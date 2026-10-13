// Progress for the card (private-line.md (c)): a fixed set of rows in a fixed
// order, with live counts. The labels and order copy the server's row table
// (gooseworks-app video-line/progress-rows.ts), which plans the same rows from
// the frozen style and matches these reports to them by label, so a label
// changes here only together with that table.
import type { PartKind, PartManifest } from '../part-interface';
import type { ProgressRequest, ProgressStep } from '../line/types';

export const ROW_LABELS = {
  voice: 'Creating the voice',
  pictures: 'Creating the pictures',
  clips: 'Creating the video clips',
  lips: 'Syncing lips',
  music: 'Creating the music',
  screens: 'Creating the screens',
  join: 'Joining the clips',
  captions: 'Adding captions',
  sound: 'Mixing the sound',
  end_card: 'Creating the end card',
  check: 'Checking it once before delivering',
} as const;

/** The voice row's label when the video also syncs faces to that voice. */
export const AVATAR_VOICE_LABEL = 'Creating the avatar and voice';

export type RowKey = keyof typeof ROW_LABELS;

const ROW_ORDER = Object.keys(ROW_LABELS) as RowKey[];

const KIND_ROWS: Record<PartKind, RowKey> = {
  generate_voice: 'voice',
  generate_image: 'pictures',
  generate_video: 'clips',
  generate_music: 'music',
  generate_sfx: 'music',
  render_html: 'screens',
  compose: 'join',
  caption: 'captions',
  mix: 'sound',
  end_card: 'end_card',
  check: 'check',
};

/** Rows whose count is of paid pieces the person will see (lines, pictures, clips); the rest count frames or beats. */
const PIECE_ROWS = new Set<RowKey>(['voice', 'pictures', 'clips', 'lips', 'music']);

/**
 * A step's row, from its part's manifest. The server's table picks lip-sync by part id; the core
 * names no part, so here lip-sync is a video part fed recorded sound (today the same one part).
 */
export function rowOf(manifest: Pick<PartManifest, 'kind' | 'inputs'>): RowKey | null {
  if (manifest.kind === 'generate_video' && takesMedia(manifest.inputs, 'audio')) return 'lips';
  return KIND_ROWS[manifest.kind] ?? null;
}

function takesMedia(schema: unknown, media: string, depth = 0): boolean {
  if (depth > 64 || !schema || typeof schema !== 'object') return false;
  const file = (schema as Record<string, unknown>)['x-kit-file'] as { media?: unknown } | undefined;
  if (file && file.media === media) return true;
  return Object.values(schema).some((value) => takesMedia(value, media, depth + 1));
}

interface Tracked {
  id: string;
  row: RowKey | null;
  typical_s: number;
  state: 'todo' | 'now' | 'done' | 'failed';
  done: number;
  total: number;
  fraction?: number;
}

/** What has been made so far, as the card shows it. */
export class ProgressBook {
  private readonly steps = new Map<string, Tracked>();
  note = 'Getting the style ready';

  /** `onChange` hears every start, count and finish. */
  constructor(private readonly onChange: () => void = () => undefined) {}

  plan(steps: Array<{ id: string; row: RowKey | null; typical_s: number }>): void {
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
      this.onChange();
    }
  }

  count(id: string, update: { done?: number; total?: number; fraction?: number }): void {
    const step = this.steps.get(id);
    if (!step) return;
    if (typeof update.total === 'number' && update.total >= 1) step.total = Math.min(Math.floor(update.total), 200);
    if (typeof update.done === 'number' && update.done >= 0) step.done = Math.min(Math.floor(update.done), step.total);
    if (typeof update.fraction === 'number' && update.fraction >= 0 && update.fraction <= 1) step.fraction = update.fraction;
    this.onChange();
  }

  finish(id: string, state: 'done' | 'failed' = 'done'): void {
    const step = this.steps.get(id);
    if (!step) return;
    step.state = state;
    if (state === 'done') step.done = step.total;
    this.onChange();
  }

  request(): ProgressRequest {
    const all = [...this.steps.values()];
    const total = all.reduce((n, s) => n + s.total, 0);
    const done = all.reduce((n, s) => n + madeOf(s), 0);
    const eta = all.reduce((n, s) => {
      if (s.state === 'done') return n;
      const left = s.fraction !== undefined ? 1 - s.fraction : s.total ? 1 - s.done / s.total : 1;
      return n + s.typical_s * (s.state === 'now' ? left : 1);
    }, 0);
    const lips = all.some((s) => s.row === 'lips');
    const rows: ProgressStep[] = [];
    for (const row of ROW_ORDER) {
      const members = all.filter((s) => s.row === row);
      if (!members.length) continue;
      const rowTotal = members.reduce((n, s) => n + s.total, 0);
      const rowDone = members.reduce((n, s) => n + madeOf(s), 0);
      const state: ProgressStep['state'] = members.some((s) => s.state === 'failed')
        ? 'failed'
        : members.every((s) => s.state === 'done')
          ? 'done'
          : members.some((s) => s.state === 'now' || s.state === 'done')
            ? 'now'
            : 'todo';
      rows.push({
        label: row === 'voice' && lips ? AVATAR_VOICE_LABEL : ROW_LABELS[row],
        state,
        ...(PIECE_ROWS.has(row) && rowTotal > 1 ? { detail: `${Math.min(rowDone, rowTotal)} of ${rowTotal}` } : {}),
      });
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

const MARK: Record<ProgressStep['state'], string> = { now: '▸', done: '✓', failed: '✗', todo: '' };

/**
 * The rows as lines for the person running the kit: a row's start, end or failure always, and a
 * new count on a row at most once every `everyMs`. The card's own labels, never a part or a code.
 */
export class StepLines {
  private readonly shown = new Map<string, { state: ProgressStep['state']; detail?: string; at: number }>();

  constructor(private readonly everyMs = 5_000) {}

  next(steps: ProgressStep[] | undefined, now: number): string[] {
    return this.changed(steps, now).map(lineOf);
  }

  /** The rows to show now, by the same rule as `next`. */
  changed(steps: ProgressStep[] | undefined, now: number): ProgressStep[] {
    const rows: ProgressStep[] = [];
    for (const step of steps ?? []) {
      if (step.state === 'todo') continue;
      const last = this.shown.get(step.label);
      if (last && last.state === step.state && (last.detail === step.detail || now - last.at < this.everyMs)) continue;
      this.shown.set(step.label, { state: step.state, detail: step.detail, at: now });
      rows.push(step);
    }
    return rows;
  }
}

/** One row as the line the person reads. */
export function lineOf(step: ProgressStep): string {
  return `${MARK[step.state]} ${step.label}${step.state === 'now' && step.detail ? ` (${step.detail})` : ''}`;
}

function madeOf(step: Tracked): number {
  return step.state === 'done' ? step.total : Math.min(step.done, step.total);
}
