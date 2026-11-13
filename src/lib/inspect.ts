// Read-only metadata inspector: reports AI-provenance labels, generator info and privacy-sensitive fields. Never modifies files.

export type Group = "AI provenance" | "Generator" | "Camera & device" | "Privacy" | "Other";
export type Finding = { group: Group; label: string; value: string; ai: boolean };
export type Report = { format: string; findings: Finding[]; aiLabelled: boolean };

const AI_TOOL = /midjourney|dall[-·\s]?e|openai|chatgpt|stable[\s-]?diffusion|sdxl|firefly|imagen|gemini|flux|leonardo|comfyui|automatic1111|novelai|ideogram|runway|sora|veo|kling|grok|invokeai/i;
const AI_SOURCE = /(compositeWithTrainedAlgorithmicMedia|trainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)/;
// PNG text keys written by common image generators.
const AI_PNG_KEYS: Record<string, string> = {
  parameters: "Stable Diffusion WebUI parameters",
  prompt: "ComfyUI prompt graph",
  workflow: "ComfyUI workflow",
  Dream: "Dream prompt",
  "sd-metadata": "InvokeAI metadata",
  invokeai_metadata: "InvokeAI metadata",
};

const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

async function inflate(d: Uint8Array) {
  const s = new Blob([d.slice()]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function detectFormat(b: Uint8Array, text: string) {
  if (b[0] === 0xff && b[1] === 0xd8) return "JPEG";
  if (b[0] === 0x89 && text.slice(1, 4) === "PNG") return "PNG"; // byte check: "latin1" decodes as windows-1252, where 0x89 isn't U+0089
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "WebP";
  if (text.slice(4, 8) === "ftyp") return /avif/.test(text.slice(8, 32)) ? "AVIF" : "HEIC/MP4";
  if (text.startsWith("GIF8")) return "GIF";
  return "Unknown";
}

type Add = (group: Group, label: string, value: string, ai?: boolean) => void;

function exif(t: Uint8Array, add: Add) {
  try {
    const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const le = dv.getUint16(0) === 0x4949;
    const u16 = (o: number) => dv.getUint16(o, le), u32 = (o: number) => dv.getUint32(o, le);
    const ifd = (off: number) => {
      const m = new Map<number, number>();
      for (let k = 0, n = u16(off); k < n; k++) m.set(u16(off + 2 + k * 12), off + 2 + k * 12);
      return m;
    };
    const str = (e: number) => {
      const n = u32(e + 4), o = n <= 4 ? e + 8 : u32(e + 8);
      return latin1(t.subarray(o, o + n)).replace(/\0+$/, "").trim();
    };
    const read = (m: Map<number, number>, tags: [number, Group, string][]) => {
      for (const [tag, g, l] of tags) { const e = m.get(tag); if (e !== undefined) { const v = str(e); if (v) add(g, l, v); } }
    };
    const ifd0 = ifd(u32(4));
    read(ifd0, [[0x131, "Generator", "Software"], [0x10f, "Camera & device", "Make"], [0x110, "Camera & device", "Model"], [0x10e, "Other", "Image description"], [0x13b, "Privacy", "Artist"], [0x8298, "Other", "Copyright"]]);
    const exifPtr = ifd0.get(0x8769);
    if (exifPtr !== undefined) read(ifd(u32(exifPtr + 8)), [[0x9003, "Other", "Date taken"], [0xa430, "Privacy", "Camera owner"], [0xa431, "Privacy", "Camera serial number"], [0xa434, "Camera & device", "Lens"]]);
    if (ifd0.has(0x8825)) add("Privacy", "GPS location", "Present: exact coordinates are embedded");
  } catch {
    add("Other", "EXIF", "Present but malformed");
  }
}

function xmp(packet: string, add: Add) {
  const field = (name: string) => packet.match(new RegExp(`${name}(?:="|>)([^"<]+)`))?.[1]?.trim();
  const src = field("DigitalSourceType");
  if (src) add("AI provenance", "IPTC digital source type", src.split("/").pop()!, AI_SOURCE.test(src));
  const tool = field("CreatorTool");
  if (tool) add("Generator", "XMP creator tool", tool);
  if (!src && !tool) add("Other", "XMP", "Present");
}

async function png(b: Uint8Array, add: Add, onXmp: (s: string) => void) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 8; i + 8 <= b.length; ) {
    const n = dv.getUint32(i), type = latin1(b.subarray(i + 4, i + 8)), d = b.subarray(i + 8, i + 8 + n);
    if (type === "IEND") break;
    if (type === "eXIf") exif(d, add);
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const z = d.indexOf(0), key = latin1(d.subarray(0, z));
      let value: string;
      if (type === "tEXt") value = latin1(d.subarray(z + 1));
      else if (type === "zTXt") value = latin1(await inflate(d.subarray(z + 2)));
      else {
        const compressed = d[z + 1] === 1;
        let p = d.indexOf(0, z + 3); // end of language tag
        p = d.indexOf(0, p + 1); // end of translated keyword
        const raw = d.subarray(p + 1);
        value = utf8(compressed ? await inflate(raw) : raw);
      }
      if (key === "XML:com.adobe.xmp") onXmp(value);
      else if (key in AI_PNG_KEYS) add("Generator", AI_PNG_KEYS[key], value, true);
      else add(key === "Software" ? "Generator" : "Other", `PNG text: ${key}`, value);
    }
    i += 12 + n;
  }
}

