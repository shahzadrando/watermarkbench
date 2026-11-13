import { Img, bilinear, clone, gaussian, resize, rng } from "./img";

export type Attack = {
  id: string;
  name: string;
  unit: string;
  levels: number[];
  /** Moves pixels, so pixel-wise PSNR/SSIM against the original stop meaning image quality. */
  geometric?: boolean;
  apply: (im: Img, level: number) => Img | Promise<Img>;
};

const map = (im: Img, f: (v: number) => number) => {
  const out = clone(im);
  for (let p = 0; p < out.data.length; p++) if ((p & 3) !== 3) out.data[p] = f(out.data[p]);
  return out;
};

// Real JPEG round trip through the browser's own encoder.
async function jpeg(im: Img, quality: number): Promise<Img> {
  const canvas = new OffscreenCanvas(im.width, im.height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
  const bmp = await createImageBitmap(await canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 }));
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, im.width, im.height);
  return { width: d.width, height: d.height, data: d.data };
}

function blur(im: Img, sigma: number): Img {
  const r = Math.ceil(sigma * 3), k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  const pass = (src: Img, dx: number, dy: number) => {
    const out = clone(src), { width: w, height: h } = src;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let i = -r; i <= r; i++) {
            const xx = Math.min(Math.max(x + i * dx, 0), w - 1), yy = Math.min(Math.max(y + i * dy, 0), h - 1);
            s += src.data[(yy * w + xx) * 4 + c] * k[i + r];
          }
          out.data[(y * w + x) * 4 + c] = s / sum;
        }
    return out;
  };
  return pass(pass(im, 1, 0), 0, 1);
}

function rotate(im: Img, deg: number): Img {
  const out = clone(im), { width: w, height: h } = im, a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = cos * (x - cx) + sin * (y - cy) + cx, sy = -sin * (x - cx) + cos * (y - cy) + cy;
      for (let c = 0; c < 3; c++) out.data[(y * w + x) * 4 + c] = bilinear(im, sx, sy, c);
    }
  return out;
}

function cropCenter(im: Img, keep: number): Img {
  const cw = Math.round(im.width * keep), ch = Math.round(im.height * keep);
  const ox = (im.width - cw) >> 1, oy = (im.height - ch) >> 1;
  const out: Img = { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
  for (let y = 0; y < ch; y++) out.data.set(im.data.subarray(((y + oy) * im.width + ox) * 4, ((y + oy) * im.width + ox + cw) * 4), y * cw * 4);
  return resize(out, im.width, im.height);
}

export const ATTACKS: Attack[] = [
  { id: "none", name: "No attack", unit: "", levels: [0], apply: (im) => im },
  { id: "jpeg", name: "JPEG compression", unit: "quality", levels: [90, 75, 50, 30], apply: jpeg },
  { id: "resize", name: "Downscale + upscale", unit: "scale", levels: [0.75, 0.5, 0.25], apply: (im, s) => resize(resize(im, Math.round(im.width * s), Math.round(im.height * s)), im.width, im.height) },
  { id: "crop", name: "Center crop + resize", unit: "kept", levels: [0.95, 0.9, 0.75], geometric: true, apply: cropCenter },
  { id: "blur", name: "Gaussian blur", unit: "σ", levels: [0.5, 1, 2], apply: blur },
  { id: "noise", name: "Gaussian noise", unit: "σ", levels: [5, 10, 20], apply: (im, s) => { const r = rng(42); return map(im, (v) => v + s * gaussian(r)); } },
  { id: "brightness", name: "Brightness", unit: "×", levels: [0.7, 1.15, 1.3], apply: (im, f) => map(im, (v) => v * f) },
  { id: "rotate", name: "Rotation", unit: "°", levels: [1, 5, 15], geometric: true, apply: rotate },
];
