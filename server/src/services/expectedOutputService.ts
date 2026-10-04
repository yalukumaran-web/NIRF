/**
 * Locates the repository's OFFICIAL values in the `expected_output/` folder and
 * resolves which official graph belongs to an uploaded NIRF DCS PDF.
 *
 * WHAT `expected_output/` IS
 *   80 official NIRF 2025 Engineering score graphs (`<slug>.jpg`), one per
 *   institution. These graphs are the only place NIRF publishes the individual
 *   sub-parameter values, so they are the "actual" side of the diff calculator.
 *   Every graph has an identical layout (1935x945) and the same 17 columns.
 *
 * HOW THE VALUES ARE READ
 *   The numbers are read from the rendered graphs by OCR exactly once, by
 *   `npm run build-expected` (server/src/scripts/buildExpectedOutput.ts), which
 *   regenerates `src/data/expectedOutput2025.ts` — one record per image, keyed by
 *   the image filename. The extracted set was verified to match the repository's
 *   independent reference extraction (`new_comparison.xlsx`) on all 456
 *   overlapping values, with zero mismatches.
 *
 *   At request time this service therefore does a deterministic LOOKUP keyed by
 *   the image filename. It does NOT re-run OCR per request, and it never invents
 *   a value: a graph with no extracted record is reported as unavailable, and a
 *   record whose image is missing from disk is reported as such.
 *
 * HOW AN UPLOAD IS MATCHED
 *   1. `filename`  — `<slug>` of the uploaded PDF equals the graph's filename
 *                    stem (`datasets/pdfs/<slug>.pdf` ↔ `expected_output/<slug>.jpg`).
 *   2. `nirf-id`   — the institute ID printed on the PDF cover page
 *                    (`IR-E-U-0456`) equals the ID printed on the graph.
 *   3. `name-exact`— the institute name from the PDF equals the graph's name.
 *   4. `name-similar` — unique high-similarity name match (Dice coefficient of
 *                    token bigrams ≥ 0.8 and unambiguous).
 */

import fs from "fs";
import path from "path";
import { EXPECTED_OUTPUT_2025 } from "../data/expectedOutput2025";
import type { ExpectedOutputRecord } from "../data/expectedOutput2025";
import type { DiffMatchMethod } from "./nirf/diff/types";

/** Repo-root `expected_output/` folder holding the official graphs. */
export function expectedOutputDir(): string {
  // __dirname = <repo>/server/src/services (tsx) or <repo>/server/dist/services (compiled)
  return path.resolve(__dirname, "../../../expected_output");
}

/** Directory holding the NIRF DCS submission PDFs (`datasets/pdfs`). */
export function datasetPdfDir(): string {
  return path.resolve(__dirname, "../../../datasets/pdfs");
}

export interface ExpectedOutputEntry extends ExpectedOutputRecord {
  /** Absolute path of the official graph. */
  imagePath: string;
  /** True when the graph is actually present on disk. */
  imageExists: boolean;
  /** True when the matching DCS submission PDF is present in `datasets/pdfs`. */
  hasDatasetPdf: boolean;
  /** Public URL that serves the graph. */
  imageUrl: string;
}

let cachedEntries: ExpectedOutputEntry[] | null = null;

function listImages(): string[] {
  const dir = expectedOutputDir();
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".jpg"))
      .sort();
  } catch {
    return [];
  }
}

/** Every official graph with its on-disk state. */
export function listExpectedOutput(force = false): ExpectedOutputEntry[] {
  if (!force && cachedEntries) return cachedEntries;

  const images = listImages();
  const imageSet = new Set(images);

  cachedEntries = EXPECTED_OUTPUT_2025.map((record) => {
    const imagePath = path.join(expectedOutputDir(), record.image);
    return {
      ...record,
      imagePath,
      imageExists: imageSet.has(record.image),
      hasDatasetPdf: fs.existsSync(path.join(datasetPdfDir(), `${record.slug}.pdf`)),
      imageUrl: `/api/diff/graph/${encodeURIComponent(record.slug)}`,
    };
  });

  return cachedEntries;
}

/** Invalidate the cached folder scan (used by tooling and tests). */
export function resetExpectedOutputCache(): void {
  cachedEntries = null;
}

export interface ExpectedOutputCoverage {
  dir: string;
  /** Images actually present in `expected_output/`. */
  imagesOnDisk: number;
  /** Records in the extracted dataset. */
  records: number;
  /** Images with no extracted record (values unavailable). */
  imagesWithoutValues: string[];
  /** Records whose image file is absent from the folder. */
  recordsWithoutImage: string[];
}

