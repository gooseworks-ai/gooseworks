// Scene timing for html-frames 1.2.0 beyond an even split: scenes timed by a
// voice track (`speech` + `tail_s`), or held by how many words they show
// (`pace`), plus the timeline extras a style can ask for (`caption_zone`,
// `end_card_scenes`) and the words each scene speaks. Bundled into the part.
import type { Timeline } from '../part-interface';

export type SpeechEntry = Timeline['speech'][number];
export type SpokenWord = { text: string; start_s: number; end_s: number };

export interface PaceSpec {
  base_s: number;
  per_word_s: number;
  min_s?: number;
  max_s?: number;
  last_min_s?: number;
}

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Words as a reader counts them: runs of letters or digits, joined by ' or -. */
export function countWords(text: string | null): number {
  if (!text) return 0;
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** A scene with neither on-screen text nor a line (skip_blank looks for these). */
export function isBlankScene(scene: { line: string | null; on_screen: string | null }): boolean {
  return !scene.on_screen?.trim() && !scene.line?.trim();
}

/**
 * Which speech entries belong to which scene. Entries that name a scene_id go
 * to that scene (entries with none are left out of the timing). When no entry
 * names a scene, entries pair with scenes in order, which needs the same count.
 * Returns the reason in plain words when they cannot be paired.
 */
export function speechByScene(ids: string[], speech: SpeechEntry[]): SpeechEntry[][] | string {
  const byScene = ids.map(() => [] as SpeechEntry[]);
  if (speech.some((entry) => typeof entry.scene_id === 'string')) {
    const index = new Map(ids.map((id, i) => [id, i]));
    for (const entry of speech) {
      if (typeof entry.scene_id !== 'string') continue;
      const i = index.get(entry.scene_id);
      if (i === undefined) return `speech names scene "${entry.scene_id}", which is not one of the scenes`;
      byScene[i].push(entry);
    }
    return byScene;
  }
  if (speech.length !== ids.length) {
    return `speech has ${speech.length} entries without scene ids, so they cannot be paired with ${ids.length} scenes`;
  }
  speech.forEach((entry, i) => byScene[i].push(entry));
  return byScene;
}

/**
 * Scene start times from a voice track. The first scene starts at 0; a scene
 * with speech starts at its first entry. Scenes with no speech share the time
 * between the speech before them and the next scene's start (or the end) evenly.
 * The video lasts until the last entry ends, plus tail_s.
 */
export function speechTimes(ids: string[], speech: SpeechEntry[], tailS: number): { starts: number[]; seconds: number } | string {
  for (const [k, entry] of speech.entries()) {
    if (entry.end_s < entry.start_s) return `speech entry ${k + 1} ends (${entry.end_s} s) before it starts (${entry.start_s} s)`;
  }
  const byScene = speechByScene(ids, speech);
  if (typeof byScene === 'string') return byScene;
  const seconds = Math.max(...speech.map((entry) => entry.end_s)) + tailS;
  const first = byScene.map((entries) => (entries.length ? Math.min(...entries.map((e) => e.start_s)) : null));
  const last = byScene.map((entries) => (entries.length ? Math.max(...entries.map((e) => e.end_s)) : null));
  const starts = ids.map((_, i) => (i === 0 ? 0 : first[i]));
  for (let a = 1; a < ids.length; a++) {
    if (starts[a] !== null) continue;
    let b = a;
    while (b + 1 < ids.length && starts[b + 1] === null) b++;
    const to = b + 1 < ids.length ? (starts[b + 1] as number) : seconds;
    const spoken = last.slice(0, a).filter((v): v is number => v !== null);
    const from = Math.min(to, Math.max(starts[a - 1] as number, ...spoken));
    const count = b - a + 1;
    for (let k = 0; k < count; k++) starts[a + k] = from + ((to - from) * k) / count;
    a = b;
  }
  return { starts: starts as number[], seconds };
}

/** How long each scene holds under `pace`: base_s plus per_word_s a word, kept between min_s and max_s; the last at least last_min_s. */
export function paceHolds(scenes: Array<{ line: string | null; on_screen: string | null }>, pace: PaceSpec): number[] | string {
  const min = pace.min_s ?? 0;
  const max = pace.max_s ?? Infinity;
  if (min > max) return `pace.min_s (${min}) is more than pace.max_s (${max})`;
  const holds = scenes.map((scene) => {
    const words = countWords(scene.on_screen) || countWords(scene.line);
    return Math.min(max, Math.max(min, pace.base_s + pace.per_word_s * words));
  });
  holds[holds.length - 1] = Math.max(holds[holds.length - 1], pace.last_min_s ?? 0);
  return holds;
}

/** Start times from holds, plus the whole length. */
export function startsOfHolds(holds: number[]): { starts: number[]; seconds: number } {
  const starts: number[] = [];
  let at = 0;
  for (const hold of holds) {
    starts.push(at);
    at += hold;
  }
  return { starts, seconds: at };
}

/**
 * Scene start frames from start times, with the end appended. Returns the
 * index of the first scene that would get no frame, or the frames.
 */
export function framesOfStarts(starts: number[], fps: number, frameCount: number): number[] | { empty: number } {
  const frames = starts.map((s, i) => (i === 0 ? 0 : Math.min(frameCount, Math.max(0, Math.round(s * fps)))));
  frames.push(frameCount);
  for (let i = 0; i + 1 < frames.length; i++) if (frames[i + 1] <= frames[i]) return { empty: i };
  return frames;
}

/** Each scene's spoken words, by when each word starts (on the video's frames); words after the end go to the last scene. */
export function wordsByScene(speech: SpeechEntry[], sceneFrames: number[], fps: number): SpokenWord[][] {
  const scenes = sceneFrames.length - 1;
  const out: SpokenWord[][] = Array.from({ length: scenes }, () => []);
  const words = speech.flatMap((entry) => entry.words ?? []).slice().sort((a, b) => a.start_s - b.start_s);
  for (const word of words) {
    const frame = Math.round(word.start_s * fps);
    let i = scenes - 1;
    while (i > 0 && frame < sceneFrames[i]) i--;
    out[i].push({ text: word.text, start_s: word.start_s, end_s: word.end_s });
  }
  return out;
}

/** The caption zone kept to the page; null when none of it is on the page. */
export function clipZone(zone: Zone, page: { width: number; height: number }): Zone | null {
  const x0 = Math.max(0, zone.x);
  const y0 = Math.max(0, zone.y);
  const x1 = Math.min(page.width, zone.x + zone.w);
  const y1 = Math.min(page.height, zone.y + zone.h);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A zone in the page's CSS pixels as video pixels, rounded inward so captions stay inside it. */
export function zoneOnVideo(zone: Zone, scale: number, size: { width: number; height: number }): Zone | null {
  const x0 = Math.max(0, Math.ceil(zone.x * scale - 1e-6));
  const y0 = Math.max(0, Math.ceil(zone.y * scale - 1e-6));
  const x1 = Math.min(size.width, Math.floor((zone.x + zone.w) * scale + 1e-6));
  const y1 = Math.min(size.height, Math.floor((zone.y + zone.h) * scale + 1e-6));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
