import { describe, it, expect } from "vitest";
import { predictRelativeParameters } from "../services/nirf/relative/engine";
import { RELATIVE_PARAMS_BY_KEY } from "../services/nirf/relative/parameters";
import { buildSeedBaselineDataset } from "../services/nirf/relative/dataset";
import { runRelativeTraining } from "../services/nirf/relative/train";
import { computeCohortStatsForYearComplete } from "../services/nirf/relative/cohort";
import type { RelativeRawInput, RelativeFieldKey } from "../services/nirf/relative/types";

function fullInput(overrides: Partial<RelativeRawInput> = {}): RelativeRawInput {
  const numeric: Record<RelativeFieldKey, number> = {
    capitalExpenditure: 4100000000,
    operationalExpenditure: 7200000000,
    totalPublications: 5400,
    totalCitations: 66000,
    top25Citations: 21800,
    patentsFiled: 298,
    patentsGranted: 160,
    sponsoredResearchAmount: 5200000000,
    consultancyRevenue: 900000000,
    phdGraduates: 540,
  };
  const fields = Object.fromEntries(
    Object.entries(numeric).map(([k, v]) => [k, { key: k, value: v, source: "from_dcs_pdf" as const, basis: "test" }])
  );
  return {
    instituteName: "Test Institute",
    rank: 35,
    fields: fields as RelativeRawInput["fields"],
    ...overrides,
  };
}

describe("relative parameter module", () => {
  const records = buildSeedBaselineDataset();
  const result = runRelativeTraining(records, {
    trainYears: [2023, 2024],
    validateYear: 2025,
    tolerance: 2,
    category: "engineering",
  });

  it("predicts all 6 sub-parameters with full provenance", () => {
    const report = predictRelativeParameters(fullInput(), 2025, { category: "engineering", model: result.artifact });
    expect(report.params).toHaveLength(6);
    for (const p of report.params) {
      const def = RELATIVE_PARAMS_BY_KEY[p.key];
      expect(p.code).toBe(def.code);
      expect(p.maxMarks).toBe(def.maxMarks);
      expect(p.score).not.toBeNull();
      expect(p.formulaLine.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThanOrEqual(1);
      expect(["computed", "estimated", "low_confidence", "missing_data"]).toContain(p.status);
    }
  });

  it("PR falls back to the rank-band proxy when no published actual exists", () => {
    const report = predictRelativeParameters(fullInput(), 2025, { category: "engineering", model: result.artifact });
    const pr = report.params.find((p) => p.key === "pr")!;
    expect(pr.originTag).toBe("rank_band_proxy");
    expect(pr.score!).toBeGreaterThanOrEqual(1);
    expect(pr.score!).toBeLessThanOrEqual(100);
  });

  it("flags missing inputs as missing_data with named fields", () => {
    const input = fullInput();
    const emptyFields = {} as RelativeRawInput["fields"];
    input.fields = emptyFields;
    const report = predictRelativeParameters(input, 2025, { category: "engineering", model: result.artifact });
    expect(report.params.length).toBe(6);
    expect(report.summary.missingFields.length).toBeGreaterThan(0);
  });

  it("year-split training passes the ±2 tolerance regression suite on the baseline", () => {
    expect(result.errorReport.passedTolerance).toBe(true);
    expect(result.regression.assertionsFailed).toEqual([]);
    expect(result.errorReport.overallMae).toBeLessThan(1);
    const valRecords = records.filter((r) => r.year === 2025 && r.eligible);
    const full = computeCohortStatsForYearComplete(valRecords, 2025);
    expect(full.cohortSize).toBe(valRecords.length);
  });
});
