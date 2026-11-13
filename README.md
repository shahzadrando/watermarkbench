# WatermarkBench

An in-browser benchmark for the robustness of invisible image watermarks. Built as a final-year research project.

**Live demo:** https://ai-removal.vercel.app

It embeds a known 32-bit test payload with each watermarking scheme, applies common image edits, and measures whether the payload can still be recovered and how much image quality was lost. Everything runs client-side; no images are uploaded anywhere.

## What it measures

| Schemes (implemented from scratch in TypeScript) | Attacks |
|---|---|
| **Spatial LSB**: fragile baseline | JPEG (q 90/75/50/30, real browser encoder) |
| **DCT-QIM**: quantization index modulation on a mid-frequency 8×8 DCT coefficient | Downscale + upscale |
| **DCT Spread Spectrum**: pseudo-random mid-band pattern, blind correlation detector | Center crop, Gaussian blur, Gaussian noise, brightness, rotation |

Metrics per image × scheme × attack level: bit accuracy, detected (≥ 80% bits, p < 0.001 for a random guess), PSNR, SSIM. Results export to CSV.

**Sample finding:** all three schemes are defeated by small geometric changes (1° rotation, 5% crop) because the 8×8 block grid desynchronises. This motivates synchronisation templates or learned watermarks as future work.

## Metadata inspector

A second tab reads an image's metadata and reports AI-provenance labels (C2PA Content Credentials, IPTC `DigitalSourceType`, generator tags such as Stable Diffusion / ComfyUI PNG text chunks, EXIF/XMP software) and privacy-sensitive fields (GPS, camera serial, owner). It is read-only. Load an original next to a copy that went through a messaging app or a screenshot to measure which labels survive sharing. C2PA is detected by its manifest labels; signatures are not cryptographically verified.

## Scope and responsible use

This is a research and teaching tool. It only tests the open schemes implemented in this repo, using a payload it embeds itself. It does not detect or touch third-party or commercial watermarks (SynthID, C2PA, vendor marks), and it never offers attacked images for download. Results are meant to help design more robust provenance, not to defeat it.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Recharts · Vitest · Vercel (free tier). No backend, no paid services.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests for schemes, attacks, metrics
```

## Project layout

```
src/lib/img.ts       image type, payload, PRNG, resize
src/lib/dct.ts       8x8 DCT and block mapping
src/lib/schemes.ts   watermark embed / extract
src/lib/attacks.ts   image edits
src/lib/metrics.ts   PSNR, SSIM
src/lib/bench.ts     benchmark runner, CSV export
src/app/bench-app.tsx  UI
```

Adding a scheme or attack means adding one object to `SCHEMES` or `ATTACKS`; the UI picks it up automatically.

## Roadmap

- [ ] Run the benchmark in a Web Worker (keeps the UI responsive on large sets)
- [ ] Gaussian-window SSIM and LPIPS (via onnxruntime-web)
- [ ] Geometric-resilient scheme (synchronisation template)
- [ ] Learned watermark (e.g. an ONNX export of an open model)
- [ ] Video frames via WebCodecs

## License

MIT
