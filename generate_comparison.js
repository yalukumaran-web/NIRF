/**
 * Generate comparison.xlsx — NIRF 2025 Engineering Top-90
 *
 * Columns per sub-parameter (FSR, GUE, PCS, FQE, WD, RD):
 *   actual_data_by_NIRF(2025)  — NIRF does NOT publish individual sub-parameter
 *                                 scores; only aggregate TLR/GO/OI are published.
 *                                 We include the parent-parameter score for reference.
 *   value_by_my_prediction_model — from the Absolute Engine (PDF → score pipeline)
 *   delta                        — actual − predicted (where both are available)
 */

const ExcelJS = require("./server/node_modules/exceljs");
const fs = require("fs");
const path = require("path");

// ── 1.  Load data sources ─────────────────────────────────────────────────

// Official published scores (TLR / RPC / GO / OI / PR only — no sub-params)
const { OFFICIAL_ENGINEERING_2025 } = require("./server/dist/data/officialEngineering2025");

// Absolute-engine prediction results (sub-parameter level)
const absoluteDataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "server/artifacts/absolute_dataset.json"), "utf8")
);

// Build lookup by institute ID
const absLookup = new Map();
for (const row of absoluteDataset) {
  absLookup.set(row.file, row);         // file = "IR-E-C-1331" etc.
  absLookup.set(row.instituteId, row);   // redundant safety
}

// Sub-parameter definitions
const SUB_PARAMS = [
  { key: "fsr", label: "FSR Faculty-Student Ratio",            parent: "TLR", maxMarks: 30 },
  { key: "gue", label: "GUE Graduation in Stipulated Time",    parent: "GO",  maxMarks: 15 },
  { key: "pcs", label: "PCS Physically Challenged Facilities", parent: "OI",  maxMarks: 20 },
  { key: "fqe", label: "FQE Faculty Quality & Experience",     parent: "TLR", maxMarks: 20 },
  { key: "wd",  label: "WD Women Diversity",                   parent: "OI",  maxMarks: 30 },
  { key: "rd",  label: "RD Region Diversity",                  parent: "OI",  maxMarks: 30 },
];

// Parent-parameter key in the official data
const PARENT_KEY = { TLR: "tlr", GO: "go", OI: "oi" };

