// Source-linked edit intent. File/rebuild checks never certify audiovisual quality.
import { canonicalHash } from './canonical';
import { FINAL_MEASURE_THRESHOLDS, maxFreezeMs } from './final-measure';

export const ASSEMBLY_FORMAT = 'gooseworks-assembly-timeline/1' as const;
export const SPEECH_MODES = ['native_dialogue', 'audio_driven_lipsync', 'narration', 'singing', 'mixed', 'none'] as const;
export const SOUNDTRACK_MODES = ['source_ambience', 'music', 'sfx', 'intentional_silence'] as const;
export type SpeechMode = typeof SPEECH_MODES[number];
export type SoundtrackMode = typeof SOUNDTRACK_MODES[number];
export interface AssemblySource {
  asset_id: string;
  sha256: string;
  /** Local transport only; excluded from the portable revision and stripped before upload. */
  path?: string;
  in_ms: number;
  out_ms: number;
  speed: number;
  /** Picture sources only: the part of the source shown, in whole source pixels. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Picture sources only: how the shown part is scaled. Uneven stretch over 2% is refused; zoom is checked against the real source. */
  scale_x?: number;
  scale_y?: number;
}
/** Picture stretch and zoom limits (fix-forward contract section 7, as amended 15 Oct). */
export const MAX_UNEVEN_STRETCH = 0.02;
/**
 * The most a crop may zoom in: the crop's fit-scale over the full source frame's fit-scale.
 * Plain resolution scaling of the whole frame (H3's 432×768 to 1080×1920) is not zoom.
 */
export const MAX_ZOOM = 1.5;
/** Planned pause and freeze limits, the same numbers the final measurements use. */
export const MAX_PLANNED_PAUSE_MS = FINAL_MEASURE_THRESHOLDS.max_pause_ms;
export const MAX_PLANNED_TOTAL_SHARE = FINAL_MEASURE_THRESHOLDS.max_pause_share;

/** How far a crop zooms in when its picture fills a `frame` (cover fit); 1 for the whole source. */
export function cropZoom(crop: { w: number; h: number }, source: { width: number; height: number }, frame: { width: number; height: number }): number {
  const fit = (w: number, h: number) => Math.max(frame.width / w, frame.height / h);
  return fit(crop.w, crop.h) / fit(source.width, source.height);
}
/** A segment that deliberately shows an earlier shot again says so with an intent starting with this. */
export const CALLBACK_INTENT = 'callback:';
export interface AssemblySegment {
  id: string;
  scene_id: string;
  start_ms: number;
  end_ms: number;
  video: AssemblySource;
  speech_mode: SpeechMode;
  depicts_speech: boolean;
  native_audio: 'preserve' | 'muted';
  speech_driver?: AssemblySource & { task: 'exact_audio' };
  intent?: string;
}
export interface AssemblyCue {
  id: string;
  role: Exclude<SpeechMode, 'mixed' | 'none'> | 'source_ambience' | 'music' | 'sfx';
  source: AssemblySource;
  start_ms: number;
  end_ms: number;
  gain_db: number;
  loop: boolean;
  intent?: string;
}
export interface AssemblyTimeline {
  format: typeof ASSEMBLY_FORMAT;
  creative_contract_revision: string;
  duration_ms: number;
  speech_mode: SpeechMode;
  soundtrack_modes: SoundtrackMode[];
  segments: AssemblySegment[];
  audio_cues: AssemblyCue[];
  pauses: Array<{ start_ms: number; end_ms: number; scope: 'speech' | 'all_audio'; reason: string }>;
  required_cue_ids: string[];
  visual_overrides?: Array<{ start_ms: number; end_ms: number; kind: 'freeze' | 'transition'; reason: string; source?: AssemblySource; scene_id?: string; source_kind?: 'image' | 'video'; segment_ids?: string[] }>;
}
export interface AssemblyPictureSource {
  id: string;
  scene_id: string;
  source: AssemblySource;
  source_kind: 'image' | 'video';
}