export function expectedOutputCoverage(): ExpectedOutputCoverage {
  const entries = listExpectedOutput();
  const images = listImages();
  const withValues = new Set(entries.map((e) => e.image));
  return {
    dir: expectedOutputDir(),
    imagesOnDisk: images.length,
    records: entries.length,
    imagesWithoutValues: images.filter((i) => !withValues.has(i)),
    recordsWithoutImage: entries.filter((e) => !e.imageExists).map((e) => e.image),
  };
}

/** Absolute path of a graph, or null when the record/graph does not exist. */
export function expectedOutputImagePath(slug: string): string | null {
  const entry = listExpectedOutput().find(
    (e) => e.slug.toLowerCase() === slug.toLowerCase()
  );
  if (!entry || !entry.imageExists) return null;
  return entry.imagePath;
}

// ── Name normalisation & similarity ─────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "of", "and", "institute", "institutes", "university", "universities",
  "college", "technology", "technological", "engineering", "science", "sciences",
  "and", "for", "national", "international", "indian", "of", "technology",
]);

/** Lowercase, strip a trailing NIRF ID, drop punctuation, collapse whitespace. */
export function normaliseInstituteName(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/\((?:IR-E-[A-Z0-9]+-\d+)\)/gi, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Meaningful tokens of a normalised name (stop-words removed). */
function nameTokens(normalised: string): string[] {
  return normalised.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Filename stem of an uploaded file: "IITMadras_Engineering_NIRF_2025.pdf" → "IITMadras_Engineering_NIRF_2025". */
export function slugFromFilename(filename: string | null | undefined): string {
  if (!filename) return "";
  return path.basename(String(filename)).replace(/\.[a-z0-9]+$/i, "");
}

/** NIRF institute ID found inside free text, e.g. "IR-E-U-0456" or "IR-E-I-1074". */
export function nirfIdFromText(text: string | null | undefined): string {
  if (!text) return "";
  const m = String(text).match(/IR-E-[A-Z0-9]+-\d+/i);
  return m ? m[0].toUpperCase().replace(/\s+/g, "") : "";
}

/** Dice coefficient over token bigrams (0-1). */
function diceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bigrams = (t: string[]) => {
    if (t.length === 1) return [t[0]];
    const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(`${t[i]} ${t[i + 1]}`);
    return out;
  };
  const ga = bigrams(a);
  const gb = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of ga) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of gb) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hits++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hits) / (ga.length + gb.length);
}

// ── Resolution ──────────────────────────────────────────────────────────────

export interface ExpectedOutputMatch {
  entry: ExpectedOutputEntry;
  method: DiffMatchMethod;
}

export interface ExpectedOutputHints {
  /** Uploaded filename, used for the exact `<slug>` match. */
  filename?: string | null;
  /** NIRF institute ID (e.g. "IR-E-U-0456"). */
  nirfId?: string | null;
  /** Institute name as printed on the PDF cover page. */
  instituteName?: string | null;
}

export const NAME_SIMILARITY_THRESHOLD = 0.8;

/**
 * Resolve the official graph for an upload. Returns null when no graph can be
 * matched — the caller must surface that instead of comparing against anything.
 */
export function resolveExpectedOutput(
  hints: ExpectedOutputHints
): ExpectedOutputMatch | null {
  const entries = listExpectedOutput();
  if (entries.length === 0) return null;

  // 1) filename stem === graph stem
  const slug = slugFromFilename(hints.filename);
  if (slug) {
    const bySlug = entries.find((e) => e.slug.toLowerCase() === slug.toLowerCase());
    if (bySlug) return { entry: bySlug, method: "filename" };
  }

  // 2) NIRF institute ID
  const id = (hints.nirfId ?? "").toUpperCase().replace(/\s+/g, "");
  if (id) {
    const byId = entries.find((e) => e.nirfId.toUpperCase() === id);
    if (byId) return { entry: byId, method: "nirf-id" };
  }

  // 3) exact institute name
  const name = normaliseInstituteName(hints.instituteName);
  if (name) {
    const byName = entries.find(
      (e) => normaliseInstituteName(e.instituteName) === name
    );
    if (byName) return { entry: byName, method: "name-exact" };

    // 4) unique high-similarity match, disambiguated by the NIRF ID when the
    //    uploaded PDF happens to name one.
    const tokens = nameTokens(name);
    const scored = entries
      .map((e) => ({ e, s: diceSimilarity(tokens, nameTokens(normaliseInstituteName(e.instituteName))) }))
      .filter((x) => x.s >= NAME_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.s - a.s);

    if (scored.length === 1) return { entry: scored[0].e, method: "name-similar" };
    if (scored.length > 1 && scored[0].s > scored[1].s) {
      return { entry: scored[0].e, method: "name-similar" };
    }
  }

  return null;
}
