import { describe, it, expect } from "vitest";
import { getCaps, capDefined } from "../services/nirf/caps";
import type { NIRFCategory } from "../types/metrics";

describe("getCaps", () => {
  const categories: NIRFCategory[] = [
    "overall",
    "engineering",
    "university",
    "management",
    "pharmacy",
    "medical",
    "architecture",
  ];

  it.each(categories)("returns caps for %s", (cat) => {
    const caps = getCaps(cat);
    expect(caps).toBeDefined();
    expect(caps.ss).toBeGreaterThan(0);
    expect(caps.fsr).toBeGreaterThan(0);
    expect(caps.fqe).toBeGreaterThan(0);
    expect(caps.fru).toBeGreaterThan(0);
    expect(caps.pu).toBeGreaterThan(0);
    expect(caps.qp).toBeGreaterThan(0);
    expect(caps.ipr).toBeGreaterThan(0);
    expect(caps.fppp).toBeGreaterThan(0);
    expect(caps.gphel).toBeGreaterThan(0);
    expect(caps.gue).toBeGreaterThan(0);
    expect(caps.ms).toBeGreaterThan(0);
    expect(caps.gphd).toBeGreaterThan(0);
    expect(caps.oi).toBeGreaterThan(0);
  });

  it("engineering has higher expenditure cap than pharmacy", () => {
    expect(getCaps("engineering").fru).toBeGreaterThan(getCaps("pharmacy").fru);
  });

  it("management has higher salary cap than engineering", () => {
    expect(getCaps("management").ms).toBeGreaterThan(getCaps("engineering").ms);
  });
});

describe("capDefined", () => {
  it("returns true for defined caps", () => {
    expect(capDefined("engineering", "ss")).toBe(true);
    expect(capDefined("engineering", "ms")).toBe(true);
    expect(capDefined("engineering", "pu")).toBe(true);
  });

  it("returns false for non-existent key", () => {
    expect(capDefined("engineering", "nonexistent" as any)).toBe(false);
  });
});
