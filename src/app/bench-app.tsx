"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ATTACKS } from "@/lib/attacks";
import { DETECT_THRESHOLD, Row, runBench, toCsv } from "@/lib/bench";
import { Img } from "@/lib/img";
import { syntheticImage } from "@/lib/samples";
import { SCHEMES } from "@/lib/schemes";

type Sample = { name: string; img: Img; url: string };
const COLORS: Record<string, string> = { lsb: "#d97706", "dct-qim": "#2563eb", "dct-ss": "#059669" };
const MAX_SIDE = 512, MAX_FILES = 20;

function toUrl(img: Img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c.toDataURL();
}

async function fileToImg(file: File): Promise<Img> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  if (w < 64 || h < 64) throw new Error(`${file.name} is too small (min 64×64)`);
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const levelLabel = (attackId: string, level: number) => {
  const a = ATTACKS.find((x) => x.id === attackId)!;
  return a.id === "none" ? "none" : `${level}${a.unit.length <= 1 ? a.unit : " " + a.unit}`;
};

export default function BenchApp() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [schemes, setSchemes] = useState(SCHEMES.map((s) => s.id));
  const [attacks, setAttacks] = useState(ATTACKS.map((a) => a.id));
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [chartAttack, setChartAttack] = useState("jpeg");
  const running = progress !== null && progress[0] < progress[1];

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function onFiles(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    try {
      const picked = Array.from(files).slice(0, MAX_FILES);
      const imgs = await Promise.all(picked.map(fileToImg));
      setSamples(imgs.map((img, i) => ({ name: picked[i].name, img, url: toUrl(img) })));
      if (files.length > MAX_FILES) setError(`Only the first ${MAX_FILES} images were loaded.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read one of the images.");
    }
  }

  function useSynthetic() {
    setError("");
    setSamples([1, 2, 3, 4].map((seed) => { const img = syntheticImage(seed); return { name: `synthetic-${seed}`, img, url: toUrl(img) }; }));
  }

  async function run() {
    setRows([]);
    setError("");
    try {
      const res = await runBench(samples, SCHEMES.filter((s) => schemes.includes(s.id)), ATTACKS.filter((a) => attacks.includes(a.id)), (d, t) => setProgress([d, t]));
      setRows(res);
      if (!attacks.includes(chartAttack)) setChartAttack(attacks.find((a) => a !== "none") ?? "none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Benchmark failed.");
      setProgress(null);
    }
  }

  function downloadCsv() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    a.download = "watermarkbench-results.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Aggregate across images: one cell per scheme × attack level.
  const agg = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.scheme}|${r.attack}|${r.level}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([k, rs]) => {
      const [scheme, attack, level] = k.split("|");
      return { scheme, attack, level: +level, detectRate: mean(rs.map((r) => +r.detected)), bitAcc: mean(rs.map((r) => r.bitAcc)), psnr: mean(rs.map((r) => r.psnr)), ssim: mean(rs.map((r) => r.ssim)) };
    });
  }, [rows]);

  const usedSchemes = SCHEMES.filter((s) => agg.some((a) => a.scheme === s.id));
  const levels = ATTACKS.flatMap((a) => a.levels.map((level) => ({ attack: a.id, level }))).filter((l) => agg.some((a) => a.attack === l.attack && a.level === l.level));
  const cell = (scheme: string, attack: string, level: number) => agg.find((a) => a.scheme === scheme && a.attack === attack && a.level === level);
  const lineData = ATTACKS.find((a) => a.id === chartAttack)?.levels.map((level) => ({
    level: levelLabel(chartAttack, level),
    ...Object.fromEntries(usedSchemes.map((s) => [s.id, cell(s.id, chartAttack, level)?.bitAcc])),
  }));

  const card = "rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm transition ${on ? "border-blue-600 bg-blue-600 text-white" : "border-neutral-300 text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"}`;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">WatermarkBench</h1>
        <p className="max-w-3xl text-neutral-600 dark:text-neutral-400">
          Measure how well invisible image watermarks survive everyday edits. The app embeds its own test watermark, applies each attack,
          and reports whether the watermark is still detected and how much the image quality dropped. Everything runs in your browser; no image leaves your device.
        </p>
        <p className="text-sm text-neutral-500">Research and educational use. Only the open schemes implemented here are tested, and attacked images are never offered for download.</p>
      </header>

      <section className={card}>
        <h2 className="mb-3 text-lg font-medium">1. Images</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
            Upload images
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          </label>
          <button onClick={useSynthetic} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-500 dark:border-neutral-700">
            Use 4 synthetic samples
          </button>
          <span className="text-sm text-neutral-500">{samples.length ? `${samples.length} loaded (scaled to ≤${MAX_SIDE}px)` : `Up to ${MAX_FILES} images`}</span>
        </div>
        {samples.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {samples.map((s) => (
              <Image key={s.name} src={s.url} alt={s.name} title={s.name} width={64} height={64} unoptimized className="h-16 w-16 rounded-md object-cover" />
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-medium">2. Watermark schemes</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SCHEMES.map((s) => (
            <label key={s.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${schemes.includes(s.id) ? "border-blue-600" : "border-neutral-200 dark:border-neutral-800"}`}>
              <input type="checkbox" checked={schemes.includes(s.id)} onChange={() => toggle(schemes, setSchemes, s.id)} className="mt-1" />
              <span>
                <span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[s.id] }} />{s.name}</span>
                <span className="text-sm text-neutral-500">{s.description}</span>
              </span>
            </label>
          ))}
        </div>
        <h2 className="mb-3 mt-6 text-lg font-medium">3. Attacks</h2>
        <div className="flex flex-wrap gap-2">
          {ATTACKS.map((a) => (
            <button key={a.id} onClick={() => toggle(attacks, setAttacks, a.id)} className={chip(attacks.includes(a.id))} aria-pressed={attacks.includes(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={run}
            disabled={running || !samples.length || !schemes.length || !attacks.length}
            className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running…" : "Run benchmark"}
          </button>
          {progress && (
            <div className="flex min-w-48 flex-1 items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={progress[0]} aria-valuemax={progress[1]}>
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${(100 * progress[0]) / progress[1]}%` }} />
              </div>
              <span className="text-sm tabular-nums text-neutral-500">{progress[0]}/{progress[1]}</span>
            </div>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      </section>

      {rows.length > 0 && !running && (
        <>
          <section className={card}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Detection rate after each attack</h2>
              <button onClick={downloadCsv} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-500 dark:border-neutral-700">Export CSV</button>
            </div>
            <p className="mb-4 text-sm text-neutral-500">Share of images where ≥{DETECT_THRESHOLD * 100}% of the 32 payload bits were recovered. Mean bit accuracy and PSNR (dB, vs. the original) underneath.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-neutral-500">Attack</th>
                    {usedSchemes.map((s) => <th key={s.id} className="font-medium">{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {levels.map(({ attack, level }) => (
                    <tr key={`${attack}${level}`}>
                      <td className="whitespace-nowrap pr-2 text-neutral-600 dark:text-neutral-400">{ATTACKS.find((a) => a.id === attack)!.name} <span className="text-neutral-400">{attack !== "none" && levelLabel(attack, level)}</span></td>
                      {usedSchemes.map((s) => {
                        const c = cell(s.id, attack, level)!;
                        return (
                          <td key={s.id} className="rounded-md px-2 py-1.5 text-center" style={{ background: `hsl(${c.detectRate * 130} 70% 45% / 0.22)` }}>
                            <div className="font-semibold tabular-nums">{Math.round(c.detectRate * 100)}%</div>
                            <div className="text-xs tabular-nums text-neutral-500">{(c.bitAcc * 100).toFixed(0)}% bits · {c.psnr.toFixed(1)} dB</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium">Bit accuracy vs. attack strength</h2>
                <select value={chartAttack} onChange={(e) => setChartAttack(e.target.value)} className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700" aria-label="Attack to chart">
                  {ATTACKS.filter((a) => attacks.includes(a.id) && a.id !== "none").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeOpacity={0.15} />
                  <XAxis dataKey="level" fontSize={12} />
                  <YAxis domain={[0.3, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={12} />
                  <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
                  <Legend />
                  <ReferenceLine y={DETECT_THRESHOLD} strokeDasharray="4 4" label={{ value: "detect", fontSize: 11, position: "insideBottomRight" }} />
                  {usedSchemes.map((s) => <Line key={s.id} dataKey={s.id} name={s.name} stroke={COLORS[s.id]} strokeWidth={2} dot />)}
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section className={card}>
              <h2 className="mb-3 text-lg font-medium">Robustness vs. quality cost</h2>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeOpacity={0.15} />
                  <XAxis type="number" dataKey="psnr" name="PSNR" unit=" dB" domain={["auto", "auto"]} fontSize={12} />
                  <YAxis type="number" dataKey="bitAcc" name="Bit accuracy" domain={[0.3, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={12} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => (n === "Bit accuracy" ? `${(Number(v) * 100).toFixed(1)}%` : `${Number(v).toFixed(1)} dB`)} />
                  <Legend />
                  <ReferenceLine y={DETECT_THRESHOLD} strokeDasharray="4 4" />
                  {usedSchemes.map((s) => <Scatter key={s.id} name={s.name} data={agg.filter((a) => a.scheme === s.id && a.attack !== "none")} fill={COLORS[s.id]} />)}
                </ScatterChart>
              </ResponsiveContainer>
              <p className="mt-2 text-sm text-neutral-500">Each dot is one attack level. A dot below the dashed line at high PSNR means the watermark was lost with little visible damage, which is the weakness to report.</p>
            </section>
          </div>
        </>
      )}

      <footer className="pt-4 text-sm text-neutral-500">
        Open source · MIT · <a className="underline" href="https://github.com/shahzadrando/watermarkbench">GitHub</a>
      </footer>
    </main>
  );
}
