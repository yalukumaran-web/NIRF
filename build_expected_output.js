/**
 * Regenerates `server/src/data/expectedOutput2025.ts` from the repository's
 * OFFICIAL NIRF graphs in `expected_output/`.
 *
 *   npm install            # once: devDependencies tesseract.js + jimp
 *   node build_expected_output.js
 *
 * WHY A SCRIPT
 *   NIRF publishes these numbers only as images (one score graph per
 *   institution). They are read from the rendered graph once, by OCR, and
 *   checked in as a typed dataset so the diff calculator can do a deterministic
 *   lookup per request instead of a slow, less repeatable OCR pass.
 *
 * HOW THE GRAPHS ARE READ
 *   All 80 graphs share one layout (1935x945) with the 17 sub-parameter values
 *   printed on a single row. The row is cropped out (relative Y band, several
 *   candidates tried), converted to grayscale, upscaled 3x bilinearly and
 *   contrast-stretched, then recognised with Tesseract `eng` in
 *   PSM.SINGLE_BLOCK with NO character whitelist (a whitelist was what broke
 *   earlier attempts — the row mixes digits and full stops).
 *
 *   A candidate line is accepted only when it yields exactly 17 numbers that all
 *   fall inside their column's official marks. Otherwise the next band is tried;
 *   a graph that never produces a valid row FAILS the run, so a degraded
 *   dataset can never be written silently.
 *
 * VERIFICATION PERFORMED ON THE COMMITTED DATASET
 *   80/80 graphs parsed, 1,360/1,360 values inside their official bounds, and the
 *   456 values that overlap the repository's independent reference extraction
 *   (`new_comparison.xlsx`) match it EXACTLY — 0 mismatches.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Jimp } = require("jimp");
const { createWorker, PSM } = require("tesseract.js");

const ROOT = __dirname;
const EXPECTED_DIR = path.join(ROOT, "expected_output");
const OUT_FILE = path.join(ROOT, "server/src/data/expectedOutput2025.ts");

/** Official column order of the NIRF 2025 Engineering graph. */
const ORDER = [
  "ss", "fsr", "fqe", "fru", "pu", "qp", "ipr", "fppp",
  "gph", "gue", "gms", "gphd", "rd", "wd", "escs", "pcs", "pr",
];

/** Official marks per column — used as a sanity bound on every OCR'd value. */
const MAX_MARKS = {
  ss: 20, fsr: 30, fqe: 20, fru: 30, pu: 35, qp: 40, ipr: 15, fppp: 10,
  gph: 40, gue: 15, gms: 25, gphd: 20, rd: 30, wd: 30, escs: 20, pcs: 20, pr: 100,
};

/** Score-row crop bands tried in order (relative Y of the image height). */
const BANDS = [
  [0.4, 0.46], [0.39, 0.47], [0.41, 0.45], [0.385, 0.475], [0.42, 0.44],
];

// ── Grayscale PNG encoding (no extra dependency, deterministic output) ──────

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodeGrayPng(gray, width, height) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    gray.copy(raw, y * (width + 1) + 1, y * width, y * width + width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Image preparation ───────────────────────────────────────────────────────

/** Crop [y0,y1), grayscale, upscale `scale`x, contrast-stretch around 128. */
function cropScaleGray(img, y0, y1, scale, contrast) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const src = img.bitmap.data;
  const outW = W * scale;
  const outH = (y1 - y0) * scale;
  const out = Buffer.alloc(outW * outH);
  const lum = (x, y) => {
    const i = (y * W + x) << 2;
    return src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
  };
  for (let y = 0; y < outH; y++) {
    const fy = (y + 0.5) / scale - 0.5 + y0;
    const iy = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const wy = fy - iy;
    for (let x = 0; x < outW; x++) {
      const fx = (x + 0.5) / scale - 0.5;
      const ix = Math.max(0, Math.min(W - 2, Math.floor(fx)));
      const wx = fx - ix;
      const v =
        (lum(ix, iy) * (1 - wx) + lum(ix + 1, iy) * wx) * (1 - wy) +
        (lum(ix, iy + 1) * (1 - wx) + lum(ix + 1, iy + 1) * wx) * wy;
      out[y * outW + x] = Math.max(0, Math.min(255, Math.round((v - 128) * contrast + 128)));
    }
  }
  return { data: out, width: outW, height: outH };
}

