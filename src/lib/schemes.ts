import { mapBlocks } from "./dct";
import { Img, PAYLOAD, clone, luma, rng, withLuma } from "./img";

export type Scheme = {
  id: string;
  name: string;
  description: string;
  embed: (im: Img) => Img;
  extract: (im: Img) => number[];
};

const N = PAYLOAD.length;
const vote = (votes: Float32Array) => Array.from(votes, (v) => (v > 0 ? 1 : 0));

// Fragile baseline: payload bits in the least significant bit of the green channel, repeated over the image.
const lsb: Scheme = {
  id: "lsb",
  name: "Spatial LSB",
  description: "Fragile baseline. Bits stored in the green channel's least significant bit.",
  embed(im) {
    const out = clone(im);
    for (let i = 0, p = 1; p < out.data.length; i++, p += 4) out.data[p] = (out.data[p] & ~1) | PAYLOAD[i % N];
    return out;
  },
  extract(im) {
    const votes = new Float32Array(N);
    for (let i = 0, p = 1; p < im.data.length; i++, p += 4) votes[i % N] += im.data[p] & 1 ? 1 : -1;
    return vote(votes);
  },
};

// Quantization Index Modulation on one mid-frequency DCT coefficient per 8x8 luma block.
const QIM_STEP = 24, QIM_COEF = 2 * 8 + 3;
const qim: Scheme = {
  id: "dct-qim",
  name: "DCT-QIM",
  description: "Semi-robust. Quantizes one mid-frequency DCT coefficient per 8×8 block (JPEG domain).",
  embed(im) {
    const Y = luma(im);
    const nY = mapBlocks(Y, im.width, im.height, (b, c) => {
      const d = PAYLOAD[b % N] ? QIM_STEP / 2 : 0;
      c[QIM_COEF] = Math.round((c[QIM_COEF] - d) / QIM_STEP) * QIM_STEP + d;
    });
    return withLuma(im, Y, nY);
  },
  extract(im) {
    const votes = new Float32Array(N);
    mapBlocks(luma(im), im.width, im.height, (b, c) => {
      const r = ((c[QIM_COEF] % QIM_STEP) + QIM_STEP) % QIM_STEP;
      votes[b % N] += Math.abs(r - QIM_STEP / 2) < QIM_STEP / 4 ? 1 : -1;
    });
    return vote(votes);
  },
};

// Spread spectrum: a ±1 pseudo-random pattern over mid-band DCT coefficients, sign carries the bit; blind correlation detector.
const SS_BAND = [[1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [2, 3], [3, 2], [3, 3], [1, 4], [4, 1]].map(([u, v]) => u * 8 + v);
const SS_STRENGTH = 5;
const pattern = (b: number) => { const r = rng(b * 7919 + 1); return SS_BAND.map(() => (r() < 0.5 ? -1 : 1)); };
const ss: Scheme = {
  id: "dct-ss",
  name: "DCT Spread Spectrum",
  description: "Robust. Adds a pseudo-random pattern across mid-band DCT coefficients; detected by correlation.",
  embed(im) {
    const Y = luma(im);
    const nY = mapBlocks(Y, im.width, im.height, (b, c) => {
      const s = PAYLOAD[b % N] ? 1 : -1, p = pattern(b);
      SS_BAND.forEach((k, j) => (c[k] += SS_STRENGTH * s * p[j]));
    });
    return withLuma(im, Y, nY);
  },
  extract(im) {
    const votes = new Float32Array(N);
    mapBlocks(luma(im), im.width, im.height, (b, c) => {
      const p = pattern(b);
      SS_BAND.forEach((k, j) => (votes[b % N] += c[k] * p[j]));
    });
    return vote(votes);
  },
};

export const SCHEMES: Scheme[] = [lsb, qim, ss];