/** Overrides can introduce picture bytes that never appear in ordinary clips. */
export function assemblyPictureSources(timeline: AssemblyTimeline): AssemblyPictureSource[] {
  return [
    ...timeline.segments.map(segment => ({ id: segment.id, scene_id: segment.scene_id, source: segment.video, source_kind: 'video' as const })),
    ...(timeline.visual_overrides ?? []).flatMap((override, index) => override.source ? [{ id: `override-${index + 1}`, scene_id: override.scene_id!, source: override.source, source_kind: override.source_kind! }] : []),
  ];
}
export interface AssemblyCheck {
  status: 'complete' | 'incomplete' | 'invalid';
  timeline: AssemblyTimeline | null;
  revision: string | null;
  issues: string[];
  /** Legacy intent is retained for review, never inferred from transcript absence. */
  legacy?: Record<string, unknown>;
}
/** How the reviewer perceived the sound: heard it (a person or an audio-capable model), or relied on the measurements. */
export type AudioPerception = 'listened' | 'measured';
/** How the reviewer perceived the moving picture: watched it, or relied on the measurements. */
export type MotionPerception = 'watched' | 'measured';
export const AUDIO_PERCEPTIONS: readonly AudioPerception[] = ['listened', 'measured'];
export const MOTION_PERCEPTIONS: readonly MotionPerception[] = ['watched', 'measured'];
/**
 * `capabilities` (fix-forward contract section 2). The old boolean shape still parses for one release:
 * `true` reads as listened/watched; `false` is refused.
 */
export type ReviewCapabilities =
  | { audio: AudioPerception; motion: MotionPerception }
  | { audio_perception: boolean; motion_perception: boolean };
export interface FinalContentReview {
  output_sha256: string;
  timeline_revision: string;
  creative_contract_revision: string;
  reviewer: string;
  verdict: 'approved' | 'needs_revision' | 'incomplete';
  capabilities: ReviewCapabilities;
  coverage: Array<{ start_ms: number; end_ms: number }>;
  /** Matched case-insensitively: only P2 lets the upload go on; P0, P1, blocker and anything unknown block. */
  unresolved_issues: Array<{ severity: string; message: string }>;
  dimensions: Record<string, { status: 'pass' | 'needs_revision' | 'incomplete' | 'not_applicable'; note: string }>;
}
/** What a measured review leans on: the kit's own final measurements of the same bytes. */
export interface FinalMeasureSummary {
  output_sha256: string;
  checks: Array<{ id: string; result: 'pass' | 'fail' | 'not_applicable' }>;
}
export const CONTENT_DIMENSIONS = ['reference_and_concept', 'brand_and_product', 'scale_and_geometry', 'action_and_continuity', 'lip_sync', 'voice_performance', 'pronunciation', 'sound_and_silence', 'pacing_and_joins', 'camera_and_lighting', 'overlays'] as const;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const ms = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sourceSpan = (s: AssemblySource) => (s.out_ms - s.in_ms) / s.speed;
const speechRole = (role: string) => ['native_dialogue', 'audio_driven_lipsync', 'narration', 'singing'].includes(role);

/** The timeline without machine-specific `path` values: what the revision hashes and what goes to the server. */
export function portableTimeline<T>(value: T): T {
  const portable = (v: unknown): unknown => Array.isArray(v) ? v.map(portable)
    : object(v) ? Object.fromEntries(Object.entries(v).filter(([key]) => key !== 'path').map(([key, item]) => [key, portable(item)])) : v;
  return portable(value) as T;
}

/** Excludes machine-specific transport, while retaining exact assets and source clocks. */
export function assemblyTimelineRevision(value: AssemblyTimeline): string {
  return canonicalHash(portableTimeline(value));
}

/**
 * Milliseconds and pixels are whole numbers, so the revision survives a database round trip
 * (a stored fraction can come back rounded and no longer match its review).
 */
function fractionalUnits(raw: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown, at: string, inCrop: boolean) => {
    if (Array.isArray(value)) { value.forEach((item, i) => walk(item, `${at}[${i}]`, false)); return; }
    if (!object(value)) return;
    for (const [key, item] of Object.entries(value)) {
      const here = at ? `${at}.${key}` : key;
      const unit = key.endsWith('_ms') ? 'milliseconds' : inCrop && ['x', 'y', 'w', 'h'].includes(key) ? 'pixels' : null;
      if (unit && typeof item === 'number' && Number.isFinite(item) && !Number.isInteger(item)) found.push(`${here} must be a whole number of ${unit} (got ${item})`);
      else walk(item, here, key === 'crop');
    }
  };
  walk(raw, '', false);
  return found;
}