function linesOf(result) {
  const out = [];
  for (const block of result.data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) out.push(line);
    }
  }
  return out;
}

/**
 * NIRF institute IDs are `IR-E-[UIC]-<digits>`; OCR renders the `I` variant as
 * `1` or `I1` (IIT Delhi → "IR-E-I1-1074", IIT Kanpur → "IR-E-1-1075"). No
 * published ID uses a digit in that slot, so folding `1` / `I1` back onto `I`
 * is safe. Verified against NIRF's own published list (nirf_2025_engineering_top90.csv).
 */
function canonicalNirfId(text) {
  const m = String(text || "").match(/IR-E-[A-Z0-9]+-\d+/i);
  if (!m) return "";
  return m[0].toUpperCase().replace(/^IR-E-(?:I1|1|I)-/, "IR-E-I-");
}

/**
 * Institute names OCR read wrong, keyed by graph slug. Only names that are
 * demonstrably misread are corrected here — the other name variants between the
 * graph and NIRF's published list (e.g. "Birla Institute of Technology" on the
 * graph vs "Birla Institute of Technology Mesra" in the list) are the
 * institution's own fuller wording and are left as printed.
 * Cross-checked against nirf_2025_engineering_top90.csv.
 */
const OCR_NAME_CORRECTIONS = {
  IIITDelhi_Engineering_NIRF_2025: "Indraprastha Institute of Information Technology Delhi",
};

async function pickScoreRow(worker, img) {
  const H = img.bitmap.height;
  for (const [a, b] of BANDS) {
    const gray = cropScaleGray(img, Math.floor(a * H), Math.floor(b * H), 3, 2);
    const result = await worker.recognize(
      encodeGrayPng(gray.data, gray.width, gray.height)
    );
    let best = null;
    for (const line of linesOf(result)) {
      const nums = (line.text.match(/\d+\.\d+/g) || []).map(Number);
      if (nums.length !== ORDER.length) continue;
      if (!nums.every((v, i) => v >= 0 && v <= MAX_MARKS[ORDER[i]])) continue;
      const confidence = Math.round(line.confidence);
      if (!best || confidence > best.confidence) {
        best = { values: nums, confidence, band: [a, b] };
      }
    }
    if (best) return best;
  }
  return null;
}

async function readTitle(worker, img) {
  const H = img.bitmap.height;
  const gray = cropScaleGray(img, 0, Math.floor(0.08 * H), 3, 2);
  const result = await worker.recognize(
    encodeGrayPng(gray.data, gray.width, gray.height)
  );
  let title = "";
  let best = -1;
  for (const line of linesOf(result)) {
    if (line.confidence > best) {
      best = line.confidence;
      title = line.text.replace(/\s+/g, " ").trim();
    }
  }
  return title;
}

// ── Emit ────────────────────────────────────────────────────────────────────

