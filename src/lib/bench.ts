import { Attack } from "./attacks";
import { Img, bitAccuracy } from "./img";
import { psnr, ssim } from "./metrics";
import { Scheme } from "./schemes";

export type Row = {
  image: string;
  scheme: string;
  attack: string;
  level: number;
  bitAcc: number;
  detected: boolean;
  psnr: number;
  ssim: number;
};

// 26/32 bits correct: a random guess gets there with p < 0.001.
export const DETECT_THRESHOLD = 0.8;

export async function runBench(
  images: { name: string; img: Img }[],
  schemes: Scheme[],
  attacks: Attack[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Row[]> {
  const total = images.length * schemes.length * attacks.reduce((n, a) => n + a.levels.length, 0);
  const rows: Row[] = [];
  for (const { name, img } of images)
    for (const s of schemes) {
      const marked = s.embed(img);
      for (const a of attacks)
        for (const level of a.levels) {
          const attacked = await a.apply(marked, level);
          const acc = bitAccuracy(s.extract(attacked));
          rows.push({ image: name, scheme: s.id, attack: a.id, level, bitAcc: acc, detected: acc >= DETECT_THRESHOLD, psnr: psnr(img, attacked), ssim: ssim(img, attacked) });
          onProgress(rows.length, total);
          await new Promise((r) => setTimeout(r)); // let the UI paint
        }
    }
  return rows;
}

export function toCsv(rows: Row[]) {
  const keys = Object.keys(rows[0] ?? {}) as (keyof Row)[];
  return [keys.join(","), ...rows.map((r) => keys.map((k) => (typeof r[k] === "number" ? +(r[k] as number).toFixed(4) : r[k])).join(","))].join("\n");
}