const overlaps = (a: AssemblySource, b: AssemblySource) => a.sha256 === b.sha256 && a.asset_id === b.asset_id && Math.min(a.out_ms, b.out_ms) > Math.max(a.in_ms, b.in_ms);
const totalMs = (items: Array<{ start_ms: number; end_ms: number }>) => {
  let total = 0;
  let end = -1;
  for (const item of [...items].sort((a, b) => a.start_ms - b.start_ms)) {
    total += Math.max(0, item.end_ms - Math.max(item.start_ms, end));
    end = Math.max(end, item.end_ms);
  }
  return total;
};

function gaps(items: Array<{ start_ms: number; end_ms: number }>, duration: number): Array<{ start_ms: number; end_ms: number }> {
  const missing: Array<{ start_ms: number; end_ms: number }> = [];
  let end = 0;
  for (const item of [...items].sort((a, b) => a.start_ms - b.start_ms)) {
    if (item.start_ms > end + 1) missing.push({ start_ms: end, end_ms: item.start_ms });
    end = Math.max(end, item.end_ms);
  }
  if (end < duration - 1) missing.push({ start_ms: end, end_ms: duration });
  return missing;
}

/** Structural and clock checks. A complete result still requires source-byte and content review. */
export function normalizeAssemblyTimeline(raw: unknown, legacy?: Record<string, unknown>): AssemblyCheck {
  if (!object(raw)) return { status: 'incomplete', timeline: null, revision: null,
    issues: ['Source-linked assembly timeline is missing. Legacy sound must be reviewed before migration.'], ...(legacy ? { legacy } : {}) };
  const issues: string[] = [];
  if (raw.format !== ASSEMBLY_FORMAT) issues.push(`assembly format must be ${ASSEMBLY_FORMAT}`);
  if (!hash(raw.creative_contract_revision)) issues.push('creative_contract_revision must identify approved bytes');
  // A fraction is named once, by the whole-units check below.
  if (!finite(raw.duration_ms) || raw.duration_ms < 1 || raw.duration_ms > 180_000) issues.push('duration_ms must be 1–180000');
  if (!(SPEECH_MODES as readonly unknown[]).includes(raw.speech_mode)) issues.push('speech_mode is missing or unknown');
  if (!Array.isArray(raw.soundtrack_modes) || raw.soundtrack_modes.some((m) => !(SOUNDTRACK_MODES as readonly unknown[]).includes(m)) || new Set(raw.soundtrack_modes).size !== raw.soundtrack_modes.length) issues.push('soundtrack_modes must be explicit and unique (an empty list means no extra soundtrack)');
  if (!Array.isArray(raw.segments) || !raw.segments.length || raw.segments.length > 300) issues.push('segments must contain 1–300 source-linked entries');
  if (!Array.isArray(raw.audio_cues) || raw.audio_cues.length > 500) issues.push('audio_cues must be an explicit list of at most 500');
  if (!Array.isArray(raw.pauses) || raw.pauses.length > 500) issues.push('pauses must be an explicit list of at most 500');
  if (!Array.isArray(raw.required_cue_ids) || raw.required_cue_ids.some((id) => !text(id))) issues.push('required_cue_ids must be explicit');
  if (raw.visual_overrides !== undefined && (!Array.isArray(raw.visual_overrides) || raw.visual_overrides.length > 500)) issues.push('visual_overrides must be a bounded explicit list');
  issues.push(...fractionalUnits(raw));
  if (issues.length) return { status: 'invalid', timeline: null, revision: null, issues };
  const t = raw as unknown as AssemblyTimeline;
  const validSource = (s: unknown, at: string, picture = false): s is AssemblySource => {
    if (!object(s) || !text(s.asset_id) || !hash(s.sha256) || !ms(s.in_ms) || !ms(s.out_ms) || s.out_ms <= s.in_ms || !finite(s.speed) || s.speed < 0.25 || s.speed > 4) {
      issues.push(`${at}: exact asset, hash, bounds and supported speed required`); return false;
    }
    if (s.path !== undefined && typeof s.path !== 'string') { issues.push(`${at}: path must be a local file path`); return false; }
    const framed = s.crop !== undefined || s.scale_x !== undefined || s.scale_y !== undefined;
    if (framed && !picture) { issues.push(`${at}: crop and scale apply to picture sources only`); return false; }
    if (s.crop !== undefined) {
      const c = s.crop as Record<string, unknown>;
      const px = (v: unknown, min: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
      if (!object(c) || Object.keys(c).some((k) => !['x', 'y', 'w', 'h'].includes(k)) || !px(c.x, 0) || !px(c.y, 0) || !px(c.w, 1) || !px(c.h, 1)) { issues.push(`${at}: crop needs whole source pixels x, y, w and h (w and h at least 1)`); return false; }
    }
    if (s.scale_x !== undefined || s.scale_y !== undefined) {
      if (!finite(s.scale_x) || !finite(s.scale_y) || s.scale_x <= 0 || s.scale_y <= 0) { issues.push(`${at}: scale_x and scale_y go together and must be positive`); return false; }
      if (Math.abs(s.scale_x / s.scale_y - 1) > MAX_UNEVEN_STRETCH) { issues.push(`${at}: uneven stretch (scale_x ${s.scale_x} vs scale_y ${s.scale_y}) distorts the picture by more than ${MAX_UNEVEN_STRETCH * 100}%`); return false; }
    }
    return true;
  };
  const validRange = (v: unknown, at: string) => {
    if (!object(v) || !ms(v.start_ms) || !ms(v.end_ms) || v.end_ms <= v.start_ms || v.end_ms > t.duration_ms) { issues.push(`${at}: invalid final bounds`); return false; }
    return true;
  };
  const ids = new Set<string>();
  for (const s of t.segments) {
    if (!object(s)) { issues.push('segment must be an object'); continue; }
    if (!text(s.id) || ids.has(s.id) || !text(s.scene_id)) issues.push('segment ids must be unique and scene_id required');
    ids.add(s.id);
    if (!(SPEECH_MODES as readonly string[]).includes(s.speech_mode) || typeof s.depicts_speech !== 'boolean' || !['preserve', 'muted'].includes(s.native_audio)) issues.push(`${s.id}: explicit speech and native audio decisions required`);
    if (validRange(s, s.id) && validSource(s.video, s.id, true) && Math.abs(sourceSpan(s.video) - (s.end_ms - s.start_ms)) > 1) issues.push(`${s.id}: picture source duration/rate differs from final interval`);
    if (s.video?.speed !== 1 && !text(s.intent)) issues.push(`${s.id}: speed change needs intent`);
    if (s.depicts_speech && !['native_dialogue', 'audio_driven_lipsync', 'singing'].includes(s.speech_mode)) issues.push(`${s.id}: speaking face cannot use narration-only or no-speech routing`);
    if (s.depicts_speech && s.speech_mode === 'native_dialogue' && s.native_audio !== 'preserve') issues.push(`${s.id}: native dialogue may not be muted`);
    if (s.depicts_speech && s.speech_mode === 'audio_driven_lipsync' && (!validSource(s.speech_driver, `${s.id} driver`) || s.speech_driver?.task !== 'exact_audio')) issues.push(`${s.id}: exact driver audio is required; a voice reference is not a driver`);
    else if (s.depicts_speech && s.speech_mode === 'audio_driven_lipsync' && Math.abs(sourceSpan(s.speech_driver!) - (s.end_ms - s.start_ms)) > 1) issues.push(`${s.id}: driver window/rate differs from its speaking picture interval`);
  }
  ids.clear();
  for (const c of t.audio_cues) {
    if (!object(c)) { issues.push('audio cue must be an object'); continue; }
    if (!text(c.id) || ids.has(c.id)) issues.push('audio cue ids must be unique');
    ids.add(c.id);
    if (!speechRole(c.role) && !['source_ambience', 'music', 'sfx'].includes(c.role)) issues.push(`${c.id}: unknown audio role`);
    if (!finite(c.gain_db) || c.gain_db < -80 || c.gain_db > 24 || typeof c.loop !== 'boolean') issues.push(`${c.id}: explicit supported gain and loop decision required`);
    if (validRange(c, c.id) && validSource(c.source, c.id)) {
      if (!c.loop && Math.abs(sourceSpan(c.source) - (c.end_ms - c.start_ms)) > 1) issues.push(`${c.id}: audio source clock differs from final interval`);
      if ((c.loop || c.source.speed !== 1) && !text(c.intent)) issues.push(`${c.id}: looping/retiming needs intent`);
      if (c.loop && speechRole(c.role)) issues.push(`${c.id}: speech cannot loop to fill a scene`);
    }
  }
  for (const id of t.required_cue_ids) if (!ids.has(id)) issues.push(`required cue ${id} is missing`);
  for (const p of t.pauses) {
    if (!validRange(p, 'pause') || !text(p.reason) || !['speech', 'all_audio'].includes(p.scope)) issues.push('every pause needs its range, scope and reason');
    else if (p.end_ms - p.start_ms > MAX_PLANNED_PAUSE_MS) issues.push(`pause ${p.start_ms}–${p.end_ms}ms is longer than ${MAX_PLANNED_PAUSE_MS}ms`);
  }
  for (const v of t.visual_overrides ?? []) {
    if (!validRange(v, 'visual override') || !text(v.reason) || !['freeze', 'transition'].includes(v.kind)) issues.push('visual overrides need bounds, kind and reason');
    else {
      if (v.kind === 'freeze' && !v.source) issues.push('freeze requires its exact source');
      if (v.kind === 'freeze' && v.end_ms - v.start_ms > maxFreezeMs(v, t.duration_ms)) issues.push(`freeze ${v.start_ms}–${v.end_ms}ms is longer than ${maxFreezeMs(v, t.duration_ms)}ms${v.end_ms === t.duration_ms ? ' (the closing-hold limit)' : ''}`);
      if (v.source && (!validSource(v.source, 'override source', true) || !text(v.scene_id) || !['image', 'video'].includes(v.source_kind ?? ''))) issues.push('override sources need exact bytes, scene_id and source_kind (image or video)');
      if (v.kind === 'transition' && (!Array.isArray(v.segment_ids) || v.segment_ids.length < 2 || v.segment_ids.some((id) => !t.segments.some((s) => s.id === id)))) issues.push('transition must name its source segments');
    }
  }
  const pauseTotal = totalMs(t.pauses.filter(object));
  if (pauseTotal > t.duration_ms * MAX_PLANNED_TOTAL_SHARE) issues.push(`planned pauses add up to ${pauseTotal}ms, more than ${MAX_PLANNED_TOTAL_SHARE * 100}% of the ${t.duration_ms}ms video`);
  if (issues.length) return { status: 'invalid', timeline: null, revision: null, issues };
  // The same source moment shown again later (not the very next segment, both over 1 s) is a
  // repeat; only a declared callback may do it. As in the harness, the prefix is case-sensitive.
  const ordered = [...t.segments].sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
  const long = (x: AssemblySegment) => x.end_ms - x.start_ms > FINAL_MEASURE_THRESHOLDS.repeated_shot_min_s * 1000;
  for (let b = 2; b < ordered.length; b++) {
    const later = ordered[b];
    const repeated = long(later) ? ordered.slice(0, b - 1).find((earlier) => long(earlier) && overlaps(earlier.video, later.video)) : undefined;
    if (repeated && !(typeof later.intent === 'string' && later.intent.startsWith(CALLBACK_INTENT))) issues.push(`${later.id}: shows ${repeated.id}'s source moment again; use another moment, or mark a deliberate repeat with intent "${CALLBACK_INTENT} <why>"`);
  }
  if (gaps([...t.segments, ...(t.visual_overrides ?? [])], t.duration_ms).length) issues.push('Picture coverage has undeclared padding or a missing source interval');
  for (let a = 0; a < t.segments.length; a++) for (let b = a + 1; b < t.segments.length; b++) {
    const left = t.segments[a], right = t.segments[b];
    const start = Math.max(left.start_ms, right.start_ms), end = Math.min(left.end_ms, right.end_ms);
    if (end > start + 1 && !(t.visual_overrides ?? []).some((v) => v.kind === 'transition' && v.start_ms <= start && v.end_ms >= end && v.segment_ids?.includes(left.id) && v.segment_ids.includes(right.id))) issues.push(`${left.id}/${right.id}: picture overlap needs a declared transition`);
  }
  for (const s of t.segments.filter((s) => s.depicts_speech)) {
    const driver = s.speech_mode === 'audio_driven_lipsync' ? s.speech_driver! : s.video;
    const matching = t.audio_cues.filter((c) => c.role === s.speech_mode && c.gain_db > -80 && c.source.sha256 === driver.sha256 && c.source.asset_id === driver.asset_id && Math.abs(c.source.speed - driver.speed) < 1e-9 && !c.loop)
      .filter((c) => Math.abs((c.source.in_ms + (s.start_ms - c.start_ms) * c.source.speed) - driver.in_ms) <= 1)
      .map((c) => ({ start_ms: Math.max(s.start_ms, c.start_ms) - s.start_ms, end_ms: Math.min(s.end_ms, c.end_ms) - s.start_ms }))
      .filter((c) => c.end_ms > c.start_ms);
    if (gaps(matching, s.end_ms - s.start_ms).length) issues.push(`${s.id}: corresponding driver audio does not cover the speaking picture on its source clock`);
  }
  const silence = t.soundtrack_modes.includes('intentional_silence');
  for (let a = 0; a < t.audio_cues.length; a++) for (let b = a + 1; b < t.audio_cues.length; b++) {
    const left = t.audio_cues[a], right = t.audio_cues[b];
    if (!speechRole(left.role) || !speechRole(right.role)) continue;
    const start = Math.max(left.start_ms, right.start_ms), end = Math.min(left.end_ms, right.end_ms);
    if (end <= start + 1) continue;
    if (left.source.sha256 === right.source.sha256 && left.source.in_ms === right.source.in_ms && left.source.out_ms === right.source.out_ms && left.source.speed === right.source.speed && left.start_ms === right.start_ms && left.end_ms === right.end_ms) issues.push(`${left.id}/${right.id}: duplicated speech bus`);
    else if (!(text(left.intent) && text(right.intent)) && !(t.visual_overrides ?? []).some((v) => v.kind === 'transition' && v.start_ms <= start && v.end_ms >= end)) issues.push(`${left.id}/${right.id}: overlapping speech needs explicit intent`);
  }
  if (silence && (t.soundtrack_modes.length !== 1 || t.audio_cues.length)) issues.push('intentional_silence cannot hide planned sound cues');
  if (silence && t.speech_mode !== 'none') issues.push('total silence conflicts with required speech');
  for (const role of ['music', 'sfx', 'source_ambience'] as const) if (t.soundtrack_modes.includes(role) && !t.audio_cues.some((c) => c.role === role)) issues.push(`planned ${role} has no cue`);
  if (!silence) {
    for (const gap of gaps([...t.audio_cues, ...t.pauses.filter((p) => p.scope === 'all_audio')], t.duration_ms)) issues.push(`unplanned audio gap ${gap.start_ms}–${gap.end_ms}ms`);
  }
  if (t.speech_mode === 'none' && t.audio_cues.some((c) => speechRole(c.role))) issues.push('No-speech intent conflicts with speech cues');
  // Speech covers every segment that plans speech; a music-only intro or end card (speech_mode none) needs none.
  if (t.speech_mode !== 'none') {
    const speech = [...t.audio_cues.filter((c) => speechRole(c.role) && c.gain_db > -80), ...t.pauses];
    for (const segment of ordered.filter((x) => x.speech_mode !== 'none')) {
      const inside = speech.filter((i) => i.end_ms > segment.start_ms && i.start_ms < segment.end_ms)
        .map((i) => ({ start_ms: Math.max(i.start_ms, segment.start_ms) - segment.start_ms, end_ms: Math.min(i.end_ms, segment.end_ms) - segment.start_ms }));
      for (const gap of gaps(inside, segment.end_ms - segment.start_ms)) issues.push(`unplanned speech gap ${gap.start_ms + segment.start_ms}–${gap.end_ms + segment.start_ms}ms in ${segment.id} (music cannot substitute for speech intent)`);
    }
  }
  return { status: issues.length ? 'invalid' : 'complete', timeline: t, revision: assemblyTimelineRevision(t), issues };
}

// A final frame and AAC padding can differ slightly from the edit clock.
export const FINAL_ASSEMBLY_DURATION_TOLERANCE_MS = 100;

export function measuredFinalDurationMs(seconds: number | null | undefined): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const duration = Math.ceil(seconds * 1000);
  return Number.isSafeInteger(duration) ? duration : null;
}

