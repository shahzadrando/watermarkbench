import { describe, expect, it } from "vitest";
import { ATTACKS } from "./attacks";
import { dct8, idct8 } from "./dct";
import { PAYLOAD, bitAccuracy, scoreBits } from "./img";
import { psnr, ssim } from "./metrics";
import { syntheticImage } from "./samples";
import { SCHEMES } from "./schemes";
import { runBench } from "./bench";

const img = syntheticImage(1, 256);
const attack = (id: string) => ATTACKS.find((a) => a.id === id)!;

describe("dct", () => {
  it("round-trips", () => {
    const b = Float32Array.from({ length: 64 }, (_, i) => (i * 37) % 255), c = new Float32Array(64), back = new Float32Array(64);
    dct8(b, c);
    idct8(c, back);
    back.forEach((v, i) => expect(v).toBeCloseTo(b[i], 2));
  });
});

describe("schemes", () => {
  it.each(SCHEMES.map((s) => [s.id, s] as const))("%s recovers the payload when untouched and stays imperceptible", (_, s) => {
    const marked = s.embed(img);
    expect(bitAccuracy(s.extract(marked))).toBe(1);
    expect(psnr(img, marked)).toBeGreaterThan(35);
  });

  it("an unmarked image reads as chance, not as a detection", () => {
    for (const s of SCHEMES) expect(scoreBits(s.extract(syntheticImage(7, 256))).bitAcc).toBeLessThan(0.8);
  });

  it("LSB is fragile, spread spectrum survives mild noise", async () => {
    const noisy = (s: (typeof SCHEMES)[number]) => attack("noise").apply(s.embed(img), 5);
    const [lsb, , ss] = SCHEMES;
    expect(bitAccuracy(lsb.extract(await noisy(lsb)))).toBeLessThan(0.8);
    expect(bitAccuracy(ss.extract(await noisy(ss)))).toBe(1);
  });
});

describe("scoreBits", () => {
  it("recognises a fully inverted payload", () => {
    expect(scoreBits(PAYLOAD.map((b) => 1 - b))).toEqual({ bitAcc: 1, inverted: true });
    expect(scoreBits(PAYLOAD)).toEqual({ bitAcc: 1, inverted: false });
  });
});

describe("metrics", () => {
  it("identical images score max", () => {
    expect(psnr(img, img)).toBe(99);
    expect(ssim(img, img)).toBeCloseTo(1, 5);
  });
});

describe("runBench", () => {
  it("produces one row per image × scheme × attack level", async () => {
    const attacks = ATTACKS.filter((a) => a.id !== "jpeg"); // JPEG needs a browser canvas
    const rows = await runBench([{ name: "a", img }], SCHEMES, attacks);
    expect(rows).toHaveLength(SCHEMES.length * attacks.reduce((n, a) => n + a.levels.length, 0));
  });

  it("skips quality metrics only for geometric attacks, and only when asked", async () => {
    const pick = ATTACKS.filter((a) => a.id === "rotate" || a.id === "noise").map((a) => ({ ...a, levels: [a.levels[0]] }));
    const [skipped, kept] = await Promise.all([true, false].map((skip) => runBench([{ name: "a", img }], [SCHEMES[0]], pick, undefined, { skipGeometricQuality: skip })));
    expect(skipped.find((r) => r.attack === "rotate")!.psnr).toBeNull();
    expect(skipped.find((r) => r.attack === "noise")!.psnr).not.toBeNull();
    expect(kept.every((r) => r.psnr !== null && r.ssim !== null)).toBe(true);
  });
});
