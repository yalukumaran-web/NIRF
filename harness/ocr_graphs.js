/**
 * HARNESS STEP 1 -- read the PUBLISHED sub-parameter scores off the NIRF score
 * graphs.
 *
 * NIRF publishes per-sub-parameter marks only as a rendered graph image
 * (data/<year>/graph/<ID>.{png,jpg}); there is no machine-readable equivalent.
 * This OCRs them into data/<year>/subscores.csv.
 *
 * WHY THIS IS NOT build_expected_output.js
 *   That script hard-codes the 2025 layout (1935x945, a fixed Y band, fixed
 *   column order, fixed max marks). The 2023 graphs are a different size and a
 *   different file type (.png), so the layout is DISCOVERED here instead:
 *
 *     1. OCR overlapping horizontal bands top -> bottom.
 *     2. The label row  "SS FSR FQE FRU PU QP IPR FPPP GPH GUE GMS GPHD RD WD
 *        ESCS PCS PR"  gives the column order (fuzzy-matched, because OCR drops
 *        the leading "G" of GMS).
 *     3. The "Total" row gives that edition's max marks per column
 *        (20 30 20 30 35 40 15 10 40 15 25 20 30 30 20 20 100).
 *     4. The "Score" row gives the 17 published values, positionally.
 *
 * DECIMAL-POINT REPAIR (logged, never silent)
 *   Tesseract sometimes loses the decimal point ("9.21" -> "921"). A token is
 *   divided by 100 ONLY when the raw value exceeds its column max and the
 *   divided value does not. Every such repair is counted and written to
 *   harness/out/ocr_repairs.csv. Nothing else is altered.
 *
 * A graph that fails any step is written to harness/out/ocr_failures.csv and
 * excluded -- no value is ever invented.
 *
 * Usage:
 *   node harness/ocr_graphs.js --probe          # dump raw OCR of one graph/year
 *   node harness/ocr_graphs.js                  # write data/<year>/subscores.csv
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Jimp } = require("jimp");
const { createWorker, PSM } = require("tesseract.js");

const ROOT = path.dirname(__dirname);
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "harness", "out");
const YEARS = [2023, 2024, 2025];

/** Printed column order of the NIRF Engineering score graph (verified by OCR on
 *  all three editions -- see harness/out/graph_layouts.json). */
const ORDER = ["ss", "fsr", "fqe", "fru", "pu", "qp", "ipr", "fppp",
  "gph", "gue", "gms", "gphd", "rd", "wd", "escs", "pcs", "pr"];
const N = ORDER.length;

/** Relative Y bands, coarse -> fine. */
const BANDS = [];
for (let a = 0.05; a < 0.95; a += 0.05) BANDS.push([a, Math.min(1.0, a + 0.1)]);
for (let a = 0.10; a < 0.95; a += 0.02) BANDS.push([a, Math.min(1.0, a + 0.07)]);

// ── minimal deterministic grayscale PNG encoder (no extra dependency) ────────

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ byte) & 0xff];
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

