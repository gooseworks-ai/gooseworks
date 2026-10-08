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
  const head = svgText(data.subarray(0, 4096)).replace(/^\uFEFF/, '');
  if (/^\s*(<\?xml|<!--|<!doctype svg|<svg|<[A-Za-z_][\w.-]*:svg)/i.test(head) || /<([A-Za-z_][\w.-]*:)?svg[\s>]/i.test(head)) {
    return SVG_MOTION.test(svgText(data));
  }
  return false;
}