const REVIEW_FIELDS = ['output_sha256', 'timeline_revision', 'creative_contract_revision', 'reviewer', 'verdict', 'capabilities', 'coverage', 'unresolved_issues', 'dimensions'] as const;
const CAPABILITY_FIELDS = ['audio', 'motion', 'audio_perception', 'motion_perception'] as const;
/** At most this many unresolved issues are named one by one; the rest are counted. */
const NAMED_ISSUES = 10;

/** Every field the review format doesn't have, by its path, so the reviewer knows exactly what to remove. */
function unknownReviewFields(r: Record<string, unknown>): string[] {
  const extra: string[] = [];
  const check = (value: unknown, allowed: readonly string[], at: string) => {
    if (!object(value)) return;
    for (const key of Object.keys(value)) if (!allowed.includes(key)) extra.push(`${at}${key}`);
  };
  check(r, REVIEW_FIELDS, '');
  check(r.capabilities, CAPABILITY_FIELDS, 'capabilities.');
  if (Array.isArray(r.coverage)) r.coverage.forEach((w, i) => check(w, ['start_ms', 'end_ms'], `coverage[${i}].`));
  if (Array.isArray(r.unresolved_issues)) r.unresolved_issues.forEach((issue, i) => check(issue, ['severity', 'message'], `unresolved_issues[${i}].`));
  if (object(r.dimensions)) {
    check(r.dimensions, CONTENT_DIMENSIONS, 'dimensions.');
    for (const name of CONTENT_DIMENSIONS) check(r.dimensions[name], ['status', 'note'], `dimensions.${name}.`);
  }
  return extra;
}