/** Crop [y0,y1), grayscale, upscale `scale`x, contrast-stretch around 128. */
function cropScaleGray(img, y0, y1, scale, contrast) {
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  const src = img.bitmap.data;
  const outW = W * scale;
  const outH = Math.max(1, y1 - y0) * scale;
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

// ── line parsing ────────────────────────────────────────────────────────────

/** All numeric tokens of a line, in printed order, with their x positions. */
function numericTokens(line) {
  const out = [];
  for (const w of line.words || []) {
    // A word may hold "20.00" or a run like "14.00,27.15"; keep the digits.
    const parts = String(w.text).split(/[,\s]+/);
    for (const p of parts) {
      const m = /^[|]?(\d{1,4})(\.\d{1,2})?[|]?$/.exec(p.replace(/[^0-9.|]/g, ""));
      if (!m) continue;
      const raw = Number(m[1] + (m[2] || ""));
      if (!Number.isFinite(raw)) continue;
      out.push({ raw, hasDot: !!m[2], xc: (w.bbox.x0 + w.bbox.x1) / 2 });
    }
  }
  return out;
}

/** How well the OCR'd label row matches ORDER. Returns 0..17.
 *  The GMS column is reliably mis-OCR'd as "MS", so it is accepted explicitly. */
function fuzzyOrderAgreement(labelLineText) {
  const words = String(labelLineText).toUpperCase().replace(/[^A-Z]/g, " ").split(/\s+/).filter(Boolean);
  const want = ORDER.map((s) => s.toUpperCase());
  const fits = (w, t) => w === t || w.startsWith(t) || t.startsWith(w) || (w === "MS" && t === "GMS");
  let j = 0, hit = 0;
  for (const w of words) {
    while (j < N && !fits(w, want[j])) j++;
    if (j < N) { hit++; j++; }
  }
  return hit;
}

// ── graph reader ────────────────────────────────────────────────────────────

/** Max marks per column, read from the ONLY edition that prints them: the 2023
 *  graphs carry a "Total" row (20 30 20 30 35 40 15 10 40 15 25 20 30 30 20 20
 *  100). The 2024 and 2025 graphs omit that row, so these are reused -- see
 *  harness/out/graph_layouts.json for the per-year `max_marks_source` flag and
 *  section 3 of the report for why this is safe. */
const CANONICAL_MAX = { ss: 20, fsr: 30, fqe: 20, fru: 30, pu: 35, qp: 40, ipr: 15,
  fppp: 10, gph: 40, gue: 15, gms: 25, gphd: 20, rd: 30, wd: 30, escs: 20, pcs: 20, pr: 100 };

async function readGraph(worker, img) {
  const H = img.bitmap.height;
  let labelHit = 0;
  let score = null;
  let total = null;
  let nRepairs = 0;

  for (const [a, b] of BANDS) {
    const y0 = Math.floor(a * H);
    const y1 = Math.max(y0 + 1, Math.floor(b * H));
    const g = cropScaleGray(img, y0, y1, 3, 2);
    const res = await worker.recognize(encodeGrayPng(g.data, g.width, g.height));
    for (const line of linesOf(res)) {
      const txt = line.text;
      const isScore = /\bScore\b/i.test(txt);
      const isTotal = /\bTotal\b/i.test(txt);
      if (!isScore && !isTotal) {
        const h = fuzzyOrderAgreement(txt);
        if (h > labelHit) labelHit = h;
        continue;
      }
      const toks = numericTokens(line);
      if (toks.length !== N) continue;
      if (isScore && !score) score = toks;
      if (isTotal && !total) total = toks;
    }
    if (score && total) break;
    if (score && labelHit >= 15) break;   // 2024/2025: no Total row exists
  }

  if (!score) throw new Error("no 'Score' row with 17 values");
  if (labelHit < 15) throw new Error(`label row only matched ${labelHit}/17 columns`);

  const maxSource = total ? "printed_total_row" : "canonical_2023_total_row";
  const maxes = ORDER.map((k) => (total ? total[ORDER.indexOf(k)].raw : CANONICAL_MAX[k]));
  for (const m of maxes) if (!(m > 0)) throw new Error("bad max marks row");

  const values = score.map((t, i) => {
    let v = t.raw;
    if (v > maxes[i]) {           // decimal point lost -- see header comment
      const fixed = v / 100;
      if (fixed >= 0 && fixed <= maxes[i]) { v = fixed; nRepairs += 1; }
      else throw new Error(`value ${t.raw} out of range for column ${ORDER[i]} (max ${maxes[i]})`);
    }
    return Math.round(v * 100) / 100;
  });

  return { values, maxes, labelHit, nRepairs, maxSource };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const probe = process.argv.includes("--probe");

  const worker = await createWorker("eng", 1, { langPath: ROOT, cachePath: ROOT });
  await worker.setParameters({
    tessedit_pageseg_mode: String(PSM.SINGLE_BLOCK),
    tessedit_char_whitelist: "",
  });

  const failures = [];
  const repairs = [];
  const layouts = {};

  for (const year of YEARS) {
    const dir = path.join(DATA, String(year), "graph");
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

    if (probe) {
      const img = await Jimp.read(path.join(dir, files[0]));
      const H = img.bitmap.height;
      for (const [a, b] of [[0, 0.15], [0.15, 0.35], [0.35, 0.55], [0.55, 0.75], [0.75, 1]]) {
        const g = cropScaleGray(img, Math.floor(a * H), Math.max(1, Math.floor(b * H)), 3, 2);
        const r = await worker.recognize(encodeGrayPng(g.data, g.width, g.height));
        console.log(`--- ${year} ${files[0]} band ${a}-${b} ---`);
        for (const l of linesOf(r)) console.log(`   [${Math.round(l.confidence)}] ${l.text.trim()}`);
      }
      continue;
    }

    const body = [];
    let seenMaxes = null;
    let maxSource = null;
    let labelHits = [];
    let done = 0;
    for (const file of files) {
      const iid = path.basename(file).replace(/\.(png|jpe?g)$/i, "");
      try {
        const img = await Jimp.read(path.join(dir, file));
        const got = await readGraph(worker, img);
        if (!seenMaxes) { seenMaxes = got.maxes; maxSource = got.maxSource; }
        labelHits.push(got.labelHit);
        if (got.nRepairs) repairs.push([year, iid, got.nRepairs].join(","));
        body.push([iid, ...got.values].join(","));
        done += 1;
      } catch (e) {
        failures.push([year, iid, "ocr", String(e.message).replace(/,/g, ";")].join(","));
      }
      if (done % 25 === 0) console.log(`  ${year}: ${done}/${files.length}`);
    }

    const cols = ["institute_id", ...ORDER];
    fs.writeFileSync(
      path.join(DATA, String(year), "subscores.csv"),
      [cols.join(","), ...body].join("\n") + "\n", "utf8");
    layouts[year] = {
      max_marks: Object.fromEntries(ORDER.map((k, i) => [k, seenMaxes ? seenMaxes[i] : null])),
      max_marks_source: maxSource,
      graphs_read: body.length,
      graphs_total: files.length,
      mean_label_match: labelHits.length
        ? Math.round((labelHits.reduce((a, b) => a + b, 0) / labelHits.length) * 100) / 100
        : null,
    };
    console.log(`${year}: ${body.length}/${files.length} graphs read; max marks (${maxSource}) = ${seenMaxes}`);
  }

  if (!probe) {
    fs.writeFileSync(path.join(OUT, "ocr_failures.csv"),
      ["year,institute_id,kind,reason", ...failures].join("\n") + "\n", "utf8");
    fs.writeFileSync(path.join(OUT, "ocr_repairs.csv"),
      ["year,institute_id,n_values_decimal_repaired", ...repairs].join("\n") + "\n", "utf8");
    fs.writeFileSync(path.join(OUT, "graph_layouts.json"),
      JSON.stringify(layouts, null, 2), "utf8");
    console.log(`\nocr_failures.csv : ${failures.length} rows`);
    for (const f of failures.slice(0, 25)) console.log("   ", f);
    console.log(`ocr_repairs.csv  : ${repairs.length} rows`);
  }
  await worker.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });