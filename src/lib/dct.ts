// 8x8 orthonormal DCT-II, the transform JPEG uses.
const C = new Float32Array(64);
for (let u = 0; u < 8; u++)
  for (let x = 0; x < 8; x++) C[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);

const tmp = new Float32Array(64);

export function dct8(b: Float32Array, out: Float32Array) {
  for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) { let s = 0; for (let k = 0; k < 8; k++) s += C[u * 8 + k] * b[k * 8 + x]; tmp[u * 8 + x] = s; }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let k = 0; k < 8; k++) s += tmp[u * 8 + k] * C[v * 8 + k]; out[u * 8 + v] = s; }
}

export function idct8(c: Float32Array, out: Float32Array) {
  for (let x = 0; x < 8; x++) for (let v = 0; v < 8; v++) { let s = 0; for (let k = 0; k < 8; k++) s += C[k * 8 + x] * c[k * 8 + v]; tmp[x * 8 + v] = s; }
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { let s = 0; for (let k = 0; k < 8; k++) s += tmp[x * 8 + k] * C[k * 8 + y]; out[x * 8 + y] = s; }
}

/** Runs fn on the DCT coefficients of every full 8x8 block of a luma plane; returns the plane rebuilt from (possibly edited) coefficients. */
export function mapBlocks(Y: Float32Array, w: number, h: number, fn: (block: number, coef: Float32Array) => void): Float32Array {
  const out = new Float32Array(Y);
  const blk = new Float32Array(64), coef = new Float32Array(64);
  let b = 0;
  for (let by = 0; by + 8 <= h; by += 8)
    for (let bx = 0; bx + 8 <= w; bx += 8, b++) {
      for (let i = 0; i < 64; i++) blk[i] = Y[(by + (i >> 3)) * w + bx + (i & 7)];
      dct8(blk, coef);
      fn(b, coef);
      idct8(coef, blk);
      for (let i = 0; i < 64; i++) out[(by + (i >> 3)) * w + bx + (i & 7)] = blk[i];
    }
  return out;
}
