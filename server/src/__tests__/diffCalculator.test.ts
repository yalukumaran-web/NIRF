import { describe, it, expect } from "vitest";
import { computeDiff, DIFF_PARAMS } from "../services/nirf/diff/engine";
import {
  listExpectedOutput,
  resolveExpectedOutput,
  normaliseInstituteName,
  nirfIdFromText,
  slugFromFilename,
  expectedOutputCoverage,
  expectedOutputImagePath,
} from "../services/expectedOutputService";
import { EXPECTED_OUTPUT_2025 } from "../data/expectedOutput2025";
import type { AbsoluteReport, SubParamResult, SubKey } from "../services/nirf/absolute/types";

function sub(key: SubKey, score: number | null, status: SubParamResult["status"] = "computed"): SubParamResult {
  return {
    key,
    label: key.toUpperCase(),
    officialName: `${key.toUpperCase()} official name`,
    parameter: "TLR",
    parameterWeight: 0.3,
    maxMarks: 30,
    maxContribution: 9,
    score,
    contribution: score === null ? null : score / 10,
    status,
    sourceTables: ["Test table"],
    missingTables: status === "unable" ? ["Test table"] : [],
    steps: [],
    flags: [],
    officiality: "official_formula",
  };
}

function report(subs: SubParamResult[]): AbsoluteReport {
  return {
    category: "engineering",
    year: 2025,
    institution: { name: "Test Institute", id: "IR-E-U-9999" },
    inputs: {},
    subs,
    summary: {
      totalComputed: 0,
      totalMax: 34,
      availableMax: 34,
      hasUnable: subs.some((s) => s.status === "unable"),
      unableKeys: subs.filter((s) => s.status === "unable").map((s) => s.key),
    },
    methodologyNote: "test",
  };
}

const iitMadras = EXPECTED_OUTPUT_2025.find(
  (r) => r.slug === "IITMadras_Engineering_NIRF_2025"
)!;

