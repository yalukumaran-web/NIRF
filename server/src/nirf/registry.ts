/**
 * NIRF methodology registry.
 *
 * Resolves a (category, year) pair to a MethodologyDefinition plus its
 * field catalog. Designed so that adding a new category (Management, Medical,
 * Law, ...) or a new year only requires registering a new methodology module.
 */

import type { FieldMetadata, MethodologyContext, MethodologyDef, NIRFCategory } from "./types";
import { engineering2025 } from "./methodologies/engineering/2025";
import { ENGINEERING_FIELDS } from "./fields";

type MethodologyModule = { default: MethodologyDef } | MethodologyDef;

/**
 * Register new methodologies here. A methodology is selected by (category, year).
 * Latest supported year may be omitted per year (falls back to the newest).
 */
export const METHODOLOGY_REGISTRY: Record<
  NIRFCategory,
  { defaultVersion: string; versions: Record<number, MethodologyModule> }
> = {
  engineering: {
    defaultVersion: "1.0",
    versions: {
      2025: engineering2025,
      2024: engineering2025, // 2025 framework applied to recent years unless changed
    },
  },
  overall: { defaultVersion: "0.0", versions: {} },
  university: { defaultVersion: "0.0", versions: {} },
  management: { defaultVersion: "0.0", versions: {} },
  medical: { defaultVersion: "0.0", versions: {} },
  law: { defaultVersion: "0.0", versions: {} },
  pharmacy: { defaultVersion: "0.0", versions: {} },
  architecture: { defaultVersion: "0.0", versions: {} },
  dental: { defaultVersion: "0.0", versions: {} },
  agriculture: { defaultVersion: "0.0", versions: {} },
};

function resolveModule(category: NIRFCategory, year: number): MethodologyDef | null {
  const entry = METHODOLOGY_REGISTRY[category];
  if (!entry) return null;
  const years = Object.keys(entry.versions).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return null;
  // Exact year preferred; otherwise fall back to the newest registered year
  // (e.g. 2026 submissions are scored under the latest available framework).
  const resolved = entry.versions[year] ?? entry.versions[years[0]];
  if (!resolved) return null;
  return "default" in resolved ? resolved.default : resolved;
}

export function getMethodology(
  category: NIRFCategory,
  year: number
): MethodologyContext {
  const methodology = resolveModule(category, year);
  if (!methodology) {
    throw new Error(
      `No NIRF methodology registered for category "${category}" year ${year}. ` +
        `Supported: ${Object.keys(METHODOLOGY_REGISTRY)
          .map((c) => c)
          .filter((c) => METHODOLOGY_REGISTRY[c as NIRFCategory].versions[year] || c === category)
          .join(", ")}`
    );
  }

  const fields =
    methodology.category === "engineering"
      ? ENGINEERING_FIELDS
      : methodology.fields;

  const parameters = methodology.parameters.map((p) => ({
    ...p,
    subParameters: p.subParameters.map((s) => ({ ...s })),
  }));

  return {
    category: methodology.category,
    year,
    methodology: { ...methodology, parameters, fields },
    fields: new Map<string, FieldMetadata>(fields.map((f) => [f.key, f])),
    parameterByCode: Object.fromEntries(
      parameters.map((p) => [p.code, p])
    ) as MethodologyContext["parameterByCode"],
  };
}

export function getParameterByCode(ctx: MethodologyContext, code: string) {
  return ctx.methodology.parameters.find((p) => p.code === code);
}

/** Human-readable label for the methodology table. */
export function methodologyLabel(ctx: MethodologyContext): string {
  return ctx.methodology.name;
}

export function listSupportedCategories(): { category: NIRFCategory; supportedYears: number[]; hasMethodology: boolean }[] {
  return (Object.keys(METHODOLOGY_REGISTRY) as NIRFCategory[]).map((category) => {
    const entry = METHODOLOGY_REGISTRY[category];
    return {
      category,
      supportedYears: Object.keys(entry.versions).map(Number).sort(),
      hasMethodology: Object.values(entry.versions).length > 0,
    };
  });
}