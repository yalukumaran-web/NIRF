import { describe, it, expect } from "vitest";
import {
  extractSubScores,
  percentile,
  normalizeFeatures,
  compositeScore,
  predictRank,
  spearman,
  defaultWeights,
  FEATURE_KEYS,
} from "../services/rankModel";
import type { SubScoreFeatures, ModelConfig } from "../services/rankModel";
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

describe("extractSubScores", () => {
  it("returns all 16 sub-scores", () => {
    const f = extractSubScores(fullMetrics(), "engineering");
    expect(f).not.toBeNull();
    expect(Object.keys(f!)).toHaveLength(FEATURE_KEYS.length);
  });

  it("returns null for insufficient data", () => {
    const m = fullMetrics({ permanentFaculty: undefined as any });
    const f = extractSubScores(m, "engineering");
    expect(f).toBeNull();
  });

  it("all sub-scores are in [0, 100]", () => {
    const f = extractSubScores(fullMetrics(), "engineering")!;
    for (const k of FEATURE_KEYS) {
      expect(f[k]).toBeGreaterThanOrEqual(0);
      expect(f[k]).toBeLessThanOrEqual(100);
    }
  });
});

describe("percentile", () => {
  it("returns 0 for value below minimum", () => {
    expect(percentile(1, [2, 3, 4, 5])).toBe(0);
  });

  it("returns 1 for value above maximum", () => {
    expect(percentile(10, [2, 3, 4, 5])).toBe(1);
  });

  it("returns 0.5 for empty array", () => {
    expect(percentile(5, [])).toBe(0.5);
  });

  it("computes correct percentile for middle value", () => {
    const sorted = [1, 2, 3, 4, 5];
    const p = percentile(3, sorted);
    expect(p).toBeGreaterThanOrEqual(0.5);
    expect(p).toBeLessThanOrEqual(1.0);
  });
});

describe("normalizeFeatures", () => {
  it("returns percentiles in [0, 1]", () => {
    const f = extractSubScores(fullMetrics(), "engineering")!;
    const bands: Record<string, number[]> = {};
    for (const k of FEATURE_KEYS) {
      bands[k] = [0, 10, 20, 30, 50, 70, 90, 100];
    }
    const norm = normalizeFeatures(f, bands);
    for (const k of FEATURE_KEYS) {
      expect(norm[k]).toBeGreaterThanOrEqual(0);
      expect(norm[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe("compositeScore", () => {
  const cfg: ModelConfig = {
    category: "engineering",
    featureOrder: [...FEATURE_KEYS],
    percentileBands: {},
    featureWeights: defaultWeights(),
    rankIntercept: 90,
    rankSlope: -85,
    n: 90,
    spearmanR: 0.85,
  };

  it("returns a non-negative score", () => {
    const f: SubScoreFeatures = {
      ss: 0.8, fsr: 0.75, fqe: 0.85, fru: 0.7,
      pu: 0.6, qp: 0.7, ipr: 0.5, fppp: 0.65,
      gph: 0.8, gue: 0.7, gms: 0.75, gphd: 0.6,
      rd: 0.6, wd: 0.55, escs: 0.5, pcs: 0.8,
    };
    const score = compositeScore(f, cfg);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("predictRank", () => {
  const cfg: ModelConfig = {
    category: "engineering",
    featureOrder: [...FEATURE_KEYS],
    percentileBands: {},
    featureWeights: defaultWeights(),
    rankIntercept: 90,
    rankSlope: -85,
    n: 90,
    spearmanR: 0.85,
  };

  it("returns rank >= 1", () => {
    const f: SubScoreFeatures = {
      ss: 0.5, fsr: 0.5, fqe: 0.5, fru: 0.5,
      pu: 0.5, qp: 0.5, ipr: 0.5, fppp: 0.5,
      gph: 0.5, gue: 0.5, gms: 0.5, gphd: 0.5,
      rd: 0.5, wd: 0.5, escs: 0.5, pcs: 0.5,
    };
    const result = predictRank(cfg, f);
    expect(result.rank).toBeGreaterThanOrEqual(1);
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
  });

  it("higher composite yields lower (better) rank", () => {
    const low: SubScoreFeatures = {
      ss: 0.1, fsr: 0.1, fqe: 0.1, fru: 0.1,
      pu: 0.1, qp: 0.1, ipr: 0.1, fppp: 0.1,
      gph: 0.1, gue: 0.1, gms: 0.1, gphd: 0.1,
      rd: 0.1, wd: 0.1, escs: 0.1, pcs: 0.1,
    };
    const high: SubScoreFeatures = {
      ss: 0.9, fsr: 0.9, fqe: 0.9, fru: 0.9,
      pu: 0.9, qp: 0.9, ipr: 0.9, fppp: 0.9,
      gph: 0.9, gue: 0.9, gms: 0.9, gphd: 0.9,
      rd: 0.9, wd: 0.9, escs: 0.9, pcs: 0.9,
    };
    const lowResult = predictRank(cfg, low);
    const highResult = predictRank(cfg, high);
    expect(highResult.rank).toBeLessThan(lowResult.rank);
  });
});

describe("spearman", () => {
  it("returns 1 for identical ranks", () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 2);
  });

  it("returns -1 for perfectly inverted ranks", () => {
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 2);
  });

  it("returns low correlation for scrambled data", () => {
    const r = spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    expect(r).toBeCloseTo(-1, 1);
  });
});

describe("defaultWeights", () => {
  it("returns weights for all features", () => {
    const w = defaultWeights();
    expect(Object.keys(w)).toHaveLength(FEATURE_KEYS.length);
  });

  it("all weights are positive", () => {
    const w = defaultWeights();
    for (const v of Object.values(w)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
