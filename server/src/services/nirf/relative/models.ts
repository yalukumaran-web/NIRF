/**
 * Per-parameter prediction models (Step 3).
 *
 * Strategy per parameter, decided by Step-2 style reasoning:
 *  - cohort_ratio / cohort_log_ratio  (PU, QP, IPR, FPPP, GPH, MS):
 *      score = maxMarks × min(normalized(raw) / normalized(cohort_max), 1)
 *    log-scaled where the raw metric is right-skewed (publications, citations).
 *  - linear_capped (SS, FRU, GPHD):
 *      linear up to a fixed benchmark, then flat at maxMarks.
 *  - gbm: gradient-boosted regressor with features
 *      [raw, cohort_max, cohort_median, cohort_std, rank_within_cohort]
 *      (used when the trainer shows the simple formula underperforms).
 *  - historical_or_rank_band (PR): see prLookup.ts.
 *
 * Every intermediate value is recorded as a trace step; every estimated or
 * fallback input is surfaced as a warning naming the actual field, and each
 * prediction carries an honest confidence label.
 */

import type {
  CohortStats,
  RelativeFieldKey,
  RelativeFieldValue,
  RelativeFlag,
  RelativeGbmModel,
  RelativeParamResult,
  RelativeStep,
  SourceTag,
} from "./types";

export interface RatioConfig {
  key: string; // "pu" etc.
  maxMarks: number;
  logScaled: boolean;
  /** Field values consulted in order. */
  fieldKeys: RelativeFieldKey[];
  /** How the raw metric value is combined from the field values. */
  combine: "single" | "sum" | "rate" | "log";
  syntax: string; // human summary of what the metric is (for trace labels)
  /** Cohort-max denominator for combined metrics (e.g. derived "iprTotalPatents"). */
  derivedCohortKey?: string;
}

export interface CappedConfig {
  key: string;
  maxMarks: number;
  fieldKeys: RelativeFieldKey[];
  combine: "single" | "sum" | "per_student";
  /** Fixed benchmark at which full marks are awarded. */
  benchmark: number;
  benchmarkLabel: string;
  /** Human summary of the metric (for trace labels). */
  syntax: string;
}

export interface PredictOptions {
  year: number;
  rank: number | null;
  strategy?: "cohort_ratio" | "cohort_log_ratio" | "linear_capped" | "gbm";
  gbm?: RelativeGbmModel;
  benchmark?: number;
  benchmarkLabel?: string;
  cohortStale: boolean;
  cohortYear: number;
  cohortSize: number | null;
  estimatedBenchmarks?: boolean;
}

type Num = number | null | undefined;

