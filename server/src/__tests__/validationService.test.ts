import { describe, it, expect } from "vitest";
import { validateRawMetrics, acceptsExtraction } from "../services/validationService";
import type { RawMetrics } from "../types/metrics";

function metrics(overrides: Partial<RawMetrics> = {}): RawMetrics {
  return {
    year: 2025,
    sanctionedIntake: 1200,
    enrolledStudents: 1100,
    phdStudents: 300,
    permanentFaculty: 300,
    facultyWithPhD: 250,
    facultyExp0to8: 80,
    facultyExp8to15: 120,
    facultyExp15plus: 100,
    capitalExpenditure: 100_000_000,
    operationalExpenditure: 150_000_000,
    totalPublications: 700,
    totalCitations: 12000,
    top25Citations: 5000,
    patentsFiled: 40,
    patentsGranted: 20,
    sponsoredResearchAmount: 200_000_000,
    consultancyRevenue: 80_000_000,
    retractedPapers: 1,
    retractedCitations: 5,
    graduatesPlaced: 900,
    graduatesHigherStudies: 100,
    graduatesInTime: 1050,
    medianSalary: 900_000,
    phdGraduates: 60,
    womenStudents: 400,
    womenFaculty: 100,
    studentsOtherStates: 300,
    studentsOtherCountries: 30,
    escsStudents: 200,
    pcsFacilities: true,
    perceptionScore: 70,
    ...overrides,
  };
}

describe("validateRawMetrics", () => {
  it("returns a complete report for well-formed data", () => {
    const report = validateRawMetrics(metrics(), { category: "engineering", year: 2025 });
    expect(report.summary.complete).toBe(true);
    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.finalScoreAvailable).toBe(true);
    expect(report.sections.map((s) => s.parameter)).toEqual(["TLR", "RP", "GO", "OI", "PR"]);
  });

  it("flags missing mandatory fields as errors", () => {
    const m = metrics({ permanentFaculty: undefined as any });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    expect(report.summary.complete).toBe(false);
    expect(report.summary.missingRequiredKeys).toContain("permanentFaculty");
    expect(acceptsExtraction(report)).toBe(false);
  });

  it("flags missing needed (non-mandatory) fields as warnings only", () => {
    const m = metrics({ patentsGranted: undefined as any });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    expect(report.summary.errorCount).toBe(0);
    expect(report.summary.missingNeededKeys).toContain("patentsGranted");
    expect(report.summary.warningCount).toBeGreaterThan(0);
  });

  it("reports insufficient parameters when engine-critical inputs are missing", () => {
    const m = metrics({ totalPublications: undefined as any, graduatesPlaced: undefined as any });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    expect(report.summary.insufficientParameters).toContain("RP");
    expect(report.summary.insufficientParameters).toContain("GO");
  });

  it("flags plausibility violations (women > enrolled, top25 > citations)", () => {
    const m = metrics({ womenStudents: 5000, top25Citations: 90000 });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    const messages = report.fields.map((f) => f.message);
    expect(messages.some((msg) => msg.includes("Women students"))).toBe(true);
    expect(messages.some((msg) => msg.includes("Top-25% citations"))).toBe(true);
  });

  it("flags out-of-range perception score", () => {
    const m = metrics({ perceptionScore: 150 });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    expect(report.summary.errorCount).toBeGreaterThan(0);
  });

  it("never marks optional perceptionScore as required", () => {
    const m = metrics({ perceptionScore: undefined });
    const report = validateRawMetrics(m, { category: "engineering", year: 2025 });
    expect(report.summary.finalScoreAvailable).toBe(false);
    expect(report.summary.complete).toBe(true);
    expect(report.summary.errorCount).toBe(0);
  });

  it("computes completeness percentage", () => {
    const report = validateRawMetrics(metrics(), { category: "engineering", year: 2025 });
    expect(report.summary.filledRequired).toBe(report.summary.totalRequired);
    expect(report.summary.completenessPercent).toBe(100);
  });

  it("throws for unsupported categories", () => {
    expect(() =>
      validateRawMetrics(metrics(), { category: "medical", year: 2025 })
    ).toThrow(/No NIRF methodology registered/);
  });
});