// ── 2.  Build workbook ────────────────────────────────────────────────────

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NIRF Ranking Calculator";
  wb.created = new Date();

  const ws = wb.addWorksheet("Comparison", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
  });

  // ── Header rows ──
  // Row 1: group headers
  const row1 = ["", ""];
  const row2 = ["Rank", "College Name"];

  for (const sp of SUB_PARAMS) {
    row1.push(sp.label, "", "");
    row2.push(
      `actual_data_by_NIRF(2025)\n(${sp.parent} param score /100)`,
      `value_by_my_prediction_model\n(score /${sp.maxMarks})`,
      `delta`
    );
  }

  // Add a notes column
  row1.push("");
  row2.push("Notes");

  ws.addRow(row1);
  ws.addRow(row2);

  // ── Merge group-header cells (row 1) ──
  // Columns: A=rank, B=name, then groups of 3 for each sub-param
  ws.mergeCells("A1:A2");
  ws.mergeCells("B1:B2");
  for (let i = 0; i < SUB_PARAMS.length; i++) {
    const startCol = 3 + i * 3;        // 1-indexed: C, F, I, L, O, R
    const endCol = startCol + 2;
    ws.mergeCells(1, startCol, 1, endCol);
  }

  // ── Style header rows ──
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const subHeaderFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6E4F0" } };
  const subHeaderFont = { bold: true, color: { argb: "FF1F4E79" }, size: 10 };

  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
  ws.getRow(2).eachCell((cell) => {
    cell.fill = subHeaderFill;
    cell.font = subHeaderFont;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 50;

  // Column widths
  ws.getColumn(1).width = 6;   // Rank
  ws.getColumn(2).width = 50;  // College Name
  for (let i = 0; i < SUB_PARAMS.length; i++) {
    ws.getColumn(3 + i * 3).width = 18;     // actual
    ws.getColumn(3 + i * 3 + 1).width = 18; // predicted
    ws.getColumn(3 + i * 3 + 2).width = 10; // delta
  }
  ws.getColumn(3 + SUB_PARAMS.length * 3).width = 40; // notes

  // ── Data rows ──
  for (const official of OFFICIAL_ENGINEERING_2025) {
    const absRow = absLookup.get(official.instituteId);
    const rowData = [official.rank, official.instituteName];
    const notes = [];

    for (const sp of SUB_PARAMS) {
      // ACTUAL: NIRF only publishes parent-parameter scores, not sub-param scores
      const parentScore = official[PARENT_KEY[sp.parent]];
      const actualLabel = parentScore != null ? parentScore : "N/A";

      // PREDICTED: from absolute engine
      let predicted = null;
      let status = "no PDF";
      if (absRow) {
        predicted = absRow.scores[sp.key];
        status = absRow.statuses[sp.key];
      }

      // Delta: cannot compute (actual is parent-param, predicted is sub-param)
      // We mark it N/A since the units differ
      let delta = "N/A";
      // If both are available and user wants numeric delta (note: comparing apples & oranges)
      // We leave delta as N/A since actual is parent TLR/GO/OI (/100) and predicted is sub-param (/maxMarks)

      if (status === "unable") {
        predicted = "Unable";
        notes.push(`${sp.key.toUpperCase()}: unable (source table absent in PDF)`);
      } else if (predicted === null) {
        predicted = "N/A";
      }

      rowData.push(actualLabel, predicted, delta);
    }

    rowData.push(notes.join("; ") || "");
    const dataRow = ws.addRow(rowData);

    // Style data row
    dataRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle", wrapText: true };

      if (colNumber <= 2) {
        // Rank & name
        cell.alignment = { ...cell.alignment, horizontal: colNumber === 1 ? "center" : "left" };
      } else {
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }

      // Highlight unable/N/A cells
      if (cell.value === "Unable" || cell.value === "N/A") {
        cell.font = { color: { argb: "FFAA0000" }, italic: true };
      }

      // Number formatting for predicted scores
      const colIdx = colNumber - 3;
      if (colIdx >= 0 && colIdx % 3 === 1 && typeof cell.value === "number") {
        cell.numFmt = "0.00";
      }
    });

    // Alternating row color
    if (official.rank % 2 === 0) {
      dataRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F7FC" } };
      });
    }
  }

  // ── Summary sheet ──
  const summaryWs = wb.addWorksheet("Summary & Notes");
  summaryWs.getColumn(1).width = 80;

  const summaryLines = [
    "NIRF 2025 Engineering — Absolute Sub-Parameter Comparison",
    "",
    "Generated: " + new Date().toISOString(),
    "",
    "=== IMPORTANT NOTES ===",
    "",
    "1. ACTUAL DATA (actual_data_by_NIRF(2025)):",
    "   NIRF does NOT publish individual sub-parameter scores (FSR, GUE, PCS, FQE, WD, RD).",
    "   Only the aggregate PARAMETER scores are published: TLR, RPC, GO, OI, PR (each out of 100).",
    "   The 'actual' column shows the PARENT parameter score (TLR/GO/OI) for reference.",
    "   Source: https://www.nirfindia.org/Rankings/2025/EngineeringRanking.html",
    "",
    "2. PREDICTION MODEL VALUES (value_by_my_prediction_model):",
    "   Computed by the Absolute Engine from NIRF DCS PDFs (data-submission credentials).",
    "   Each PDF is parsed and sub-parameter scores are computed using official NIRF formulas.",
    "   - FSR (max 30): Faculty-Student Ratio — requires faculty roster table (absent in 2025 PDFs)",
    "   - GUE (max 15): Graduation in Stipulated Time — computed from placement cohort tables",
    "   - PCS (max 20): Physically Challenged Facilities — computed from PCS questions",
    "   - FQE (max 20): Faculty Quality & Experience — requires faculty roster (absent in 2025 PDFs)",
    "   - WD  (max 30): Women Diversity — computed from student strength tables (partial: student-only)",
    "   - RD  (max 30): Region Diversity — computed from student strength tables",
    "",
    "3. FSR & FQE are always 'Unable':",
    "   The 2025 NIRF DCS PDF format does NOT include the row-wise Faculty Details roster table.",
    "   It only includes a summary 'Number of faculty members entered' count.",
    "   FSR and FQE formulas require per-faculty designation, qualification, and experience data.",
    "   This is a limitation of the PDF format, not the engine.",
    "",
    "4. DELTA:",
    "   Cannot be computed because the actual and predicted values are on different scales:",
    "   Actual = parent parameter score (out of 100), Predicted = sub-parameter score (out of sub-max).",
    "   To compute a meaningful delta, NIRF would need to publish sub-parameter breakdowns.",
    "",
    "5. COVERAGE:",
    "   This file covers ranks 1–90 (90 institutions from the official NIRF 2025 dataset).",
    "   Ranks 91–100 are NOT included because:",
    "   - The CSV and PDF corpus only contains 90 institutions",
    "   - Official sub-parameter data for ranks 91-100 is not in the local dataset",
    "",
    "=== SUB-PARAMETER FORMULAS ===",
    "",
    "FSR = 30 × min(15 × (F/N), 1)  where F=teaching faculty, N=total students",
    "GUE = 15 × min(Ng / (0.8 × NT), 1)  where Ng=graduates in time, NT=intake",
    "PCS = Σ per-question facility marks, capped at 20",
    "FQE = FQ(10) + FE(10)  where FQ=PhD%, FE=experience distribution",
    "WD  = 15×min(NWS/50%,1) + 15×min(NWF/20%,1)  women students + women faculty",
    "RD  = 25×(other-state share) + 5×(other-country share)",
    "",
    "=== COVERAGE STATISTICS ===",
    `Total institutions: ${OFFICIAL_ENGINEERING_2025.length}`,
    `PDFs matched: ${OFFICIAL_ENGINEERING_2025.filter(o => absLookup.has(o.instituteId)).length}`,
  ];

  // Count statuses
  let fsr_c=0, fqe_c=0, gue_c=0, pcs_c=0, wd_c=0, rd_c=0;
  for (const row of absoluteDataset) {
    if (row.statuses.fsr !== "unable") fsr_c++;
    if (row.statuses.fqe !== "unable") fqe_c++;
    if (row.statuses.gue !== "unable") gue_c++;
    if (row.statuses.pcs !== "unable") pcs_c++;
    if (row.statuses.wd  !== "unable") wd_c++;
    if (row.statuses.rd  !== "unable") rd_c++;
  }
  summaryLines.push(
    `FSR computable: ${fsr_c}/${absoluteDataset.length}`,
    `FQE computable: ${fqe_c}/${absoluteDataset.length}`,
    `GUE computable: ${gue_c}/${absoluteDataset.length}`,
    `PCS computable: ${pcs_c}/${absoluteDataset.length}`,
    `WD  computable: ${wd_c}/${absoluteDataset.length}`,
    `RD  computable: ${rd_c}/${absoluteDataset.length}`,
  );

  for (const line of summaryLines) {
    const r = summaryWs.addRow([line]);
    if (line.startsWith("===")) {
      r.getCell(1).font = { bold: true, size: 12, color: { argb: "FF1F4E79" } };
    }
  }

  // ── Save ──
  const outPath = path.join(__dirname, "comparison.xlsx");
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ Saved: ${outPath}`);
  console.log(`   Rows: ${OFFICIAL_ENGINEERING_2025.length} institutions`);
  console.log(`   Sheets: Comparison, Summary & Notes`);
}

function thinBorder() {
  return {
    top: { style: "thin", color: { argb: "FFB0B0B0" } },
    left: { style: "thin", color: { argb: "FFB0B0B0" } },
    bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
    right: { style: "thin", color: { argb: "FFB0B0B0" } },
  };
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