/**
 * The review's perception, in the new shape. The old booleans are aliases: `true` reads as
 * listened/watched and `false` is refused, so a review that admits it could not hear or see never passes.
 */
export function reviewCapabilities(raw: unknown): { audio: AudioPerception | null; motion: MotionPerception | null; problems: string[] } {
  const problems: string[] = [];
  if (!object(raw)) return { audio: null, motion: null, problems: ['capabilities must say how the sound and the moving picture were reviewed: audio listened or measured, motion watched or measured'] };
  const axis = <T extends string>(name: 'audio' | 'motion', legacy: 'audio_perception' | 'motion_perception', allowed: readonly T[], heard: T): T | null => {
    const current = raw[name];
    const old = raw[legacy];
    if (current !== undefined && old !== undefined) { problems.push(`capabilities has both ${name} and ${legacy}; keep only ${name}`); return null; }
    if (current !== undefined) {
      if (typeof current === 'string' && (allowed as readonly string[]).includes(current)) return current as T;
      problems.push(`capabilities.${name} must be ${allowed.join(' or ')}`);
      return null;
    }
    if (old === true) return heard;
    if (old === false) { problems.push(`capabilities.${legacy} is false: the ${name === 'audio' ? 'sound' : 'moving picture'} was not reviewed. Review it, or record ${name}: "measured" and rely on passing final measurements`); return null; }
    if (old !== undefined) { problems.push(`capabilities.${legacy} must be true, or use ${name}: ${allowed.join(' | ')}`); return null; }
    problems.push(`capabilities.${name} is missing: record ${allowed.join(' or ')}`);
    return null;
  };
  const audio = axis('audio', 'audio_perception', AUDIO_PERCEPTIONS, 'listened');
  const motion = axis('motion', 'motion_perception', MOTION_PERCEPTIONS, 'watched');
  return { audio, motion, problems };
}

