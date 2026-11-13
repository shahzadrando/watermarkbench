import { Img, luma } from "./img";

export function psnr(a: Img, b: Img): number {
  let se = 0, n = 0;
  for (let p = 0; p < a.data.length; p++) if ((p & 3) !== 3) { const d = a.data[p] - b.data[p]; se += d * d; n++; }
  return se === 0 ? 99 : Math.min(99, 10 * Math.log10((255 * 255) / (se / n)));
}

// shortcut: SSIM over non-overlapping 8x8 luma windows (not the 11x11 Gaussian window of Wang et al.); fine for relative comparison, swap in a reference implementation for publication numbers.
export function ssim(a: Img, b: Img): number {
  const A = luma(a), B = luma(b), w = a.width, C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let total = 0, count = 0;
  for (let by = 0; by + 8 <= a.height; by += 8)
    for (let bx = 0; bx + 8 <= w; bx += 8) {
      let ma = 0, mb = 0;
      for (let i = 0; i < 64; i++) { const k = (by + (i >> 3)) * w + bx + (i & 7); ma += A[k]; mb += B[k]; }
      ma /= 64; mb /= 64;
      let va = 0, vb = 0, cov = 0;
      for (let i = 0; i < 64; i++) { const k = (by + (i >> 3)) * w + bx + (i & 7); const da = A[k] - ma, db = B[k] - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= 63; vb /= 63; cov /= 63;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  return total / count;
}