function webp(b: Uint8Array, add: Add, onXmp: (s: string) => void) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 12; i + 8 <= b.length; ) {
    const type = latin1(b.subarray(i, i + 4)), n = dv.getUint32(i + 4, true), d = b.subarray(i + 8, i + 8 + n);
    if (type === "EXIF") exif(latin1(d.subarray(0, 6)) === "Exif\0\0" ? d.subarray(6) : d, add);
    if (type === "XMP ") onXmp(utf8(d));
    i += 8 + n + (n & 1);
  }
}

export async function inspect(bytes: Uint8Array): Promise<Report> {
  const text = latin1(bytes), format = detectFormat(bytes, text), findings: Finding[] = [];
  const add: Add = (group, label, value, ai = false) => findings.push({ group, label, value: value.length > 400 ? value.slice(0, 400) + "…" : value, ai });
  let sawXmp = false;
  const onXmp = (s: string) => { sawXmp = true; xmp(s, add); };

  if (format === "PNG") await png(bytes, add, onXmp);
  else if (format === "WebP") webp(bytes, add, onXmp);
  else {
    const e = text.indexOf("Exif\0\0");
    if (e >= 0 && e < 1 << 17) exif(bytes.subarray(e + 6), add);
  }

  // Uncompressed XMP packets look the same in every container.
  if (!sawXmp) {
    const s = text.indexOf("<x:xmpmeta"), end = text.indexOf("</x:xmpmeta>", s);
    if (s >= 0 && end > s) xmp(utf8(bytes.subarray(s, end + 12)), add);
  }

  // shortcut: C2PA is detected by its JUMBF labels, not cryptographically verified; use c2pa-js / c2patool to validate signatures.
  const c2pa = text.search(/c2pa\.(claim|actions|signature|assertions)/);
  if (c2pa >= 0) {
    add("AI provenance", "C2PA Content Credentials", "Manifest present (signature not verified)");
    const gen = text.match(/claim_generator[^\x20-\x7e]{1,4}([\x20-\x7e]{3,120})/)?.[1];
    if (gen) add("Generator", "C2PA claim generator", gen);
    const jumb = text.indexOf("jumb"), src = (jumb >= 0 ? text.slice(jumb) : "").match(AI_SOURCE)?.[1];
    if (src) add("AI provenance", "C2PA declared source", src, true);
  }

  for (const f of findings) if (f.group === "Generator" && AI_TOOL.test(f.value)) f.ai = true;
  return { format, findings, aiLabelled: findings.some((f) => f.ai) };
}