describe("expected_output dataset", () => {
  it("covers every graph in the folder", () => {
    const coverage = expectedOutputCoverage();
    expect(coverage.imagesOnDisk).toBe(80);
    expect(coverage.records).toBe(80);
    expect(coverage.imagesWithoutValues).toEqual([]);
    expect(coverage.recordsWithoutImage).toEqual([]);
  });

  it("keeps every official value inside its published marks", () => {
    const marks: Record<string, number> = {
      fsr: 30, fqe: 20, gph: 40, gue: 15, gms: 25, rd: 30, wd: 30, escs: 20, pcs: 20, pr: 100,
    };
    for (const record of EXPECTED_OUTPUT_2025) {
      for (const [key, max] of Object.entries(marks)) {
        const value = (record.scores as unknown as Record<string, number>)[key];
        expect(value, `${record.slug}.${key}`).toBeGreaterThanOrEqual(0);
        expect(value, `${record.slug}.${key}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("stores a canonical NIRF id and a slug that matches the image", () => {
    for (const record of EXPECTED_OUTPUT_2025) {
      expect(record.nirfId).toMatch(/^IR-E-[UIC]-\d+$/);
      expect(record.image).toBe(`${record.slug}.jpg`);
    }
  });
});

describe("expected_output resolution", () => {
  it("matches on the PDF filename stem", () => {
    const match = resolveExpectedOutput({ filename: "IITMadras_Engineering_NIRF_2025.pdf" });
    expect(match?.entry.slug).toBe("IITMadras_Engineering_NIRF_2025");
    expect(match?.method).toBe("filename");
  });

  it("matches on the NIRF institute id", () => {
    const match = resolveExpectedOutput({ nirfId: "IR-E-U-0456" });
    expect(match?.entry.slug).toBe("IITMadras_Engineering_NIRF_2025");
    expect(match?.method).toBe("nirf-id");
  });

  it("matches on the institute name", () => {
    const match = resolveExpectedOutput({
      instituteName: "Indian Institute of Technology Madras",
    });
    expect(match?.entry.slug).toBe("IITMadras_Engineering_NIRF_2025");
  });

  it("does not match an unrelated upload", () => {
    expect(
      resolveExpectedOutput({ filename: "unknown_2024.pdf", instituteName: "No Such College" })
    ).toBeNull();
  });

  it("reads ids, slugs and names out of raw strings", () => {
    expect(nirfIdFromText("Institute Name: X [IR-E-I-1074]")).toBe("IR-E-I-1074");
    expect(nirfIdFromText("no id here")).toBe("");
    expect(slugFromFilename("C:/tmp/IITMadras_Engineering_NIRF_2025.pdf")).toBe(
      "IITMadras_Engineering_NIRF_2025"
    );
    expect(normaliseInstituteName("Indian Institute of Technology Madras (IR-E-U-0456)")).toBe(
      "indian institute of technology madras"
    );
  });

  it("resolves the graph file on disk", () => {
    const p = expectedOutputImagePath("IITMadras_Engineering_NIRF_2025");
    expect(p).toMatch(/expected_output[\\/]IITMadras_Engineering_NIRF_2025\.jpg$/);
    expect(expectedOutputImagePath("nope_Engineering_NIRF_2025")).toBeNull();
  });

  it("flags every entry with its matching submission PDF", () => {
    const entries = listExpectedOutput();
    expect(entries.every((e) => e.hasDatasetPdf)).toBe(true);
    expect(entries.every((e) => e.imageUrl.startsWith("/api/diff/graph/"))).toBe(true);
  });
});

describe("diff calculation", () => {
  it("compares the seven sub-parameters in the requested order", () => {
    expect(DIFF_PARAMS.map((p) => p.uiLabel)).toEqual([
      "FSR", "FQU", "GPH", "WD", "RD", "PCS", "GUE",
    ]);
    expect(DIFF_PARAMS.map((p) => p.maxMarks)).toEqual([30, 20, 40, 30, 30, 20, 15]);
  });

  it("reports delta as actual minus computed", () => {
    const subs = DIFF_PARAMS.map((p) =>
      sub(p.key, (iitMadras.scores as unknown as Record<string, number>)[p.key] - 1)
    );
    const diff = computeDiff({
      report: report(subs),
      expected: iitMadras,
      imagePath: "x.jpg",
      imageUrl: "/api/diff/graph/x",
      matchMethod: "filename",
    });

    for (const row of diff.rows) {
      expect(row.actual).not.toBeNull();
      expect(row.delta).toBeCloseTo(1, 5);
      expect(row.absDelta).toBeCloseTo(1, 5);
    }
    expect(diff.summary.compared).toBe(7);
    expect(diff.summary.total).toBe(7);
    expect(diff.summary.meanAbsDelta).toBeCloseTo(1, 5);
    expect(diff.summary.maxAbsDelta).toBeCloseTo(1, 5);
  });

  it("leaves an uncomputable sub-parameter uncompared instead of defaulting it", () => {
    const subs = DIFF_PARAMS.map((p) =>
      p.key === "fsr" ? sub(p.key, null, "unable") : sub(p.key, 10)
    );
    const diff = computeDiff({
      report: report(subs),
      expected: iitMadras,
      imagePath: "x.jpg",
      imageUrl: "/api/diff/graph/x",
      matchMethod: "filename",
    });

    const fsr = diff.rows.find((r) => r.key === "fsr")!;
    expect(fsr.mine).toBeNull();
    expect(fsr.delta).toBeNull();
    expect(fsr.status).toBe("unable");
    expect(fsr.missingTables).toContain("Test table");
    expect(fsr.note).toMatch(/could not compute/i);

    expect(diff.summary.compared).toBe(6);
    expect(diff.summary.unableKeys).toEqual(["fsr"]);
    expect(diff.rows.reduce((n, r) => n + (r.actual === null ? 1 : 0), 0)).toBe(0);
  });

  it("flags a partial computation on the row it affects", () => {
    const subs = DIFF_PARAMS.map((p) =>
      p.key === "gph" ? sub(p.key, 12, "partial") : sub(p.key, 12)
    );
    const diff = computeDiff({
      report: report(subs),
      expected: iitMadras,
      imagePath: "x.jpg",
      imageUrl: "/api/diff/graph/x",
      matchMethod: "filename",
    });
    const gph = diff.rows.find((r) => r.key === "gph")!;
    expect(gph.status).toBe("partial");
    expect(gph.note).toMatch(/incomplete source table/i);
  });

  it("reports the worst row as a share of its own max marks", () => {
    const subs = DIFF_PARAMS.map((p) => sub(p.key, 0));
    const diff = computeDiff({
      report: report(subs),
      expected: iitMadras,
      imagePath: "x.jpg",
      imageUrl: "/api/diff/graph/x",
      matchMethod: "filename",
    });
    // gph has the largest official value (31.07) of any compared row, /40.
    expect(diff.summary.maxAbsDeltaLabel).toBe("GPH");
    expect(diff.summary.maxAbsDeltaShare).toBeCloseTo(31.07 / 40, 2);
  });

  it("carries the official graph's identity into the report", () => {
    const diff = computeDiff({
      report: report(DIFF_PARAMS.map((p) => sub(p.key, 1))),
      expected: iitMadras,
      imagePath: "x.jpg",
      imageUrl: "/api/diff/graph/IITMadras_Engineering_NIRF_2025",
      matchMethod: "nirf-id",
    });
    expect(diff.expected.instituteName).toBe("Indian Institute of Technology Madras");
    expect(diff.expected.nirfId).toBe("IR-E-U-0456");
    expect(diff.expected.matchMethod).toBe("nirf-id");
    expect(diff.methodologyNote).toContain("actual − mine");
  });
});