function num(v: Num): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function logPos(x: number): number {
  return Math.log(1 + Math.max(x, 0));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function step(label: string, equation: string, result: number | string | null): RelativeStep {
  return {
    label,
    equation,
    result: typeof result === "number" && Number.isFinite(result) ? Number(result.toFixed(6)) : result,
  };
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(round2(n)));

interface ResolvedValue {
  value: number;
  source: SourceTag;
  estimated: boolean;
  basis: string;
}

/**
 * Resolve a raw numeric input, using the cohort median as an explicit,
 * flagged fallback when the value is missing (never silent).
 */
function resolveField(
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  key: RelativeFieldKey,
  cohort: CohortStats,
  omitFromMissing?: boolean
): ResolvedValue {
  void omitFromMissing;
  const fv = fields[key];
  const direct = fv ? num(fv.value) : null;
  if (direct !== null && fv) {
    return {
      value: direct,
      source: fv.source && fv.source !== "missing" ? fv.source : "from_dcs_pdf",
      estimated: false,
      basis: fv.basis ?? `raw ${key} (${fv.source ?? "from_dcs_pdf"})`,
    };
  }
  // Fallback to cohort median — explicit, flagged.
  const med = num(cohort[key]?.median);
  if (med !== null && med > 0) {
    return {
      value: med,
      source: "model_estimated",
      estimated: true,
      basis: `NOT FOUND in source — using cohort-median fallback (${med}) [estimated]`,
    };
  }
  return {
    value: 0,
    source: "missing",
    estimated: true,
    basis: `${key} missing and cohort median unavailable — treated as absent`,
  };
}

const VALID_SOURCES: SourceTag[] = ["from_dcs_pdf", "cross_validated_web", "historical_actual"];

// ── Cohort-ratio family ──────────────────────────────────────────────────────

export function computeCohortRatio(
  cfg: RatioConfig,
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  cohort: CohortStats,
  opts: PredictOptions
): Pick<
  RelativeParamResult,
  "score" | "steps" | "flags" | "formulaLine" | "confidence" | "originTag" | "strategy" | "missingFields" | "sourceFields" | "hasWarning" | "warning"
> {
  const steps: RelativeStep[] = [];
  const flags: RelativeFlag[] = [];
  const missing: string[] = [];
  const sourceFields: RelativeFieldValue[] = [];

  const rawMetric: ResolvedValue =
    cfg.combine === "sum"
      ? combineSum(cfg.fieldKeys, fields, cohort, missing, sourceFields)
      : cfg.combine === "rate"
        ? combineRate(cfg.fieldKeys, fields, cohort, missing, sourceFields)
        : resolveField(fields, cfg.fieldKeys[0], cohort);

  if (rawMetric.estimated) missing.push(cfg.fieldKeys[0]);
  if (rawMetric.source === "missing") missing.push(cfg.fieldKeys[0]);

  steps.push(
    step(
      cfg.syntax + " (raw)",
      rawMetric.estimated && rawMetric.source === "missing"
        ? `${cfg.syntax}: MISSING in source — cohort median unavailable, value treated as absent`
        : rawMetric.estimated
          ? `${cfg.syntax}: ${rawMetric.basis} [estimated]`
          : `${cfg.syntax} (${rawMetric.basis}): ${fmtNum(rawMetric.value)}`,
      rawMetric.value
    )
  );

  const cohortMaxIn =
    (cfg.derivedCohortKey ? num(cohort[cfg.derivedCohortKey]?.max) : null) ??
    num(cohort[cfg.fieldKeys[0]]?.max) ??
    1;
  steps.push(
    step(
      `Cohort_${cfg.key.toUpperCase()}_Max (${opts.cohortYear})`,
      `highest ${cfg.syntax} among ${opts.cohortSize ?? "n/a"} ${opts.year} engineering applicants = ${fmtNum(cohortMaxIn)}`,
      cohortMaxIn
    )
  );

  let ratio: number;
  let gate = "";
  if (cfg.logScaled) {
    const lnRaw = logPos(rawMetric.value);
    const lnMax = logPos(cohortMaxIn);
    ratio = lnMax > 0 ? lnRaw / lnMax : 0;
    steps.push(
      step("raw ratio (log-scaled)",
        `ln(1 + ${fmtNum(rawMetric.value)}) / ln(1 + ${fmtNum(cohortMaxIn)}) = ${lnRaw.toFixed(4)} / ${lnMax.toFixed(4)} = ${ratio.toFixed(4)}`,
        ratio)
    );
  } else {
    ratio = cohortMaxIn > 0 ? rawMetric.value / cohortMaxIn : 0;
    steps.push(step("raw ratio", `${fmtNum(rawMetric.value)} / ${fmtNum(cohortMaxIn)} = ${ratio.toFixed(4)}`, ratio));
  }

  const uncapped = cfg.maxMarks * ratio;
  steps.push(step(`${cfg.key.toUpperCase()} (uncapped)`, `${cfg.maxMarks} × ${ratio.toFixed(4)} = ${uncapped.toFixed(4)}`, uncapped));

  const capped = Math.min(uncapped, cfg.maxMarks);
  const capEq =
    uncapped > cfg.maxMarks
      ? `min(${uncapped.toFixed(4)}, ${cfg.maxMarks}) = ${capped.toFixed(4)} (full marks, capped)`
      : `min(${uncapped.toFixed(4)}, ${cfg.maxMarks}) = ${uncapped.toFixed(4)} (no cap applied)`;
  steps.push(step(`cap min(·, ${cfg.maxMarks})`, capEq, capped));
  steps.push(step("Final score (rounded to 2 dp)", `${capped.toFixed(4)} → ${round2(capped)}`, round2(capped)));

  const formulaLine = cfg.logScaled
    ? `${cfg.key.toUpperCase()} = ${cfg.maxMarks} × min(ln(1 + ${cfg.syntax}) / ln(1 + Cohort_Max_${cfg.key.toUpperCase()}), 1), where Cohort_Max = ${fmtNum(cohortMaxIn)} (highest among ${opts.cohortYear} Engineering top-cohort)`
    : `${cfg.key.toUpperCase()} = ${cfg.maxMarks} × min(${cfg.syntax} / Cohort_Max_${cfg.key.toUpperCase()}, 1), where Cohort_Max = ${fmtNum(cohortMaxIn)} (highest among ${opts.cohortYear} Engineering top-cohort)`;

  const estCount = rawMetric.estimated ? 1 : 0;
  const stalePenalty = opts.cohortStale ? 0.15 : 0;
  const sourcePenalty = estCount * 0.2;
  const confidence = Math.max(0.3, Math.min(1, 0.95 - stalePenalty - sourcePenalty));
  const hasWarning = estCount > 0 || opts.cohortStale || gate.length > 0;

  let warning: string | undefined;
  if (estCount > 0) {
    warning = `${cfg.syntax} was not found in the source data (${rawMetric.basis}); the score uses an estimated value and may deviate from the actual NIRF score by an unknown margin. Confidence: ${confidenceLabel(confidence)}.`;
  } else if (opts.cohortStale) {
    warning = `Cohort context is STALE — the most recent known cohort (${opts.cohortYear}) was used instead of the actual ${opts.year} applicant pool. Score may deviate from the true ${opts.year} NIRF scoring. Confidence: ${confidenceLabel(confidence)}.`;
  }
  if (gate.length > 0) flags.push({ severity: "info", message: gate });
  if (rawMetric.estimated) flags.push({ severity: "warning", message: `${cfg.syntax} estimated — see warning box.` });

  return {
    score: round2(capped),
    steps,
    flags,
    formulaLine,
    confidence,
    originTag: "model_prediction",
    strategy: cfg.logScaled ? "cohort_log_ratio" : "cohort_ratio",
    missingFields: missing,
    sourceFields,
    hasWarning,
    warning,
  };
}

function combineSum(
  keys: RelativeFieldKey[],
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  cohort: CohortStats,
  missing: string[],
  sourceFields: RelativeFieldValue[]
): ResolvedValue {
  let sum = 0;
  let allPresent = true;
  for (const k of keys) {
    const r = resolveField(fields, k, cohort);
    sourceFields.push(fields[k] ?? { key: k, value: null, source: "missing" });
    if (r.source === "missing") allPresent = false;
    if (r.estimated && r.source === "missing") missing.push(k);
    sum += r.value;
  }
  return {
    value: sum,
    source: allPresent ? "from_dcs_pdf" : "model_estimated",
    estimated: !allPresent,
    basis: keys.map((k) => fields[k]?.basis ?? k).join("; "),
  };
}

function combineRate(
  keys: RelativeFieldKey[],
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  cohort: CohortStats,
  missing: string[],
  sourceFields: RelativeFieldValue[]
): ResolvedValue {
  // rate = (keys[0] + keys[1]) / keys[2] example; here generic: first two summed over third
  const numKeys = keys.slice(0, 2);
  const denKey = keys[2];
  let numerator = 0;
  let denominator = 1;
  let est = false;
  for (const k of numKeys) {
    const r = resolveField(fields, k, cohort);
    sourceFields.push(fields[k] ?? { key: k, value: null, source: "missing" });
    if (r.source === "missing") { missing.push(k); est = true; }
    numerator += r.value;
  }
  const d = resolveField(fields, denKey, cohort);
  sourceFields.push(fields[denKey] ?? { key: denKey, value: null, source: "missing" });
  if (d.source === "missing") { missing.push(denKey); est = true; }
  if (d.value > 0) denominator = d.value;
  return {
    value: numerator / denominator,
    source: est ? "model_estimated" : "from_dcs_pdf",
    estimated: est,
    basis: `${numKeys.join("+")} / ${denKey}`,
  };
}

// ── Linear-capped family ─────────────────────────────────────────────────────

export function computeCapped(
  cfg: CappedConfig,
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  cohort: CohortStats,
  opts: PredictOptions
): Pick<
  RelativeParamResult,
  "score" | "steps" | "flags" | "formulaLine" | "confidence" | "originTag" | "strategy" | "missingFields" | "sourceFields" | "hasWarning" | "warning"
> {
  const steps: RelativeStep[] = [];
  const flags: RelativeFlag[] = [];
  const missing: string[] = [];
  const sourceFields: RelativeFieldValue[] = [];

  const resolved = resolveCappedMetric(cfg, fields, cohort, missing, sourceFields);
  steps.push(
    step(
      `${cfg.syntax} (raw)`,
      resolved.estimated
        ? `${cfg.syntax}: ${resolved.basis} [estimated]`
        : `${cfg.syntax} (${resolved.basis}): ${fmtNum(resolved.value)}`,
      resolved.value
    )
  );

  const benchmark = opts.benchmark ?? cfg.benchmark;
  steps.push(
    step(
      cfg.benchmarkLabel,
      `fixed benchmark = ${fmtNum(benchmark)} (${opts.estimatedBenchmarks ? "calibrated baseline — verify with NIRF framework" : "framework constant"})`,
      benchmark
    )
  );

  const ratio = benchmark > 0 ? resolved.value / benchmark : 0;
  steps.push(step("ratio (uncapped)", `${fmtNum(resolved.value)} / ${fmtNum(benchmark)} = ${ratio.toFixed(4)}`, ratio));

  const uncapped = cfg.maxMarks * ratio;
  steps.push(step(`${cfg.key.toUpperCase()} (uncapped)`, `${cfg.maxMarks} × ${ratio.toFixed(4)} = ${uncapped.toFixed(4)}`, uncapped));

  const capped = Math.min(uncapped, cfg.maxMarks);
  const capEq =
    uncapped > cfg.maxMarks
      ? `min(${uncapped.toFixed(4)}, ${cfg.maxMarks}) = ${capped.toFixed(4)} (hard saturation — full marks)`
      : `min(${uncapped.toFixed(4)}, ${cfg.maxMarks}) = ${uncapped.toFixed(4)} (no cap applied)`;
  steps.push(step(`cap min(·, ${cfg.maxMarks})`, capEq, capped));
  steps.push(step("Final score (rounded to 2 dp)", `${capped.toFixed(4)} → ${round2(capped)}`, round2(capped)));

  const stalePenalty = opts.cohortStale ? 0.1 : 0;
  const estPenalty = resolved.estimated ? 0.2 : 0;
  const confidence = Math.max(0.3, Math.min(1, 0.95 - stalePenalty - estPenalty));
  const hasWarning = resolved.estimated || opts.cohortStale;

  let warning: string | undefined;
  if (resolved.estimated) {
    warning = `${cfg.syntax} could not be read from the source data (${resolved.basis}); the score uses a cohort-median estimate and may deviate from the actual NIRF score. Confidence: ${confidenceLabel(confidence)}.`;
  } else if (opts.cohortStale) {
    warning = `Cohort context is STALE — most recent known cohort (${opts.cohortYear}) used. Confidence: ${confidenceLabel(confidence)}.`;
  }

  const formulaLine = `${cfg.key.toUpperCase()} = ${cfg.maxMarks} × min(${cfg.syntax} / ${fmtNum(benchmark)}, 1), saturating at ${cfg.maxMarks} marks (fixed benchmark, not cohort-relative).`;

  return {
    score: round2(capped),
    steps,
    flags,
    formulaLine,
    confidence,
    originTag: "model_prediction",
    strategy: "linear_capped",
    missingFields: missing,
    sourceFields,
    hasWarning,
    warning,
  };
}

function resolveCappedMetric(
  cfg: CappedConfig,
  fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>>,
  cohort: CohortStats,
  missing: string[],
  sourceFields: RelativeFieldValue[]
): ResolvedValue {
  if (cfg.combine === "per_student") {
    const capKey = fields[cfg.fieldKeys.find((k) => k === "capitalExpenditure") as RelativeFieldKey];
    const opKey = fields[cfg.fieldKeys.find((k) => k === "operationalExpenditure") as RelativeFieldKey];

    const ca = capKey ? num(capKey.value) : null;
    const op = opKey ? num(opKey.value) : null;

    sourceFields.push(capKey ?? { key: "capitalExpenditure", value: null, source: "missing" });
    sourceFields.push(opKey ?? { key: "operationalExpenditure", value: null, source: "missing" });

    let est = false;
    if (ca === null) { missing.push("capitalExpenditure"); est = true; }
    if (op === null) { missing.push("operationalExpenditure"); est = true; }

    const av = ca ?? num(cohort.capitalExpenditure?.median) ?? 0;
    const ov = op ?? num(cohort.operationalExpenditure?.median) ?? 0;

    const value = av + ov;
    return {
      value,
      source: est ? "model_estimated" : "from_dcs_pdf",
      estimated: est,
      basis: `(CapitalEx ${ca !== null ? fmtNum(ca) : "EST"} + OperationalEx ${op !== null ? fmtNum(op) : "EST"})`,
    };
  }

  if (cfg.combine === "sum") {
    let sum = 0, est = false;
    for (const k of cfg.fieldKeys) {
      const fv = fields[k];
      const v = fv ? num(fv.value) : null;
      sourceFields.push(fv ?? { key: k, value: null, source: "missing" });
      if (v === null) {
        const med = num(cohort[k]?.median);
        if (med !== null) { sum += med; missing.push(k); est = true; }
        else { missing.push(k); est = true; }
      } else {
        sum += v;
      }
    }
    return {
      value: sum,
      source: est ? "model_estimated" : "from_dcs_pdf",
      estimated: est,
      basis: cfg.fieldKeys.join(" + "),
    };
  }

  const fv = fields[cfg.fieldKeys[0]];
  const v = fv ? num(fv.value) : null;
  sourceFields.push(fv ?? { key: cfg.fieldKeys[0], value: null, source: "missing" });
  if (v !== null) {
    return { value: v, source: fv!.source ?? "from_dcs_pdf", estimated: false, basis: fv!.basis ?? cfg.fieldKeys[0] };
  }
  const med = num(cohort[cfg.fieldKeys[0]]?.median);
  missing.push(cfg.fieldKeys[0]);
  if (med !== null && med > 0) {
    return {
      value: med,
      source: "model_estimated",
      estimated: true,
      basis: `NOT FOUND in source — cohort-median fallback = ${fmtNum(med)} [estimated]`,
    };
  }
  return { value: 0, source: "missing", estimated: true, basis: `${cfg.fieldKeys[0]} missing` };
}

// ── GBM route (Step 3b escalation) ───────────────────────────────────────────

export function computeGbmScore(
  key: string,
  maxMarks: number,
  rawValue: number | null,
  features: number[],
  model: RelativeGbmModel,
  opts: PredictOptions
): Pick<
  RelativeParamResult,
  "score" | "steps" | "flags" | "formulaLine" | "confidence" | "originTag" | "strategy" | "missingFields" | "sourceFields" | "hasWarning" | "warning"
> {
  const steps: RelativeStep[] = [];
  const flags: RelativeFlag[] = [];
  const raw = rawValue ?? 0;

  steps.push(step(`${key.toUpperCase()} feature vector`, `[raw=${fmtNum(features[0])}, cohort_max=${fmtNum(features[1])}, cohort_median=${fmtNum(features[2])}, cohort_std=${fmtNum(features[3])}, rank_in_cohort=${features[4].toFixed(2)}]`, features.join(", ")));

  const predicted = predictGbmLocal(model, features);
  const capped = Math.min(Math.max(predicted, 0), maxMarks);
  steps.push(step("model prediction (GBM)", `init=${model.init.toFixed(4)} + lr=${model.lr} Σ trees = ${predicted.toFixed(4)}`, predicted));
  steps.push(step(`cap min(·, ${maxMarks})`, `min(max(${predicted.toFixed(4)}, 0), ${maxMarks}) = ${capped.toFixed(4)}`, capped));
  steps.push(step("Final score (rounded to 2 dp)", `${capped.toFixed(4)} → ${round2(capped)}`, round2(capped)));

  const confidence = opts.cohortStale ? 0.72 : 0.88;
  const formulaLine = `${key.toUpperCase()} predicted via trained model (gradient-boosted regressor) using ${model.featureOrder.join(", ")} as inputs — no simple closed-form ratio applies for this cohort.`;

  return {
    score: round2(capped),
    steps,
    flags,
    formulaLine,
    confidence,
    originTag: "model_prediction",
    strategy: "gbm",
    missingFields: [],
    sourceFields: [],
    hasWarning: opts.cohortStale,
    warning: opts.cohortStale ? `Cohort context is STALE — most recent known cohort (${opts.cohortYear}) used in the features. Confidence: ${confidenceLabel(confidence)}.` : undefined,
  };
}

export function confidenceLabel(c: number): string {
  if (c >= 0.9) return "High";
  if (c >= 0.7) return "Medium";
  return "Low";
}

/** Local GBM predictor over the serialized RelativeGbmTree structure. */
export function predictGbmLocal(model: RelativeGbmModel, feats: number[]): number {
  const evalTree = (node: RelativeGbmModel["trees"][number]): number => {
    if (node.featureIndex === undefined || node.featureIndex < 0) return node.value;
    if (feats[node.featureIndex] <= node.threshold) {
      return node.left ? evalTree(node.left) : node.value;
    }
    return node.right ? evalTree(node.right) : node.value;
  };
  let s = model.init;
  for (const t of model.trees) s += model.lr * evalTree(t);
  return s;
}

export type { RelativeGbmModel as GbmModelReExport };

export const VALID_SOURCE_SET = new Set<SourceTag>(VALID_SOURCES);