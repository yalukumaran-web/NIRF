/*
 * Independent re-read of single score-graph cells.
 *
 * audit_ocr.py flags sub-scores that sit far below their column's distribution as
 * possible 100x under-reads -- the failure mode the main OCR pass cannot see,
 * because its decimal-point repair only ever fires on a value ABOVE the column
 * maximum. Consistency across years is suggestive but not proof.
 *
 * So this re-reads the whole score row from a different rendering path, at
 * several scales and contrast settings, and reports every distinct value it
 * gets for the column of interest. Deliberately does not reuse ocr_graphs.js's
 * helpers: agreeing with an independent implementation is the point.
 *
 * Usage:  node audit_cell.js 2023 IR-E-U-0391 escs 2024 IR-E-U-0391 escs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Jimp } = require("jimp");
const { createWorker, PSM } = require("tesseract.js");

const ROOT = path.dirname(__dirname);
const DATA = path.join(ROOT, "data");

const ORDER = ["ss", "fsr", "fqe", "fru", "pu", "qp", "ipr", "fppp",
               "gph", "gue", "gms", "gphd", "rd", "wd", "escs", "pcs", "pr"];
const N = ORDER.length;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodeGrayPng(gray, width, height) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    Buffer.from(gray.buffer, y * width, width).copy(raw, y * (width + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Bilinear crop + upscale + contrast, as a grayscale buffer. */
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

function numericTokens(line) {
  const out = [];
  for (const w of line.words || []) {
    const parts = String(w.text).split(/[,\s]+/);
    for (const p of parts) {
      const m = /^[|]?(\d{1,4})(\.\d{1,2})?[|]?$/.exec(p.replace(/[^0-9.|]/g, ""));
      if (!m) continue;
      const raw = Number(m[1] + (m[2] || ""));
      if (!Number.isFinite(raw)) continue;
      out.push({ raw, hasDot: !!m[2], text: p.trim() });
    }
  }
  return out;
}

const SETTINGS = [
  [3, 2], [4, 1.5], [4, 2.5], [5, 2], [6, 2],
];

/** Every distinct value found for column `col`, re-read independently.
 *
 *  Two phases, because a blind sweep over every band at every setting costs
 *  thousands of OCR calls per graph. Phase 1 finds WHERE the full-width numeric
 *  row sits; phase 2 hammers only that band at several scales and contrasts.
 */
async function reread(worker, img, col) {
  const H = img.bitmap.height;

  const scanBand = async (y0, y1, scale, contrast) => {
    const g = cropScaleGray(img, y0, y1, scale, contrast);
    const res = await worker.recognize(
      encodeGrayPng(g.data, g.width, g.height));
    const hits = [];
    for (const line of res.data.lines || []) {
      const toks = numericTokens(line);
      if (toks.length !== N) continue;
      hits.push({ y0, y1, labelled: /\bScore\b/i.test(line.text),
                  value: toks[col].raw, text: line.text });
    }
    return hits;
  };

  // phase 1 -- find every full-width numeric row, then choose the score row.
  // Must not stop early: the "Total" row (the printed maxima) sits above the
  // score row and is otherwise picked up by mistake.
  const rows = [];
  for (const bh of [0.10, 0.07]) {
    const step = bh > 0.08 ? 0.05 : 0.02;
    for (let a = 0.05; a < 0.95; a += step) {
      const y0 = Math.floor(a * H);
      const y1 = Math.min(H, y0 + Math.max(2, Math.floor(bh * H)));
      rows.push(...(await scanBand(y0, y1, 3, 2)));
    }
  }
  if (process.env.DUMP_ROWS) {
    console.log("  all full-width numeric rows found:");
    for (const h of rows) {
      console.log("    y=%d..%d %s  %s", h.y0, h.y1,
                  h.labelled ? "[Score]" : "[     ]", h.text.trim().slice(0, 90));
    }
  }
  const unique = [];
  for (const r of rows) {
    if (!unique.some((u) => u.y0 === r.y0 && u.y1 === r.y1)) unique.push(r);
  }
  const where =
    unique.find((h) => h.labelled) ||
    unique.find((h) => !/^\s*total\b/i.test(h.text)) ||
    null;
  if (!where) return new Map();

  // phase 2 -- re-read just that band, at every setting
  const readings = new Map();
  const half = Math.max(2, Math.floor((where.y1 - where.y0) * 0.7));
  for (const [scale, contrast] of SETTINGS) {
    for (const [y0, y1] of [
      [Math.max(0, where.y0 - half), Math.min(H, where.y1 + half)],
      [where.y0, where.y1],
    ]) {
      for (const hit of await scanBand(y0, y1, scale, contrast)) {
        const key = hit.value;
        readings.set(key, (readings.get(key) || 0) + 1);
      }
    }
  }
  return readings;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3 || args.length % 3 !== 0) {
    console.error("usage: node audit_cell.js <year> <iid> <col> [<year> <iid> <col> ...]");
    process.exit(1);
  }
  const targets = [];
  for (let i = 0; i < args.length; i += 3) {
    const col = ORDER.indexOf(args[i + 2].toLowerCase());
    if (col < 0) {
      console.error("unknown column: %s", args[i + 2]);
      process.exit(1);
    }
    targets.push({ year: +args[i], iid: args[i + 1], col, colName: args[i + 2] });
  }

  const worker = await createWorker(["eng"], 1, {
    logger: () => {},
    cachePath: path.join(ROOT, "harness", "out", ".tesscache"),
  });
  await worker.setParameters({
    // Must match ocr_graphs.js: SINGLE_LINE splits the wide score row into
    // fragments and the 17 values never land on one line.
    tessedit_pageseg_mode: String(PSM.SINGLE_BLOCK),
    tessedit_char_whitelist: "",
  });

  let mismatches = 0;
  for (const t of targets) {
    const sub = path.join(DATA, String(t.year), "subscores.csv");
    // CSV columns are institute_id followed by ORDER, so graph column i sits at i+1
    const recorded = fs.readFileSync(sub, "utf8").split(/\r?\n/)
      .map((l) => l.split(","))
      .find((f) => f[0] === t.iid)[t.col + 1];
    const dir = path.join(DATA, String(t.year), "graph");
    const files = fs.readdirSync(dir).filter((f) =>
      f.startsWith(t.iid) && /\.(png|jpe?g)$/i.test(f));
    if (!files.length) {
      console.log("%s %s %-5s  NO GRAPH FILE", t.year, t.iid, t.colName);
      continue;
    }
    const img = await Jimp.read(path.join(dir, files[0]));
    const readings = await reread(worker, img, t.col);
    const entries = [...readings.entries()].sort((a, b) => b[1] - a[1]);
    const best = entries.length ? entries[0][0] : null;
    const agree = best !== null && Number(recorded) === best;
    if (!agree) mismatches++;
    console.log(
      "%s %s %s recorded=%s  independent readings: %s   %s",
      t.year, t.iid.padEnd(12), t.colName.padEnd(5), String(recorded).padEnd(7),
      entries.map(([v, c]) => `${v}(x${c})`).join(" ") || "none",
      agree ? "AGREE" : "DISAGREE"
    );
  }
  await worker.terminate();
  console.log("\n%d of %d target cells disagree with the recorded value",
              mismatches, targets.length);
}

main().catch((e) => { console.error(e); process.exit(1); });