import fs from "fs";
import path from "path";
import { extractPdfText } from "../services/pdfText";
import { extractNirfMetrics, type ExtractedNirf, type ExtractionSource } from "../services/nirfExtractor";

const pdfDir = path.resolve(__dirname, "../../nirf_pdfs");

/**
 * Fields extracted from the NIRF credentials PDF. External-source fields
 * (totalPublications, totalCitations, top25Citations, retractedPapers,
 * retractedCitations, perceptionScore) are NEVER present in the PDF and are
 * intentionally not scanned here.
 */
const fields = [
  "instituteName",
  "instituteId",
  "sanctionedIntake",
  "enrolledStudents",
  "phdStudents",
  "permanentFaculty",
  "facultyWithPhD",
  "facultyExp0to8",
  "facultyExp8to15",
  "facultyExp15plus",
  "womenFaculty",
  "patentsFiled",
  "patentsGranted",
  "capitalExpenditure",
  "operationalExpenditure",
  "sponsoredResearchAmount",
  "consultancyRevenue",
  "graduatesPlaced",
  "graduatesHigherStudies",
  "graduatesInTime",
  "medianSalary",
  "phdGraduates",
  "womenStudents",
  "studentsOtherStates",
  "studentsOtherCountries",
  "escsStudents",
  "pcsFacilities",
] as (keyof ExtractedNirf)[];

async function main() {
  const files = fs.readdirSync(pdfDir).filter((f) => f.endsWith(".pdf")).sort();
  console.log(`Scanning ${files.length} PDFs...`);

  const present: Record<string, number> = {};
  const estimated: Record<string, number> = {};
  const missing: Record<string, number> = {};
  for (const f of fields) {
    present[f] = 0;
    estimated[f] = 0;
    missing[f] = 0;
  }

  const rows: any[] = [];
  for (const file of files) {
    try {
      const text = await extractPdfText(path.join(pdfDir, file));
      const m = extractNirfMetrics(text);
      if (!m.instituteId) m.instituteId = file.replace(".pdf", "");
      if (!m.instituteName) m.instituteName = file;

      const rec: any = { file: file.replace(".pdf", "") };
      const sources: Record<string, ExtractionSource> = {};
      for (const f of fields) {
        const raw = (m as any)[f];
        if (raw !== undefined && raw !== null) {
          rec[f] = raw;
          present[f]++;
        } else {
          missing[f]++;
        }
      }
      for (const [key, src] of Object.entries(m.fieldSources ?? {})) {
        if ((fields as string[]).includes(key)) {
          sources[key] = src;
          if (src === "estimated_default") estimated[key]++;
        }
      }
      rec.sources = sources;
      rec.includesEstimates = !!m.includesEstimates;
      rec.requiresExternalSources = !!m.requiresExternalSources;
      rec.missingCount = m.missingCount ?? 0;
      rows.push(rec);
    } catch (e) {
      console.log(`FAIL ${file}: ${(e as Error).message}`);
    }
  }

  console.log(`\n=== EXTRACTION COVERAGE (present / ${files.length}) ===`);
  for (const f of fields) {
    const est = estimated[f] > 0 ? `  (estimated: ${estimated[f]})` : "";
    console.log(`${f.padEnd(28)} ${String(present[f]).padStart(3)}/${files.length}${est}`);
  }

  const outPath = path.resolve(__dirname, "../../nirf_dataset.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nWrote dataset with ${rows.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});