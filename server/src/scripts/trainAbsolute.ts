/**
 * TRAIN & VALIDATE the ABSOLUTE engine over the local NIRF DCS PDF corpus.
 *
 * For every PDF in nirf_pdfs/ it runs the full pipeline
 * (parsePdf → absoluteInputFromExtracted → computeAbsolute) and records:
 *   - per-sub-parameter status & score (computed / partial / unable)
 *   - cohort & roster coverage (what the 2025 DCS format actually carries)
 *   - a coverage report written to artifacts/absolute_dataset.json
 *
 * The report is the "training" evidence for the absolute engine: it shows
 * exactly which sub-parameter formulas are computable straight from the PDFs
 * and which stay "unable — source table absent" by design.
 *
 * Usage:
 *   npm run train-absolute              # whole corpus
 *   npm run train-absolute -- --limit 5 # quick subset
 */
import fs from "fs";
import path from "path";
import { parsePdf } from "../services/pdfParser";
import { absoluteInputFromExtracted } from "../services/nirf/absolute/adapters";
import { computeAbsolute } from "../services/nirf/absolute/engine";
import type { AbsoluteReport } from "../services/nirf/absolute/types";

const pdfDir = path.resolve(__dirname, "../../nirf_pdfs");
const outDir = path.resolve(__dirname, "../../artifacts");
const limitArg = process.argv.findIndex((a) => a === "--limit");
const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1] ?? 0) : 0;

const SUB_KEYS = ["fsr", "gue", "gph", "pcs", "fqe", "wd", "rd"] as const;

interface Row {
  file: string;
  instituteName: string;
  instituteId: string;
  rosterRows: number;
  cohortRows: number;
  pcsQuestions: number;
  statuses: Record<string, string>;
  scores: Record<string, number | null>;
  summary: AbsoluteReport["summary"];
}

async function main() {
  const files = fs.readdirSync(pdfDir).filter((f) => f.endsWith(".pdf")).sort();
  const selected = limit > 0 ? files.slice(0, limit) : files;
  console.log(`Absolute training over ${selected.length} PDF${selected.length === 1 ? "" : "s"}...`);

  const counts: Record<string, { computed: number; partial: number; unable: number }> = {};
  for (const k of SUB_KEYS) counts[k] = { computed: 0, partial: 0, unable: 0 };
  counts.anyComputed = { computed: 0, partial: 0, unable: 0 };

  const rows: Row[] = [];
  for (const file of selected) {
    try {
      const parsed = await parsePdf(path.join(pdfDir, file));
      const report = computeAbsolute(absoluteInputFromExtracted(parsed.extracted));
      const row: Row = {
        file: file.replace(".pdf", ""),
        instituteName: parsed.extracted.instituteName ?? "",
        instituteId: parsed.extracted.instituteId ?? file.replace(".pdf", ""),
        rosterRows: parsed.extracted.facultyRoster?.length ?? 0,
        cohortRows: parsed.extracted.placementCohorts?.length ?? 0,
        pcsQuestions: parsed.extracted.pcsQuestions?.length ?? 0,
        statuses: {},
        scores: {},
        summary: report.summary,
      };
      let anyComputed = false;
      for (const k of SUB_KEYS) {
        const s = report.subs.find((x) => x.key === k)!;
        row.statuses[k] = s.status;
        row.scores[k] = s.score;
        counts[k][s.status]++;
        if (s.status !== "unable") anyComputed = true;
      }
      counts.anyComputed[anyComputed ? "computed" : "unable"]++;
      rows.push(row);
      console.log(
        `  ${file.replace(".pdf", "")} ${row.instituteName.padEnd(38)} roster:${String(row.rosterRows).padStart(3)} cohorts:${String(row.cohortRows).padStart(2)} ${SUB_KEYS.map((k) => `${k}:${row.statuses[k] === "unable" ? "x" : row.scores[k]}`).join(" ")}`
      );
    } catch (e) {
      console.log(`  FAIL ${file}: ${(e as Error).message}`);
    }
  }

  console.log(`\n=== ABSOLUTE COVERAGE (n=${rows.length}) ===`);
  for (const k of SUB_KEYS) {
    const c = counts[k];
    console.log(
      `${k.toUpperCase().padEnd(8)} computed:${String(c.computed).padStart(3)}  partial:${String(c.partial).padStart(3)}  unable:${String(c.unable).padStart(3)}`
    );
  }
  console.log(
    `ANY       files with ≥1 computable sub-parameter: ${counts.anyComputed.computed}/${rows.length}`
  );

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "absolute_dataset.json");
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`\nWrote ${rows.length} rows to ${outPath}`);
  console.log(`Total computable absolute points (avg per institute): ${(rows.reduce((a, r) => a + r.summary.totalComputed, 0) / Math.max(rows.length, 1)).toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});