/** One blocking issue, named: P0, P1 and blocker block as they are, anything unknown blocks as P1. */
function blockingIssues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ['unresolved_issues must be a list (an empty list when nothing is open)'];
  const blocking: string[] = [];
  raw.forEach((issue, index) => {
    const message = object(issue) && text(issue.message) ? issue.message.trim().slice(0, 200) : '';
    const severity = object(issue) && typeof issue.severity === 'string' ? issue.severity.trim().toLowerCase() : '';
    if (severity === 'p2' && message) return;
    const label = severity === 'p0' ? 'P0' : severity === 'p1' ? 'P1' : severity === 'blocker' ? 'blocker'
      : `issue with unknown severity ${JSON.stringify(object(issue) ? issue.severity ?? null : issue)} (counts as P1)`;
    blocking.push(message ? `Unresolved ${label}${label.startsWith('issue') ? '' : ' issue'}: ${message}` : `unresolved_issues[${index}] needs a severity (P0, P1 or P2) and a message; it counts as P1 until then`);
  });
  if (blocking.length > NAMED_ISSUES) return [...blocking.slice(0, NAMED_ISSUES), `${blocking.length - NAMED_ISSUES} more unresolved issues block the upload`];
  return blocking;
}

/**
 * Omit measurement only for preflight; final acceptance needs the measured duration. A `measured`
 * perception is accepted only with `finalMeasure` of the same bytes in which every check passed
 * (or does not apply); the server adds its own frame judge on top.
 */
