import { Request, Response } from "express";
import fs from "fs";
import { parsePdfBuffer } from "../services/pdfParser";
import { extractNirfMetrics } from "../services/nirfExtractor";
import { absoluteInputFromExtracted } from "../services/nirf/absolute/adapters";
import { computeAbsolute } from "../services/nirf/absolute/engine";
import { computeDiff } from "../services/nirf/diff/engine";
import {
  expectedOutputCoverage,
  listExpectedOutput,
  resolveExpectedOutput,
  expectedOutputImagePath,
  type ExpectedOutputEntry,
} from "../services/expectedOutputService";
import type { ExpectedOutputRecord } from "../data/expectedOutput2025";

/** Official values restricted to the sub-parameters the diff view compares. */
function officialScoresOf(entry: ExpectedOutputEntry) {
  const s = entry.scores;
  return {
    fsr: s.fsr,
    fqe: s.fqe,
    gph: s.gph,
    wd: s.wd,
    rd: s.rd,
    pcs: s.pcs,
    gue: s.gue,
  };
}

/**
 * GET /api/diff/colleges
 * The official values available for comparison, straight from `expected_output/`.
 */
export function listDiffColleges(_req: Request, res: Response) {
  const entries = listExpectedOutput();
  const coverage = expectedOutputCoverage();

  return res.json({
    count: entries.length,
    coverage,
    params: [
      { key: "fsr", uiLabel: "FSR", maxMarks: 30 },
      { key: "fqe", uiLabel: "FQU", maxMarks: 20 },
      { key: "gph", uiLabel: "GPH", maxMarks: 40 },
      { key: "wd", uiLabel: "WD", maxMarks: 30 },
      { key: "rd", uiLabel: "RD", maxMarks: 30 },
      { key: "pcs", uiLabel: "PCS", maxMarks: 20 },
      { key: "gue", uiLabel: "GUE", maxMarks: 15 },
    ],
    colleges: entries.map((e) => ({
      slug: e.slug,
      instituteName: e.instituteName,
      nirfId: e.nirfId,
      title: e.title,
      image: e.image,
      imageUrl: e.imageUrl,
      imageExists: e.imageExists,
      hasDatasetPdf: e.hasDatasetPdf,
      ocrConfidence: e.ocrConfidence,
      scores: officialScoresOf(e),
    })),
  });
}

/**
 * GET /api/diff/compare/:slug
 * The official side on its own — used when the UI needs the official row for a
 * college chosen from the list without re-uploading a PDF.
 */
export function getDiffOfficial(req: Request, res: Response) {
  const slug = String(req.params.slug ?? "");
  const entry = listExpectedOutput().find(
    (e) => e.slug.toLowerCase() === slug.toLowerCase()
  );
  if (!entry) {
    return res.status(404).json({
      error: `No official graph for "${slug}" in expected_output/.`,
    });
  }
  return res.json({
    slug: entry.slug,
    instituteName: entry.instituteName,
    nirfId: entry.nirfId,
    title: entry.title,
    imageUrl: entry.imageUrl,
    imageExists: entry.imageExists,
    ocrConfidence: entry.ocrConfidence,
    scores: officialScoresOf(entry),
  });
}

/**
 * POST /api/diff/compare
 * The diff calculator. Accepts a NIRF DCS PDF (multipart field `file`) or a
 * JSON `{ extracted }` payload, reuses the existing absolute-parameter engine
 * unchanged, resolves the matching official graph from `expected_output/` and
 * returns actual / mine / delta for the seven compared sub-parameters.
 *
 * Optional overrides: `{ slug }` to pin the official graph, plus `{ category,
 * year }` forwarded to the engine.
 */
