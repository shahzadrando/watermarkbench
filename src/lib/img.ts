// RGBA image, same layout as the browser's ImageData so it converts for free.
export type Img = { width: number; height: number; data: Uint8ClampedArray };

export const clone = (im: Img): Img => ({ width: im.width, height: im.height, data: new Uint8ClampedArray(im.data) });

// 32-bit test payload every scheme embeds and tries to recover.
export const PAYLOAD: number[] = Array.from({ length: 32 }, (_, i) => (0xa5c30f96 >>> (31 - i)) & 1);

export const bitAccuracy = (bits: number[]) => bits.filter((b, i) => b === PAYLOAD[i]).length / PAYLOAD.length;

// An attack can flip every bit (e.g. LSB under darkening); the watermark is still present, so score the inverted payload too.
export function scoreBits(bits: number[]) {
  const acc = bitAccuracy(bits);
  return acc < 0.5 ? { bitAcc: 1 - acc, inverted: true } : { bitAcc: acc, inverted: false };
}

export function luma(im: Img): Float32Array {
  const y = new Float32Array(im.width * im.height);
  for (let i = 0, p = 0; i < y.length; i++, p += 4) y[i] = 0.299 * im.data[p] + 0.587 * im.data[p + 1] + 0.114 * im.data[p + 2];
  return y;
}

// Adds the luma change to R, G and B equally (their luma weights sum to 1, so Y shifts by the same amount).
export function withLuma(im: Img, oldY: Float32Array, newY: Float32Array): Img {
  const out = clone(im);
  for (let i = 0, p = 0; i < oldY.length; i++, p += 4) {
    const d = newY[i] - oldY[i];
    out.data[p] += d;
    out.data[p + 1] += d;
    out.data[p + 2] += d;
  }
  return out;
}

// Deterministic PRNG (mulberry32) so experiments are reproducible.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
}

export function bilinear(im: Img, x: number, y: number, c: number) {
  const { width: w, height: h, data } = im;
  x = Math.min(Math.max(x, 0), w - 1);
  y = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number) => data[(yy * w + xx) * 4 + c];
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

export function resize(im: Img, w: number, h: number): Img {
  const out: Img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const sx = im.width / w, sy = im.height / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) out.data[(y * w + x) * 4 + c] = bilinear(im, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, c);
  return out;
}