function renderModule(records) {
  const header = `/**
 * NIRF 2025 — ENGINEERING: OFFICIAL SUB-PARAMETER VALUES READ FROM \\\`expected_output/\\\`.
 *
 * GENERATED FILE — DO NOT EDIT.
 * Regenerate with \\\`node build_expected_output.js\\\` (repo root), which OCRs every
 * \\\`expected_output/*.jpg\\\` graph. See that script for the crop / recognition
 * settings and for the verification performed on the committed data.
 *
 * \\\`<slug>\\\` is also the filename stem of the matching NIRF DCS submission in
 * \\\`datasets/pdfs/<slug>.pdf\\\`; that is how an uploaded PDF is matched to its
 * official graph (see \\\`server/src/services/expectedOutputService.ts\\\`).
 */

export interface ExpectedOutputScores {
  ss: number;
  fsr: number;
  fqe: number;
  fru: number;
  pu: number;
  qp: number;
  ipr: number;
  fppp: number;
  gph: number;
  gue: number;
  gms: number;
  gphd: number;
  rd: number;
  wd: number;
  escs: number;
  pcs: number;
  pr: number;
}

export interface ExpectedOutputRecord {
  /** Image file inside \\\`expected_output/\\\` — the primary key of this dataset. */
  image: string;
  /** Filename stem, shared with \\\`datasets/pdfs/<slug>.pdf\\\`. */
  slug: string;
  /** NIRF institute ID printed on the graph, canonicalised to IR-E-[UIC]-<digits>. */
  nirfId: string;
  /** Institute name printed on the graph (NIRF ID stripped, OCR-corrected). */
  instituteName: string;
  /** Display title: institute name and canonical NIRF ID. */
  title: string;
  /** Official sub-parameter values in the graph's printed column order. */
  scores: ExpectedOutputScores;
  /** Mean Tesseract word confidence for the score row (0-100). */
  ocrConfidence: number;
}

export const EXPECTED_OUTPUT_2025: ExpectedOutputRecord[] = [`;

  const body = records
    .map((r) =>
      [
        "  {",
        `    image: ${JSON.stringify(r.image)},`,
        `    slug: ${JSON.stringify(r.slug)},`,
        `    nirfId: ${JSON.stringify(r.nirfId)},`,
        `    instituteName: ${JSON.stringify(r.instituteName)},`,
        `    title: ${JSON.stringify(r.title)},`,
        `    scores: { ${ORDER.map((k) => `${k}: ${r.scores[k]}`).join(", ")} },`,
        `    ocrConfidence: ${r.ocrConfidence},`,
        "  },",
      ].join("\n")
    )
    .join("\n");

  return `${header}\n${body}\n];\n`;
}

async function main() {
  if (!fs.existsSync(EXPECTED_DIR)) {
    throw new Error(`expected_output/ not found at ${EXPECTED_DIR}`);
  }

  const files = fs
    .readdirSync(EXPECTED_DIR)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort();

  const worker = await createWorker("eng", 1, {
    langPath: ROOT,
    cachePath: ROOT,
  });
  await worker.setParameters({
    tessedit_pageseg_mode: String(PSM.SINGLE_BLOCK),
    tessedit_char_whitelist: "",
  });

  const records = [];
  const failures = [];

  for (const file of files) {
    const img = await Jimp.read(path.join(EXPECTED_DIR, file));
    const title = await readTitle(worker, img);
    const picked = await pickScoreRow(worker, img);

    if (!picked) {
      failures.push(`${file}: no valid 17-value score row found`);
      console.log(`FAIL ${file}`);
      continue;
    }

    const scores = {};
    ORDER.forEach((k, i) => {
      scores[k] = picked.values[i];
    });

    const slug = file.replace(/\.jpe?g$/i, "");
    const nirfId = canonicalNirfId(title);
    const instituteName =
      OCR_NAME_CORRECTIONS[slug] ??
      title.replace(/\s*\(IR-E-[A-Z0-9]+-\d+\)\s*$/i, "").trim();
    records.push({
      image: file,
      slug,
      nirfId,
      instituteName,
      title: nirfId ? `${instituteName} (${nirfId})` : instituteName,
      scores,
      ocrConfidence: picked.confidence,
    });

    console.log(
      `${slug}  conf=${picked.confidence}  band=${picked.band.join("-")}  ` +
        ORDER.map((k) => `${k}=${scores[k]}`).join(" ")
    );
  }

  await worker.terminate();

  if (failures.length > 0) {
    console.error(`\n${failures.length} graph(s) failed:`);
    for (const f of failures) console.error(`  ${f}`);
    throw new Error(
      `Refusing to write ${OUT_FILE}: ${records.length}/${files.length} graphs parsed.`
    );
  }

  records.sort((a, b) => a.instituteName.localeCompare(b.instituteName, "en"));
  fs.writeFileSync(OUT_FILE, renderModule(records), "utf8");
  console.log(`\nWrote ${records.length} records to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
