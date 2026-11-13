import { Attack } from "./attacks";
import { Img, scoreBits } from "./img";
import { psnr, ssim } from "./metrics";
import { Scheme } from "./schemes";

export type Row = {
  image: string;
  scheme: string;
  attack: string;
  level: number;
  bitAcc: number;
  inverted: boolean;
  detected: boolean;
  psnr: number | null;
  ssim: number | null;
};

// 26/32 bits correct (either polarity): a random guess gets there with p < 0.002.
export const DETECT_THRESHOLD = 0.8;

export async function runBench(
  images: { name: string; img: Img }[],
  schemes: Scheme[],
  attacks: Attack[],
  onProgress: (done: number, total: number) => void = () => {},
  { skipGeometricQuality = true } = {},
): Promise<Row[]> {
  const total = images.length * schemes.length * attacks.reduce((n, a) => n + a.levels.length, 0);
  const rows: Row[] = [];
  for (const { name, img } of images)
    for (const s of schemes) {
      const marked = s.embed(img);
      for (const a of attacks)
        for (const level of a.levels) {
          const attacked = await a.apply(marked, level);
          const { bitAcc, inverted } = scoreBits(s.extract(attacked));
          const skipQuality = skipGeometricQuality && a.geometric;
          rows.push({
            image: name, scheme: s.id, attack: a.id, level, bitAcc, inverted, detected: bitAcc >= DETECT_THRESHOLD,
            psnr: skipQuality ? null : psnr(img, attacked),
            ssim: skipQuality ? null : ssim(img, attacked),
          });
          onProgress(rows.length, total);
          await new Promise((r) => setTimeout(r)); // let the UI paint
        }
    }
  return rows;
}

// null (skipped metric) becomes an empty CSV cell via join.
export function toCsv(rows: Row[]) {
  const keys = Object.keys(rows[0] ?? {}) as (keyof Row)[];
  return [keys.join(","), ...rows.map((r) => keys.map((k) => (typeof r[k] === "number" ? +(r[k] as number).toFixed(4) : r[k])).join(","))].join("\n");
}
