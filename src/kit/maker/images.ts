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

export interface PictureGeometry {
  format: 'png' | 'jpeg' | 'webp';
  /** Stored pixels, before any EXIF orientation. */
  width: number;
  height: number;
  /** EXIF orientation, 1 to 8, as the browser applies it: a JPEG's or PNG's; 1 when none (Chromium ignores WebP's). */
  orientation: number;
}

/** The orientation tag of a TIFF block (an EXIF payload past "Exif\0\0"), or 1. */
function tiffOrientation(tiff: Uint8Array): number {
  if (tiff.length < 8) return 1;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return 1;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  if (u16(2) !== 42) return 1;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function jpegGeometry(data: Uint8Array): PictureGeometry | null {
  let at = 2;
  let orientation = 1;
  let exifSeen = false;
  while (at + 4 <= data.length) {
    if (data[at] !== 0xff) return null;
    const marker = data[at + 1];
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (data[at + 2] << 8) | data[at + 3];
    if (length < 2) return null;
    const body = at + 4;
    // Browsers apply the first EXIF block's orientation only.
    if (marker === 0xe1 && !exifSeen && text(data, body, 6) === 'Exif\0\0') {
      exifSeen = true;
      orientation = tiffOrientation(data.subarray(body + 6, at + 2 + length));
    }
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof && body + 5 <= data.length) {
      const height = (data[body + 1] << 8) | data[body + 2];
      const width = (data[body + 3] << 8) | data[body + 4];
      return width && height ? { format: 'jpeg', width, height, orientation } : null;
    }
    at += 2 + length;
  }
  return null;
}

function webpGeometry(data: Uint8Array): PictureGeometry | null {
  if (data.length < 30) return null;
  const chunk = text(data, 12, 4);
  const p = 20;
  const u24 = (at: number) => data[at] | (data[at + 1] << 8) | (data[at + 2] << 16);
  if (chunk === 'VP8X') return { format: 'webp', width: 1 + u24(p + 4), height: 1 + u24(p + 7), orientation: 1 };
  if (chunk === 'VP8 ' && data[p + 3] === 0x9d && data[p + 4] === 0x01 && data[p + 5] === 0x2a) {
    return { format: 'webp', width: (data[p + 6] | (data[p + 7] << 8)) & 0x3fff, height: (data[p + 8] | (data[p + 9] << 8)) & 0x3fff, orientation: 1 };
  }
  if (chunk === 'VP8L' && data[p] === 0x2f) {
    const [b1, b2, b3, b4] = [data[p + 1], data[p + 2], data[p + 3], data[p + 4]];
    return { format: 'webp', width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)), orientation: 1 };
  }
  return null;
}

/** A PNG, JPEG or WebP picture's format, stored size and orientation, read from its bytes; null for anything else. */
export function pictureGeometry(data: Uint8Array): PictureGeometry | null {
  if (data.length >= 24 && data[0] === 0x89 && text(data, 1, 3) === 'PNG' && text(data, 12, 4) === 'IHDR') {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    let orientation = 1;
    for (let at = 8; at + 12 <= data.length; ) {
      const length = view.getUint32(at);
      const type = text(data, at + 4, 4);
      if (type === 'IEND') break;
      if (type === 'eXIf') {
        orientation = tiffOrientation(data.subarray(at + 8, at + 8 + length));
        break;
      }
      at += 12 + length;
    }
    return width && height ? { format: 'png', width, height, orientation } : null;
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) return jpegGeometry(data);
  if (data.length >= 12 && text(data, 0, 4) === 'RIFF' && text(data, 8, 4) === 'WEBP') return webpGeometry(data);
  return null;
}
