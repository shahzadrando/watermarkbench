import { Img, rng } from "./img";

/** Procedural test images (gradients, shapes, texture) so the benchmark runs with zero uploads. */
export function syntheticImage(seed: number, size = 384): Img {
  const r = rng(seed), data = new Uint8ClampedArray(size * size * 4);
  const base = [r() * 255, r() * 255, r() * 255];
  const circles = Array.from({ length: 6 }, () => ({ x: r() * size, y: r() * size, rad: 20 + r() * size * 0.25, col: [r() * 255, r() * 255, r() * 255] }));
  const freq = 0.02 + r() * 0.08;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      let col = base.map((b, c) => b * (1 - y / size) + (c === 0 ? x : y) * 0.5);
      for (const ci of circles) if ((x - ci.x) ** 2 + (y - ci.y) ** 2 < ci.rad ** 2) col = ci.col;
      const tex = 18 * Math.sin(x * freq) * Math.cos(y * freq * 1.3) + (r() - 0.5) * 12;
      data[p] = col[0] + tex;
      data[p + 1] = col[1] + tex;
      data[p + 2] = col[2] + tex;
      data[p + 3] = 255;
    }
  return { width: size, height: size, data };
}
