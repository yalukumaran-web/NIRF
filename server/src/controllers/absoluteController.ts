import { Request, Response } from "express";
import { parsePdfBuffer } from "../services/pdfParser";
import { extractNirfMetrics } from "../services/nirfExtractor";
import type { ExtractedNirf } from "../services/nirfExtractor";
import { computeAbsolute } from "../services/nirf/absolute/engine";
import {
  absoluteInputFromExtracted,
  absoluteInputFromTables,
} from "../services/nirf/absolute/adapters";
import type { AbsoluteInput } from "../services/nirf/absolute/types";

/**
 * POST /api/absolute/score
 * Stateless absolute-parameter scoring. Accepts ONE of:
 *   - multipart form field `file`  (a NIRF DCS PDF, parsed on the fly)
 *   - JSON `{ text }`              (already-extracted DCS text)
 *   - JSON `{ extracted }`         (an ExtractedNirf payload)
 *   - JSON `{ tables }`            (complete AbsoluteInput table objects)
 * Plus optional `{ category, year, institution: { name, id } }`.
 */
export async function scoreAbsolute(req: Request, res: Response) {
  const opts = req.body ?? {};

  let input: AbsoluteInput;
  let provenance: string;

  if (req.file) {
    try {
      const parsed = await parsePdfBuffer(req.file.buffer);
      input = absoluteInputFromExtracted(parsed.extracted);
      provenance = `PDF (${req.file.originalname}) parsed as ${parsed.format.format} (${parsed.format.confidence.toFixed(2)} confidence); ${parsed.extracted.missingCount} field(s) unresolved.`;
    } catch (err) {
      return res.status(422).json({ error: "PDF could not be parsed", detail: String(err) });
    }
  } else if (typeof opts.text === "string") {
    const extracted = extractNirfMetrics(opts.text);
    input = absoluteInputFromExtracted(extracted);
    provenance = "raw DCS text → extractNirfMetrics";
  } else if (opts.extracted && typeof opts.extracted === "object") {
    input = absoluteInputFromExtracted(opts.extracted as unknown as ExtractedNirf);
    provenance = "pre-extracted payload";
  } else if (opts.tables && typeof opts.tables === "object") {
    input = absoluteInputFromTables(opts.tables as AbsoluteInput);
    provenance = "supplied AbsoluteInput tables";
  } else {
    return res.status(400).json({
      error: "Provide a PDF file, `text`, `extracted`, or `tables` payload.",
    });
  }

  const institution =
    opts.institution ??
    (opts.extracted
      ? { name: (opts.extracted as ExtractedNirf).instituteName ?? null, id: (opts.extracted as ExtractedNirf).instituteId ?? null }
      : null);

  const report = computeAbsolute(input, {
    category: opts.category ?? "engineering",
    year: Number(opts.year ?? 2025),
    institution,
  });

  return res.json({ report, provenance, inputs: input });
}