export function finalContentReviewProblems(raw: unknown, outputSha: string, assembly: AssemblyCheck, measuredDurationMs?: number | null, finalMeasure?: FinalMeasureSummary | null): string[] {
  if (!object(raw)) return ['Exact-final audiovisual content review is missing'];
  const r = raw as unknown as FinalContentReview;
  const problems: string[] = [];
  for (const field of unknownReviewFields(raw)) problems.push(`content_review has an unknown field "${field}". Remove it, then resume`);
  if (assembly.status !== 'complete' || !assembly.timeline) problems.push('Assembly evidence is incomplete');
  if (r.output_sha256 !== outputSha || r.timeline_revision !== assembly.revision || r.creative_contract_revision !== assembly.timeline?.creative_contract_revision) problems.push('Content review belongs to different final, timeline or approved intent bytes');
  if (r.verdict !== 'approved' || !text(r.reviewer)) problems.push('Content review is not approved by an identified reviewer');
  const perceived = reviewCapabilities(r.capabilities);
  problems.push(...perceived.problems);
  if (perceived.audio === 'measured' || perceived.motion === 'measured') {
    const measuredPass = !!finalMeasure && finalMeasure.output_sha256 === outputSha && Array.isArray(finalMeasure.checks) && finalMeasure.checks.length > 0
      && finalMeasure.checks.every((c) => c.result === 'pass' || c.result === 'not_applicable');
    if (!measuredPass) problems.push('A measured review needs passing final measurements of these exact bytes (final-measure.json); fix the failing checks or review by listening and watching');
  }
  const measurementRequired = measuredDurationMs !== undefined;
  const measured = ms(measuredDurationMs) && measuredDurationMs > 0 ? measuredDurationMs : null;
  if (measurementRequired && measured === null) problems.push('The final playback duration could not be measured');
  if (measured !== null && (!assembly.timeline || Math.abs(assembly.timeline.duration_ms - measured) > FINAL_ASSEMBLY_DURATION_TOLERANCE_MS))
    problems.push(`Assembly duration must match the measured ${measured}ms final within ${FINAL_ASSEMBLY_DURATION_TOLERANCE_MS}ms`);
  const duration = measured ?? assembly.timeline?.duration_ms ?? 0;
  // Preflight accepts frame/AAC padding; final acceptance still covers the measured end.
  const upperBound = duration + FINAL_ASSEMBLY_DURATION_TOLERANCE_MS;
  const coverageValid = Array.isArray(r.coverage) && r.coverage.every((w) => object(w) && ms(w.start_ms) && ms(w.end_ms) && w.end_ms > w.start_ms && w.end_ms <= upperBound);
  if (!coverageValid) problems.push('Complete final playback coverage is missing or out of bounds');
  else {
    let end = 0;
    let missing = 0;
    for (const window of [...r.coverage].sort((a, b) => a.start_ms - b.start_ms)) {
      missing += Math.max(0, window.start_ms - end);
      end = Math.max(end, window.end_ms);
    }
    missing += Math.max(0, duration - end);
    if (!r.coverage.length || missing > 1) problems.push(`Playback and listening must cover the complete ${duration}ms final (only 1ms total timestamp rounding is allowed)`);
  }
  problems.push(...blockingIssues(r.unresolved_issues));
  for (const name of CONTENT_DIMENSIONS) {
    const dimension = r.dimensions?.[name];
    if (!dimension || !text(dimension.note) || !['pass', 'not_applicable'].includes(dimension.status)) problems.push(`${name}: required content review is incomplete or needs revision`);
    if (dimension?.status === 'not_applicable' && ['reference_and_concept', 'brand_and_product', 'action_and_continuity', 'sound_and_silence', 'pacing_and_joins', 'camera_and_lighting'].includes(name)) problems.push(`${name}: this responsibility cannot be skipped`);
    if (dimension?.status === 'not_applicable' && ['voice_performance', 'pronunciation'].includes(name) && assembly.timeline?.speech_mode !== 'none') problems.push(`${name}: speech is present`);
    if (dimension?.status === 'not_applicable' && name === 'lip_sync' && assembly.timeline?.segments.some((s) => s.depicts_speech)) problems.push('lip_sync: a speaking face is present');
  }
  return problems;
}
