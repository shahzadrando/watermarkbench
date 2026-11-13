"use client";

import { useState } from "react";
import { Group, Report, inspect } from "@/lib/inspect";

type Item = { name: string; size: number; report?: Report; error?: string };
const MAX_FILES = 10, MAX_BYTES = 50 * 1024 * 1024;
const GROUPS: Group[] = ["AI provenance", "Generator", "Camera & device", "Privacy", "Other"];
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default function Inspector() {
  const [items, setItems] = useState<Item[]>([]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, MAX_FILES);
    setItems(
      await Promise.all(
        picked.map(async (f): Promise<Item> => {
          if (f.size > MAX_BYTES) return { name: f.name, size: f.size, error: "Larger than 50 MB, skipped" };
          try {
            return { name: f.name, size: f.size, report: await inspect(new Uint8Array(await f.arrayBuffer())) };
          } catch {
            return { name: f.name, size: f.size, error: "Could not read this file" };
          }
        }),
      ),
    );
  }

  const card = "rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";

  return (
    <>
      <section className={card}>
        <h2 className="mb-2 text-lg font-medium">Metadata inspector</h2>
        <p className="mb-4 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Shows which AI-provenance labels (C2PA Content Credentials, IPTC digital source type, generator tags) and privacy-sensitive fields an image carries.
          Read-only: files are parsed in your browser and never changed or uploaded. To study label survival, load an original together with a copy that went through
          a messaging app, a screenshot or a social platform.
        </p>
        <label className="inline-block cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
          Choose images
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
        </label>
        <span className="ml-3 text-sm text-neutral-500">Up to {MAX_FILES} files, JPEG / PNG / WebP fully parsed; other formats best effort</span>
      </section>

      {items.map((it, idx) => (
        <section key={`${it.name}${idx}`} className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium break-all">{it.name}</h3>
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              {it.report?.format} · {kb(it.size)}
              {it.report && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${it.report.aiLabelled ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                  {it.report.aiLabelled ? "AI-labelled" : "No AI labels found"}
                </span>
              )}
            </div>
          </div>
          {it.error && <p className="text-sm text-red-600" role="alert">{it.error}</p>}
          {it.report && !it.report.findings.length && <p className="text-sm text-neutral-500">No metadata found. The file may have been re-encoded, which drops metadata.</p>}
          {it.report && it.report.findings.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <tbody>
                  {GROUPS.flatMap((g) =>
                    it.report!.findings.filter((f) => f.group === g).map((f, i) => (
                      <tr key={`${g}${i}`} className="border-t border-neutral-100 align-top dark:border-neutral-800">
                        <td className="w-36 py-2 pr-3 text-neutral-500">{i === 0 ? g : ""}</td>
                        <td className="w-56 py-2 pr-3 font-medium">
                          {f.label}
                          {f.ai && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">AI</span>}
                        </td>
                        <td className="py-2 break-all text-neutral-700 dark:text-neutral-300">{f.value}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
          {it.report && !it.report.aiLabelled && it.report.findings.length > 0 && (
            <p className="mt-3 text-xs text-neutral-500">No AI label doesn&apos;t mean not AI-generated: metadata is lost on re-encoding, which is why invisible watermarks exist.</p>
          )}
        </section>
      ))}
    </>
  );
}
