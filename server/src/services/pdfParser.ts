import fs from "fs";
import { extractPdfTextFromBuffer, extractPdfPagesFromBuffer } from "./pdfText";
import { extractNirfMetrics, type ExtractedNirf } from "./nirfExtractor";
import { detectPdfFormat, splitPageMarkers, type PdfFormatReport } from "./pdfFormatDetector";

/**
 * Parses a NIRF data-submission PDF buffer into extracted metrics.
 * Returns the extracted fields plus the list of fields that could not be found
 * (never guessing/ inventing data — derived/default values are flagged in
 * `extracted.fieldSources`), plus a format-detection report.
 */
export interface PdfParseResult {
  extracted: ExtractedNirf;
  missing: string[];
  textSnippet: string;
  format: PdfFormatReport;
  pageCount: number;
  /** Quality label for UI: based on format recognition + required-field coverage. */
  quality: "recognized_full" | "recognized_partial" | "nirf_other" | "invalid";
}

const REQUIRED_KEYS: (keyof ExtractedNirf)[] = [
  "enrolledStudents",
  "permanentFaculty",
  "phdStudents",
  "graduatesPlaced",
  "medianSalary",
];

export async function parsePdfBuffer(buffer: Buffer): Promise<PdfParseResult> {
  const pages = await extractPdfPagesFromBuffer(buffer);
  const text = pages.map((p) => `[PAGE ${p.page}] ${p.text.trim()}`).join("\n");
  const extracted = extractNirfMetrics(text);

  const missing = REQUIRED_KEYS.filter(
    (k) => extracted[k] === undefined || extracted[k] === null
  );

  const format = detectPdfFormat(
    pages.map((p) => ({ page: p.page, text: p.text }))
  );

  let quality: PdfParseResult["quality"];
  if (format.format === "nirf_credentials" && missing.length === 0) quality = "recognized_full";
  else if (format.format === "nirf_credentials" && missing.length > 0) quality = "recognized_partial";
  else if (format.format === "nirf_pdf_other") quality = "nirf_other";
  else quality = "invalid";

  return {
    extracted,
    missing,
    textSnippet: text.slice(0, 500),
    format,
    pageCount: format.pageCount,
    quality,
  };
}

export async function parsePdf(filePath: string): Promise<PdfParseResult> {
  return parsePdfBuffer(fs.readFileSync(filePath));
}

export { splitPageMarkers };
