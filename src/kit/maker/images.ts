// Moving pictures in an <img> or a CSS background play on the computer's
// own clock, not the maker's, so the maker refuses them: animated GIF, APNG,
// animated WebP, AVIF sequences and SVG files with animations. Reads only the
// file's own structure. Bundled into the part.

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

function webpIsAnimated(data: Uint8Array): boolean {
  const text = (start: number, n: number) => String.fromCharCode(...data.subarray(start, start + n));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') return false;
  let at = 12;
  while (at + 8 <= data.length) {
    const type = text(at, 4);
    const size = data[at + 4] | (data[at + 5] << 8) | (data[at + 6] << 16) | (data[at + 7] << 24);
    if (type === 'VP8X' && data[at + 8] & 0x02) return true;
    if (type === 'ANIM' || type === 'ANMF') return true;
    at += 8 + size + (size & 1);
  }
  return false;
}

function avifIsSequence(data: Uint8Array): boolean {
  const head = String.fromCharCode(...data.subarray(4, Math.min(data.length, 64)));
  return head.startsWith('ftyp') && /avis|msf1/.test(head);
}

const SVG_MOTION = /<(animate|animateTransform|animateMotion|set)\b|@keyframes|\banimation(-name)?\s*:/i;

/** True when the picture moves on its own. */
export function isAnimatedImage(data: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/gif':
      return gifFrames(data) > 1;
    case 'image/png':
    case 'image/apng':
      return pngIsAnimated(data);
    case 'image/webp':
      return webpIsAnimated(data);
    case 'image/avif':
      return avifIsSequence(data);
    case 'image/svg+xml':
      return SVG_MOTION.test(new TextDecoder().decode(data));
    default:
      return false;
  }
}
