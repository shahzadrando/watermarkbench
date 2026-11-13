import { describe, expect, it } from "vitest";
import { inspect } from "./inspect";

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const be32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const be16 = (n: number) => Uint8Array.of(n >> 8, n & 255);

// Little-endian TIFF with IFD0 = { Software: <software>, GPS pointer -> empty GPS IFD }.
function tiff(software: string) {
  const s = enc(software + "\0"), b = new Uint8Array(8 + 2 + 2 * 12 + 4 + 2 + 4 + s.length), dv = new DataView(b.buffer);
  b.set(enc("II*\0")); dv.setUint32(4, 8, true);
  dv.setUint16(8, 2, true);
  const gpsOff = 8 + 2 + 24 + 4, strOff = gpsOff + 6;
  dv.setUint16(10, 0x131, true); dv.setUint16(12, 2, true); dv.setUint32(14, s.length, true); dv.setUint32(18, strOff, true);
  dv.setUint16(22, 0x8825, true); dv.setUint16(24, 4, true); dv.setUint32(26, 1, true); dv.setUint32(30, gpsOff, true);
  b.set(s, strOff);
  return b;
}

function jpeg(...segments: [number, Uint8Array][]) {
  return cat(Uint8Array.of(0xff, 0xd8), ...segments.map(([m, d]) => cat(Uint8Array.of(0xff, m), be16(d.length + 2), d)), Uint8Array.of(0xff, 0xda, 0, 2));
}

const pngChunk = (type: string, d: Uint8Array) => cat(be32(d.length), enc(type), d, be32(0));
const png = (...chunks: Uint8Array[]) => cat(enc("\x89PNG\r\n\x1a\n"), ...chunks, pngChunk("IEND", new Uint8Array()));

describe("inspect", () => {
  it("reads EXIF software, GPS and IPTC AI source type from a JPEG", async () => {
    const xmp = enc('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>');
    const r = await inspect(jpeg([0xe1, cat(enc("Exif\0\0"), tiff("Midjourney v7"))], [0xe1, xmp]));
    expect(r.format).toBe("JPEG");
    expect(r.aiLabelled).toBe(true);
    expect(r.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Software", value: "Midjourney v7", ai: true }),
      expect.objectContaining({ label: "GPS location", group: "Privacy" }),
      expect.objectContaining({ label: "IPTC digital source type", value: "trainedAlgorithmicMedia", ai: true }),
    ]));
  });

  it("flags Stable Diffusion parameters in a PNG text chunk", async () => {
    const r = await inspect(png(pngChunk("tEXt", enc("parameters\0a cat, Steps: 20, Sampler: Euler"))));
    expect(r.aiLabelled).toBe(true);
    expect(r.findings[0]).toMatchObject({ group: "Generator", value: "a cat, Steps: 20, Sampler: Euler", ai: true });
  });

  it("detects a C2PA manifest and its declared AI source", async () => {
    const r = await inspect(jpeg([0xeb, enc("JP\0\0jumbc2pa\0c2pa.actions\0digitalSourceType\0trainedAlgorithmicMedia")]));
    expect(r.findings.map((f) => f.label)).toEqual(expect.arrayContaining(["C2PA Content Credentials", "C2PA declared source"]));
    expect(r.aiLabelled).toBe(true);
  });

  it("reports nothing AI-related for a camera photo", async () => {
    const r = await inspect(jpeg([0xe1, cat(enc("Exif\0\0"), tiff("Camera firmware 1.2"))]));
    expect(r.aiLabelled).toBe(false);
  });

  it("survives truncated EXIF without throwing", async () => {
    const r = await inspect(jpeg([0xe1, enc("Exif\0\0II*\0\xff\xff")]));
    expect(r.findings).toEqual([expect.objectContaining({ value: "Present but malformed" })]);
  });
});
