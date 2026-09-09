/**
 * NIRF PDF format detection (Phase 5).
 *
 * Classifies an uploaded PDF against the expected NIRF data-submission
 * (credentials) layout so the UI can state, per section, whether the document
 * is the recognized format, a partial match, or something else entirely —
 * matching the product requirement "recognised / partially recognised /
 * unrecognised" rather than silently failing or inventing data.
 */

export type PdfFormat =
  | "nirf_credentials" // recognized NIRF Data Collection Sheet (matches section layout)
  | "nirf_pdf_other" // an NIRF document, but not the DCS credentials format
  | "unsupported"; // not an NIRF data-submission document

export interface SectionMarker {
  id: string;
  label: string;
  pattern: RegExp;
  /** present on which 1-based page (0 => not found on any page; -1 => found but page unresolved). */
  page: number;
  matchText: string;
}

export interface PdfFormatReport {
  format: PdfFormat;
  confidence: number; // 0..1 fraction of core markers found
  pageCount: number;
  sections: SectionMarker[];
  coreFound: number;
  coreRequired: number;
  summary: string;
}

/** Core section markers that define the NIRF DCS credentials layout. */
const CORE_MARKERS: { id: string; label: string; pattern: RegExp }[] = [
  { id: "institute", label: "Institute Identity", pattern: /Institute\s*Name\s*\:/i },
  { id: "student_enrolment", label: "Student Enrolment Details", pattern: /Student\s*(?:Enrolment|Enrollment)/i },
  { id: "phd", label: "Ph.D Students", pattern: /Ph\.?D\s+students|Doctoral\s+(?:Program|Students)/i },
  { id: "faculty", label: "Faculty Details", pattern: /Faculty\s+Details|Women\s+faculty/i },
  { id: "financials", label: "Financial Resources", pattern: /Capital\s+Expenditure|Operational\s+Expenditure/i },
  { id: "publications", label: "Research Publications", pattern: /Research\s+Publications|Citations/i },
  { id: "sponsored", label: "Sponsored Research", pattern: /Sponsored\s+Research/i },
  { id: "consultancy", label: "Consultancy Projects", pattern: /Consultancy\s+Project/i },
  { id: "patents", label: "IPR & Patents", pattern: /Patents?\s+(?:Granted|Filed)|IPRs?/i },
  { id: "placement", label: "Graduation & Placement", pattern: /Graduat(?:ing|ion)|Placement|Median\s+Salary/i },
  { id: "diversity", label: "Outreach / Diversity", pattern: /Outreach\s+and\s+Inclusivity|Women\s+Diversity|Physically\s+Challenged/i },
];

export interface PageText {
  page: number;
  text: string;
}

export function findPageFor(pages: PageText[], pattern: RegExp): { page: number; matchText: string } | undefined {
  for (const p of pages) {
    const m = p.text.match(pattern);
    if (m) return { page: p.page, matchText: m[0].slice(0, 120) };
  }
  return undefined;
}

export function detectPdfFormat(pages: PageText[]): PdfFormatReport {
  const pageCount = pages.length;
  const sections: SectionMarker[] = CORE_MARKERS.map((m) => {
    const found = findPageFor(pages, m.pattern);
    return {
      id: m.id,
      label: m.label,
      pattern: m.pattern,
      page: found ? found.page : 0,
      matchText: found ? found.matchText : "",
    };
  });

  const coreRequired = CORE_MARKERS.length;
  const coreFound = sections.filter((s) => s.page > 0).length;
  const confidence = coreRequired === 0 ? 0 : coreFound / coreRequired;

  let format: PdfFormat;
  if (coreFound >= 4) {
    format = "nirf_credentials";
  } else if (coreFound >= 1) {
    format = "nirf_pdf_other";
  } else {
    format = "unsupported";
  }

  const summary =
    format === "nirf_credentials"
      ? `Recognized NIRF Data-Collection Sheet layout (${coreFound}/${coreRequired} core sections present).`
      : format === "nirf_pdf_other"
        ? `NIRF-related document but not a full Data-Collection Sheet (${coreFound}/${coreRequired} core sections).`
        : "Document does not match the NIRF Data-Collection Sheet format.";

  return { format, confidence, pageCount, sections, coreFound, coreRequired, summary };
}

/** Split pdfjs text that carries "[PAGE n]" markers into per-page chunks. */
export function splitPageMarkers(combined: string): PageText[] {
  const pages: PageText[] = [];
  const re = /\[PAGE\s+(\d+)\]\s*/g;
  let lastIndex = 0;
  let lastPage = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    if (lastPage > 0) {
      pages.push({ page: lastPage, text: combined.slice(lastIndex, m.index) });
    }
    lastPage = Number(m[1]) || lastPage;
    lastIndex = m.index + m[0].length;
  }
  // No markers at all → treat whole text as a single (unknown) page.
  if (lastPage === 0) return [{ page: 0, text: combined }];
  pages.push({ page: lastPage, text: combined.slice(lastIndex) });
  return pages;
}