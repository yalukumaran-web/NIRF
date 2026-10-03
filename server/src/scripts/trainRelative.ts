/**
 * Train + validate the Relative Parameters module (Steps 3/6/10).
 *
 * Usage:
 *   npm run train:relative                      → seed baseline (demo) dataset
 *   npm run train:relative -- --dataset ./my.csv   → real Step-1 ground truth
 *   npm run train:relative -- --json             → raw JSON records on stdin
 *
 * Runs the held-out Year-split loop (train Y1+Y2 → validate Y3), produces the
 * per-parameter error report and regression suite, and saves the shipped
 * model artifact to server/src/services/nirf/relative/artifacts/.
 */

import fs from "fs";
import path from "path";
import {
  buildSeedBaselineDataset,
  parseRelativeDatasetCsv,
  parseRelativeDatasetJson,
} from "../services/nirf/relative/dataset";
import { runRelativeTraining } from "../services/nirf/relative/train";
import { saveRelativeModel, artifactPath } from "../services/nirf/relative/loader";

function argvFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const datasetArg = argvFlag("--dataset");
  const jsonArg = argvFlag("--json");
  const trainA = Number(argvFlag("--trainA") ?? 2023);
  const trainB = Number(argvFlag("--trainB") ?? 2024);
  const validate = Number(argvFlag("--validate") ?? 2025);
  const tolerance = Number(argvFlag("--tolerance") ?? 2);

  let records;
  if (datasetArg) {
    const text = fs.readFileSync(path.resolve(datasetArg), "utf-8");
    records = /\.csv$/i.test(datasetArg) ? parseRelativeDatasetCsv(text) : parseRelativeDatasetJson(JSON.parse(text));
  } else if (jsonArg) {
    const text = fs.readFileSync(path.resolve(jsonArg), "utf-8");
    const payload = JSON.parse(text);
    records = Array.isArray(payload) ? parseRelativeDatasetJson(payload) : parseRelativeDatasetJson(payload.dataset);
  } else {
    records = buildSeedBaselineDataset();
  }

  const eligible = records.filter((r) => r.eligible).length;
  const ignored = records.length - eligible;

  console.log(`[relative] ${records.length} records, ${eligible} eligible (≥80% completeness), ${ignored} excluded.`);

  const { artifact, errorReport, regression } = runRelativeTraining(records, {
    trainYears: [trainA, trainB],
    validateYear: validate,
    tolerance,
    category: "engineering",
  });

  saveRelativeModel(artifact);

  // Persist the baseline error report for future retrain comparison (Step 10.7).
  const dir = artifactPath().replace(/relative_model\.json$/, "");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dir + "last_error_report.json", JSON.stringify(errorReport, null, 2), "utf-8");

  console.log("\n──────────────────────── Artifact ────────────────────────");
  console.log(`version=${artifact.version} train=[${artifact.trainYears}] validate=${artifact.validateYear}`);
  console.log(`seedBaseline=${artifact.seedBaseline}`);
  if (artifact.seedBaseline) console.log(`⚠ ${artifact.provenanceNote}`);

  console.log("\n──────────────────── Error Report (Step 10) ────────────────────");
  const header = `param     mae     maxErr   withinTol/total  strategy`;
  console.log(header);
  for (const p of errorReport.perParam) {
    const strat = (artifact.params as any)?.[p.key]?.strategy ?? "-";
    console.log(
      `${p.key.padEnd(9)} ${(Number.isFinite(p.mae) ? p.mae.toFixed(2) : "n/a").padStart(6)} ${(Number.isFinite(p.maxError) ? p.maxError.toFixed(2) : "n/a").padStart(7)} ${`${p.withinTolerance}/${p.total}`.padStart(15)} ${strat}`
    );
  }
  console.log(`\noverall MAE = ${errorReport.overallMae.toFixed(2)} marks  |  passedTolerance = ${errorReport.passedTolerance}`);
  console.log(`flagged colleges (outside ±${tolerance}): ${errorReport.collegesFlagged.length}`);
  for (const f of errorReport.collegesFlagged.slice(0, 15)) {
    console.log(`  ${f.collegeId} ${f.collegeName} — ${f.param} error ${f.error}`);
  }

  console.log("\n──────────────────── Regression Suite (Step 6) ────────────────────");
  console.log(`assertions: ${regression.assertionsPassed}/${regression.assertionsTotal} passed`);
  for (const f of regression.assertionsFailed) console.log(`  ✗ ${f}`);

  console.log("\n[relative] model artifact written to artifacts/relative_model.json");
  process.exit(errorReport.passedTolerance && regression.assertionsFailed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});