// Moving pictures in an <img>, an SVG <image> or a CSS background play on the
// computer's own clock, not the maker's, so the maker refuses them: animated
// GIF, APNG, animated WebP, AVIF sequences and SVG files with animations. The
// format is read from the file's bytes, never from its name or label. Bundled
// into the part.

function gifFrames(data: Uint8Array): number {
  if (data.length < 13) return 0;
  let at = 13;
  if (data[10] & 0x80) at += 3 * (1 << ((data[10] & 0x07) + 1));
  let frames = 0;
  const skipBlocks = () => {
    while (at < data.length && data[at] !== 0) at += data[at] + 1;
    at++;
  };
  while (at < data.length) {
    const block = data[at];
    if (block === 0x3b) break;
    if (block === 0x21) {
      at += 2;
      skipBlocks();
    } else if (block === 0x2c) {
      frames++;
      if (frames > 1) return frames;
      const packed = data[at + 9];
      at += 10;
      if (packed & 0x80) at += 3 * (1 << ((packed & 0x07) + 1));
      at++;
      skipBlocks();
    } else break;
  }
  return frames;
}

function pngIsAnimated(data: Uint8Array): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 8;
  while (at + 8 <= data.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(data[at + 4], data[at + 5], data[at + 6], data[at + 7]);
    if (type === 'acTL') return at + 12 <= data.length && view.getUint32(at + 8) > 1;
    if (type === 'IDAT' || type === 'IEND') return false;
    at += 12 + length;
  }
  return false;
}

function text(data: Uint8Array, start: number, n: number): string {
  return String.fromCharCode(...data.subarray(start, start + n));
}

function webpIsAnimated(data: Uint8Array): boolean {
  let at = 12;
  while (at + 8 <= data.length) {
    const type = text(data, at, 4);
    const size = data[at + 4] | (data[at + 5] << 8) | (data[at + 6] << 16) | (data[at + 7] << 24);
    if (type === 'VP8X' && data[at + 8] & 0x02) return true;
    if (type === 'ANIM' || type === 'ANMF') return true;
    at += 8 + size + (size & 1);
  }
  return false;
}

/** SVG as text, in the encoding its bytes say: UTF-16 with a byte order mark, else UTF-8. */
function svgText(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data);
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data);
  return new TextDecoder('utf-8').decode(data);
}

/** SMIL elements with or without a namespace prefix, and CSS animations. */
const SVG_MOTION = /<([A-Za-z_][\w.-]*:)?(animate|animateTransform|animateMotion|animateColor|set)\b|@keyframes|\banimation(-name)?\s*:/i;

/** True when the picture moves on its own, whatever its file name or label says. */
export function isAnimatedImage(data: Uint8Array): boolean {
  if (data.length >= 6 && /^GIF8[79]a$/.test(text(data, 0, 6))) return gifFrames(data) > 1;
  if (data.length >= 8 && data[0] === 0x89 && text(data, 1, 3) === 'PNG') return pngIsAnimated(data);
  if (data.length >= 12 && text(data, 0, 4) === 'RIFF' && text(data, 8, 4) === 'WEBP') return webpIsAnimated(data);
  if (data.length >= 12 && text(data, 4, 4) === 'ftyp') return /avis|msf1/.test(text(data, 8, Math.min(56, data.length - 8)));
  // Text can be SVG only if it starts with a byte order mark, '<' or space.
  const bom = (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) || (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff);
  if (!bom && data[0] !== 0x3c && !/\s/.test(String.fromCharCode(data[0] ?? 0))) return false;
  const svg = svgText(data);
  return isSvgDocument(svg) && SVG_MOTION.test(svg);
}

/** True when the text's first element is <svg> (or <prefix:svg>), past any BOM, space, XML declaration, comments, PIs and doctype. */
function isSvgDocument(textOf: string): boolean {
  let at = textOf.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (at < textOf.length && /\s/.test(textOf[at])) at++;
    if (textOf.startsWith('<!--', at)) {
      const end = textOf.indexOf('-->', at + 4);
      if (end < 0) return false;
      at = end + 3;
    } else if (textOf.startsWith('<?', at)) {
      const end = textOf.indexOf('?>', at + 2);
      if (end < 0) return false;
      at = end + 2;
    } else if (/^<!doctype/i.test(textOf.slice(at, at + 9))) {
      // A doctype may hold an internal subset in [ ... ].
      const bracket = textOf.indexOf('[', at);
      const close = textOf.indexOf('>', at);
      if (close < 0) return false;
      at = bracket >= 0 && bracket < close ? textOf.indexOf(']>', bracket) + 2 : close + 1;
      if (at < 2) return false;
    } else break;
  }
  return /^<([A-Za-z_][\w.-]*:)?svg[\s>/]/i.test(textOf.slice(at, at + 80));
}

/** The bytes of a data: URL, decoded as a browser does (base64, or percent-encoded bytes); null when it is not one. */
export function dataUrlBytes(url: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(url.trim());
  if (!match) return null;
  const head = match[1];
  const body = match[2];
  const mime = (head.split(';')[0] || 'text/plain').trim().toLowerCase();
  if (/;\s*base64\s*$/i.test(head)) return { mime, bytes: Buffer.from(body.replace(/\s+/g, ''), 'base64') };
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '%' && /^[0-9a-f]{2}$/i.test(body.slice(i + 1, i + 3))) {
      out.push(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(...Buffer.from(body[i], 'utf8'));
  }
  return { mime, bytes: Buffer.from(out) };
}

/** Every data: URL a stylesheet names in url(...), including the ones inside stylesheets it imports as data. */
export function cssDataUrls(css: string, depth = 0): Array<{ url: string; mime: string; bytes: Buffer }> {
  const found: Array<{ url: string; mime: string; bytes: Buffer }> = [];
  const token = /url\(\s*(['"]?)(data:[^'")]*)\1\s*\)|@import\s+(['"])(data:[^'"]*)\3/gi;
  let match: RegExpExecArray | null;
  while ((match = token.exec(css))) {
    const url = match[2] ?? match[4];
    const decoded = dataUrlBytes(url);
    if (!decoded) continue;
    found.push({ url, ...decoded });
    if (decoded.mime === 'text/css' && depth < 4) found.push(...cssDataUrls(decoded.bytes.toString('utf8'), depth + 1));
  }
  return found;
}
