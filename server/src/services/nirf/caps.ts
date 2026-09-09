/**
 * NIRF normalization is now implemented directly in the engine using
 * the official formula structure with calibrated caps. This module
 * is kept for backward compatibility but is no longer used by the engine.
 */
import type { NIRFCategory } from "../../types/metrics";

export interface CategoryCaps {
  ss: number;
  fsr: number;
  fqe: number;
  fru: number;
  pu: number;
  qp: number;
  ipr: number;
  fppp: number;
  gphel: number;
  gue: number;
  ms: number;
  gphd: number;
  oi: number;
}

const caps: Record<NIRFCategory, CategoryCaps> = {
  overall: { ss: 15000, fsr: 25, fqe: 1.0, fru: 12, pu: 2.5, qp: 0.30, ipr: 0.05, fppp: 15, gphel: 1.0, gue: 1.0, ms: 20, gphd: 200, oi: 1.0 },
  engineering: { ss: 12000, fsr: 25, fqe: 1.0, fru: 15, pu: 2.5, qp: 0.30, ipr: 0.05, fppp: 15, gphel: 1.0, gue: 1.0, ms: 20, gphd: 150, oi: 1.0 },
  university: { ss: 20000, fsr: 25, fqe: 1.0, fru: 12, pu: 2.5, qp: 0.30, ipr: 0.05, fppp: 15, gphel: 1.0, gue: 1.0, ms: 18, gphd: 300, oi: 1.0 },
  management: { ss: 5000, fsr: 20, fqe: 1.0, fru: 15, pu: 1.5, qp: 0.25, ipr: 0.02, fppp: 20, gphel: 1.0, gue: 1.0, ms: 30, gphd: 50, oi: 1.0 },
  pharmacy: { ss: 5000, fsr: 20, fqe: 1.0, fru: 10, pu: 2.0, qp: 0.25, ipr: 0.05, fppp: 10, gphel: 1.0, gue: 1.0, ms: 12, gphd: 80, oi: 1.0 },
  medical: { ss: 3000, fsr: 15, fqe: 1.0, fru: 20, pu: 3.0, qp: 0.30, ipr: 0.05, fppp: 15, gphel: 1.0, gue: 1.0, ms: 15, gphd: 100, oi: 1.0 },
  architecture: { ss: 3000, fsr: 20, fqe: 1.0, fru: 10, pu: 1.5, qp: 0.20, ipr: 0.02, fppp: 10, gphel: 1.0, gue: 1.0, ms: 12, gphd: 30, oi: 1.0 },
};

export function getCaps(category: NIRFCategory): CategoryCaps {
  return caps[category];
}

export function capDefined(cat: NIRFCategory, key: keyof CategoryCaps): boolean {
  const val = caps[cat]?.[key];
  return val !== undefined && val !== null && !Number.isNaN(val);
}