export async function compareDiff(req: Request, res: Response) {
  const opts = req.body ?? {};

  // ── 1. Build the engine input exactly as /api/absolute/score does ────────
  let input;
  let institution: { name?: string | null; id?: string | null };
  let provenance: string;

  if (req.file) {
    try {
      const parsed = await parsePdfBuffer(req.file.buffer);
      input = absoluteInputFromExtracted(parsed.extracted);
      institution = {
        name: parsed.extracted.instituteName ?? null,
        id: parsed.extracted.instituteId ?? null,
      };
      provenance = `PDF (${req.file.originalname}) parsed as ${parsed.format.format} (${parsed.format.confidence.toFixed(2)} confidence); ${parsed.extracted.missingCount} field(s) unresolved.`;
    } catch (err) {
      return res
        .status(422)
        .json({ error: "PDF could not be parsed", detail: String(err) });
    }
  } else if (opts.extracted && typeof opts.extracted === "object") {
    const extracted = opts.extracted;
    input = absoluteInputFromExtracted(extracted);
    institution = {
      name: extracted.instituteName ?? null,
      id: extracted.instituteId ?? null,
    };
    provenance = "pre-extracted payload";
  } else if (typeof opts.text === "string") {
    const extracted = extractNirfMetrics(opts.text);
    input = absoluteInputFromExtracted(extracted);
    institution = {
      name: extracted.instituteName ?? null,
      id: extracted.instituteId ?? null,
    };
    provenance = "raw DCS text → extractNirfMetrics";
  } else {
    return res.status(400).json({
      error: "Attach a NIRF DCS PDF as `file`, or send `extracted` / `text`.",
    });
  }

  // ── 2. Resolve the official graph from expected_output/ ──────────────────
  const slug = typeof opts.slug === "string" ? opts.slug : null;
  const entries = listExpectedOutput();
  const match = slug
    ? (() => {
        const pinned = entries.find(
          (e) => e.slug.toLowerCase() === slug.toLowerCase()
        );
        return pinned ? { entry: pinned, method: "filename" as const } : null;
      })()
    : resolveExpectedOutput({
        filename: req.file?.originalname ?? null,
        nirfId: opts.nirfId ?? institution.id,
        instituteName: opts.instituteName ?? institution.name,
      });

  if (!match) {
    const coverage = expectedOutputCoverage();
    return res.status(404).json({
      error:
        "No official graph in expected_output/ matches this upload.",
      detail: coverage.imagesWithoutValues.length
        ? `Graphs present without extracted values: ${coverage.imagesWithoutValues.join(", ")}`
        : `expected_output/ holds ${coverage.imagesOnDisk} graphs (${coverage.dir}). Upload the matching NIRF DCS PDF (datasets/pdfs/<slug>.pdf) or pass "slug".`,
      candidates: entries.map((e) => ({
        slug: e.slug,
        instituteName: e.instituteName,
        nirfId: e.nirfId,
      })),
      institution,
    });
  }

  if (!match.entry.imageExists) {
    return res.status(409).json({
      error: `Official graph ${match.entry.image} is not present in ${"expected_output/"}.`,
      detail: match.entry.imagePath,
    });
  }

  // ── 3. Reuse the existing absolute engine, unchanged ────────────────────
  const report = computeAbsolute(input, {
    category: opts.category ?? "engineering",
    year: Number(opts.year ?? 2025),
    institution: {
      name: institution.name ?? undefined,
      id: institution.id ?? undefined,
    },
  });

  // ── 4. Compare ──────────────────────────────────────────────────────────
  const expected: ExpectedOutputRecord = match.entry;
  const diff = computeDiff({
    report,
    expected,
    imagePath: match.entry.imagePath,
    imageUrl: match.entry.imageUrl,
    matchMethod: match.method,
  });

  return res.json({
    diff,
    report,
    provenance,
    official: officialScoresOf(match.entry),
  });
}

/**
 * GET /api/diff/graph/:slug
 * Streams the official graph image straight out of `expected_output/`.
 */
export function serveDiffGraph(req: Request, res: Response) {
  const imagePath = expectedOutputImagePath(String(req.params.slug ?? ""));
  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(404).json({ error: "Official graph not found." });
  }
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(imagePath);
}
