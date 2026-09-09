import { describe, it, expect } from "vitest";
import { computeScore } from "../services/nirf/engine";
import type { RawMetrics } from "../types/metrics";

function fullMetrics(overrides: Partial<RawMetrics> = {}): RawMetrics {
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
    womenStudents: 2400,
    womenFaculty: 100,
    studentsOtherStates: 1600,
    studentsOtherCountries: 200,
    escsStudents: 1200,
    pcsFacilities: true,
    perceptionScore: 70,
    ...overrides,
  };
}

describe("computeScore", () => {
  it("returns a valid score between 0 and 100", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    expect(res.finalScore).not.toBeNull();
    expect(res.finalScore!).toBeGreaterThanOrEqual(0);
    expect(res.finalScore!).toBeLessThanOrEqual(100);
  });

  it("returns all 5 parameters", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    expect(res.parameters).toHaveLength(5);
    const keys = res.parameters.map((p) => p.parameter);
    expect(keys).toEqual(["TLR", "RP", "GO", "OI", "PR"]);
  });

  it("has correct parameter weights", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    const weights = Object.fromEntries(res.parameters.map((p) => [p.parameter, p.weight]));
    expect(weights.TLR).toBe(0.3);
    expect(weights.RP).toBe(0.3);
    expect(weights.GO).toBe(0.2);
    expect(weights.OI).toBe(0.1);
    expect(weights.PR).toBe(0.1);
  });

  it("weighted scores sum to final score", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    const sum = res.parameters.reduce((a, p) => a + p.weightedScore, 0);
    expect(res.finalScore).toBeCloseTo(sum, 1);
  });

  it("renormalizes and reports partial when inputs are missing (no silent zero)", () => {
    const m = fullMetrics({ permanentFaculty: undefined as any });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    const tlr = res.parameters.find((p) => p.parameter === "TLR")!;
    const fsr = tlr.subs.find((s) => s.key === "fsr")!;
    const fqe = tlr.subs.find((s) => s.key === "fqe")!;
    expect(fsr.status).toBe("insufficient_data");
    expect(fqe.status).toBe("insufficient_data");
    expect(tlr.status).toBe("partial");
    expect(tlr.unweightedScore).not.toBeNull(); // renormalized, not dropped
    expect(res.partialParams).toContain("TLR");
    expect(res.renormalizedFinalScore).not.toBeNull();
    // FQE lists its block-level blocker rather than inventing a value.
    expect(fqe.missingFields).toContain("permanentFaculty");
  });

  it("handles zero student counts gracefully", () => {
    const m = fullMetrics({
      sanctionedIntake: 0,
      enrolledStudents: 0,
      phdStudents: 0,
    });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    expect(res.parameters.length).toBe(5);
  });

  it("applies retraction penalty within PU/QP sub-scores", () => {
    const base = computeScore(fullMetrics({ retractedPapers: 0, retractedCitations: 0 }), {
      category: "engineering",
      year: 2025,
    });
    const penalized = computeScore(fullMetrics({ retractedPapers: 5, retractedCitations: 20 }), {
      category: "engineering",
      year: 2025,
    });
    const rp = penalized.parameters.find((p) => p.parameter === "RP")!;
    const penPU = penalized.parameters.find((p) => p.parameter === "RP")!.subs.find((s) => s.key === "pu")!.score as number;
    const basePU = base.parameters.find((p) => p.parameter === "RP")!.subs.find((s) => s.key === "pu")!.score as number;
    const penQP = penalized.parameters.find((p) => p.parameter === "RP")!.subs.find((s) => s.key === "qp")!.score as number;
    const baseQP = base.parameters.find((p) => p.parameter === "RP")!.subs.find((s) => s.key === "qp")!.score as number;
    expect(penPU).toBeLessThan(basePU);
    expect(penQP).toBeLessThan(baseQP);
  });

  it("never lets retractions drive a sub-score below zero", () => {
    const res = computeScore(fullMetrics({ retractedPapers: 100, retractedCitations: 500 }), {
      category: "engineering",
      year: 2025,
    });
    const rp = res.parameters.find((p) => p.parameter === "RP")!;
    for (const s of rp.subs) {
      expect((s.score as number) ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it("scores PR from perception input", () => {
    const high = computeScore(fullMetrics({ perceptionScore: 95 }), {
      category: "engineering",
      year: 2025,
    });
    const low = computeScore(fullMetrics({ perceptionScore: 20 }), {
      category: "engineering",
      year: 2025,
    });
    const highPR = high.parameters.find((p) => p.parameter === "PR")!;
    const lowPR = low.parameters.find((p) => p.parameter === "PR")!;
    expect(highPR.weightedScore).toBeGreaterThan(lowPR.weightedScore);
  });

  it("handles missing perception score as insufficient", () => {
    const m = fullMetrics({ perceptionScore: undefined });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    const pr = res.parameters.find((p) => p.parameter === "PR")!;
    expect(pr.unweightedScore).toBeNull();
    expect(pr.subs[0].status).toBe("insufficient_data");
  });

  it("reflects PCS facilities in OI", () => {
    const withPCS = computeScore(fullMetrics({ pcsFacilities: true }), {
      category: "engineering",
      year: 2025,
    });
    const withoutPCS = computeScore(fullMetrics({ pcsFacilities: false }), {
      category: "engineering",
      year: 2025,
    });
    const oiWith = withPCS.parameters.find((p) => p.parameter === "OI")!;
    const oiWithout = withoutPCS.parameters.find((p) => p.parameter === "OI")!;
    expect(oiWith.weightedScore).toBeGreaterThanOrEqual(oiWithout.weightedScore);
  });

  it("TLR sub-scores are correctly computed", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    const tlr = res.parameters.find((p) => p.parameter === "TLR")!;
    expect(tlr.subs).toHaveLength(4);
    expect(tlr.subs.map((s) => s.key)).toEqual(["ss", "fsr", "fqe", "fru"]);
  });

  it("RP sub-scores are correctly computed", () => {
    const res = computeScore(fullMetrics(), { category: "engineering", year: 2025 });
    const rp = res.parameters.find((p) => p.parameter === "RP")!;
    expect(rp.subs).toHaveLength(4);
    expect(rp.subs.map((s) => s.key)).toEqual(["pu", "qp", "ipr", "fppp"]);
  });

  it("higher OP results in higher (better) final score", () => {
    const low = computeScore(fullMetrics({ operationalExpenditure: 50_000_000 }), {
      category: "engineering",
      year: 2025,
    });
    const high = computeScore(fullMetrics({ operationalExpenditure: 500_000_000 }), {
      category: "engineering",
      year: 2025,
    });
    expect(high.finalScore).toBeGreaterThan(low.finalScore!);
  });

  it("higher perception results in higher final score", () => {
    const low = computeScore(fullMetrics({ perceptionScore: 20 }), {
      category: "engineering",
      year: 2025,
    });
    const high = computeScore(fullMetrics({ perceptionScore: 95 }), {
      category: "engineering",
      year: 2025,
    });
    expect(high.finalScore).toBeGreaterThan(low.finalScore!);
  });

  it("marks a parameter insufficient only when it has no computable sub-score", () => {
    const m = fullMetrics({
      graduatesPlaced: undefined as any,
      graduatesHigherStudies: undefined as any,
      graduatesInTime: undefined as any,
      medianSalary: undefined as any,
      phdGraduates: undefined as any,
    });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    expect(res.hasInsufficientData).toBe(true);
    expect(res.insufficientParams).toContain("GO");
    expect(res.finalScore).toBeNull();
    expect(res.renormalizedFinalScore).not.toBeNull();
  });
});

describe("computeScore — partial / renormalization semantics", () => {
  it("treats missing bibliometrics as external-source missing, not zero", () => {
    const m = fullMetrics({
      totalPublications: undefined,
      totalCitations: undefined,
      top25Citations: undefined,
      retractedPapers: undefined,
      retractedCitations: undefined,
    });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    const rp = res.parameters.find((p) => p.parameter === "RP")!;
    const pu = rp.subs.find((s) => s.key === "pu")!;
    const qp = rp.subs.find((s) => s.key === "qp")!;
    expect(pu.status).toBe("insufficient_data");
    expect(qp.status).toBe("insufficient_data");
    expect(pu.score).toBeNull();
    expect(qp.score).toBeNull();
    expect(rp.status).toBe("partial"); // renormalized over IPR + FPPP only
    expect(rp.subs.find((s) => s.key === "ipr")!.status).toBe("ok");
    expect(res.partialParams).toContain("RP");
    expect(res.renormalizedFinalScore).not.toBeNull();
  });

  it("does not fabricate a faculty-PhD ratio when facultyWithPhD is missing", () => {
    const withFQE = computeScore(fullMetrics({ facultyWithPhD: 300 }), {
      category: "engineering",
      year: 2025,
    });
    const withoutFQE = computeScore(fullMetrics({ facultyWithPhD: undefined }), {
      category: "engineering",
      year: 2025,
    });
    const a = withFQE.parameters.find((p) => p.parameter === "TLR")!.subs.find((s) => s.key === "fqe")!;
    const b = withoutFQE.parameters.find((p) => p.parameter === "TLR")!.subs.find((s) => s.key === "fqe")!;
    expect(b.status).toBe("partial");
    expect(b.missingFields).toContain("facultyWithPhD");
    expect(b.score).not.toBeNull(); // still scores FE part, renormalized at parameter level
  });

  it("does not silently zero citations when they are absent", () => {
    const res = computeScore(fullMetrics({ totalCitations: undefined }), {
      category: "engineering",
      year: 2025,
    });
    const qp = res.parameters.find((p) => p.parameter === "RP")!.subs.find((s) => s.key === "qp")!;
    expect(qp.status).toBe("insufficient_data");
    expect(qp.score).toBeNull();
  });

  it("scores WD from whichever of student/faculty women data is present", () => {
    const res = computeScore(fullMetrics({ womenFaculty: undefined }), {
      category: "engineering",
      year: 2025,
    });
    const wd = res.parameters.find((p) => p.parameter === "OI")!.subs.find((s) => s.key === "wd")!;
    expect(wd.status).toBe("partial");
    expect(wd.missingFields).toContain("womenFaculty");
    expect(wd.score).not.toBeNull();
  });

  it("leaves a missing expenditure side as partial FRU, not zero", () => {
    const res = computeScore(fullMetrics({ operationalExpenditure: undefined }), {
      category: "engineering",
      year: 2025,
    });
    const fru = res.parameters.find((p) => p.parameter === "TLR")!.subs.find((s) => s.key === "fru")!;
    expect(fru.status).toBe("partial");
    expect(fru.missingFields).toContain("operationalExpenditure");
    expect(fru.score).not.toBeNull();
  });

  it("produces no renormalized score when every parameter is insufficient", () => {
    const m = fullMetrics({
      sanctionedIntake: undefined,
      enrolledStudents: undefined,
      phdStudents: undefined,
      permanentFaculty: undefined,
      facultyWithPhD: undefined,
      facultyExp0to8: undefined,
      facultyExp8to15: undefined,
      facultyExp15plus: undefined,
      capitalExpenditure: undefined,
      operationalExpenditure: undefined,
      sponsoredResearchAmount: undefined,
      consultancyRevenue: undefined,
      graduatesPlaced: undefined,
      graduatesHigherStudies: undefined,
      graduatesInTime: undefined,
      medianSalary: undefined,
      phdGraduates: undefined,
      patentsFiled: undefined,
      patentsGranted: undefined,
      womenStudents: undefined,
      womenFaculty: undefined,
      studentsOtherStates: undefined,
      studentsOtherCountries: undefined,
      escsStudents: undefined,
      pcsFacilities: undefined,
      perceptionScore: undefined,
    });
    const res = computeScore(m, { category: "engineering", year: 2025 });
    expect(res.renormalizedFinalScore).toBeNull();
    expect(res.finalScore).toBeNull();
  });
});
