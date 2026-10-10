// Words a part wrote that may reach the person: only sentences that read as
// plain words pass; paths, ids and tool output stay in the run log.

/** The card shows no longer a detail than this (gooseworks-app run-failure.ts DETAIL_MAX). */
export const MAX_CHARS = 200;

const PATH = /(^|[\s"'(=:])(?:~?\/|\.{1,2}\/|[A-Za-z]:\\)\S*/;
const FILE_NAME = /\b[\w.-]+\.(?:mp4|mov|m4v|webm|mkv|avi|wav|mp3|m4a|aac|ogg|flac|json|ndjson|vtt|srt|ass|png|jpe?g|webp|gif|svg|ttf|otf|woff2?|html?|mjs|cjs|js|ts|log|txt)\b/i;
// Any slash or backslash (relative paths too) and any name.ext token, known extension or not.
const PATH_LIKE: readonly RegExp[] = [/[\\/]/, /(?:^|[^\w.])\.[a-z][a-z0-9]{1,5}\b/i, /\b[\w-]+\.[a-z][a-z0-9]{0,5}\b/i];
const TOOL_OUTPUT: readonly RegExp[] = [
  /\[[^\]]*@ ?0x[0-9a-f]+\]/i,
  /\b0x[0-9a-f]{4,}\b/i,
  /\b(?:ffmpeg|ffprobe|libav\w*|libx264|x264|chromium|stderr|stdout|errno|stack)\b/i,
  /\b(?:ENOENT|EACCES|EPERM|EPIPE|ENOSPC|EEXIST|ECONNRESET|ECONNREFUSED|ETIMEDOUT)\b/,
  /\bexit(?:ed)?\b[^.]*?-?\d+|\bexit code\b/i,
  /\b\w*(?:Error|Exception)\b\s*:/,
  /\bat \S+ \(|:\d+:\d+\b/,
  /\b(?:pts|dts|bitrate|kb\/s|frame=|stream #?\d|codec\w*|demux\w*|muxer|EBML|moov)\b/i,
  /[{}<>]|=>|\|\||&&/,
  // ffmpeg, ffprobe and libav wording that arrives without a tool's name in front of it.
  /\b(?:invalid data found|error while|conversion failed|no such file|moov atom|could not find codec|error opening|error initiali[sz]ing|output file is empty|does not contain any stream|unknown encoder|unrecognized option|invalid argument|permission denied|operation not permitted|end of file|core dumped|segmentation fault)\b/i,
  // part@version, snake_case and kebab-case ids: none is a plain word.
  /\b[a-z0-9]+(?:[-_.][a-z0-9]+)*@\d/i,
  /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/i,
  // Field paths such as brand.cta, scenes.0.line, scenes[0].line or products[1].images[2].
  /\b[a-z_]\w*(?:\.(?:[a-z_]\w*|\d+)|\[\w*\])+/i,
];

function readsPlain(sentence: string, names: readonly string[]): boolean {
  if (PATH.test(sentence) || FILE_NAME.test(sentence) || PATH_LIKE.some((pattern) => pattern.test(sentence))) return false;
  if (TOOL_OUTPUT.some((pattern) => pattern.test(sentence))) return false;
  return !names.some((name) => new RegExp(`(^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`, 'i').test(sentence));
}

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;
const finished = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The plain sentences of `text`, at most `maxChars` characters, or `fallback` when the filter took out
 * most of it. `names` are ids the person must not see (parts, steps, layers), matched as whole words in
 * any case, even when one reads as a plain word.
 */
export function plainWords(text: string, fallback: string, names: readonly string[] = [], maxChars = MAX_CHARS): string {
  const ids = names.filter(Boolean);
  const sentences = text
    .split(/\r?\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  let kept = '';
  for (const sentence of sentences) {
    if (!readsPlain(sentence, ids)) continue;
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (finished(next).length > maxChars) break;
    kept = next;
  }
  // A path is not words the person lost, so it doesn't count toward "most of it".
  const total = letters(text.replace(new RegExp(PATH.source, 'g'), '$1'));
  if (letters(kept) < 2 || letters(kept) * 2 < total) return fallback;
  return finished(kept);
}
