/**
 * Relative-parameter prediction engine (Step 4).
 *
 * predictRelativeParameters(college_raw_data, target_year, cohort_context?) →
 * a RelativeReport containing one result card per relative parameter with
 * score, status, confidence, formula line, warning box and arithmetic trace.
 *
 * Cohort context: if the caller supplies this year's applicant-pool stats use
 * them; otherwise fall back to the most recent known cohort and mark
 * cohort_context = stale (lowering confidence accordingly). PR is handled by
 * prLookup (historical_actual > rank_band_proxy, never a fabricated constant).
 */

import { computeCapped, computeCohortRatio, computeGbmScore, confidenceLabel, type RatioConfig, type CappedConfig, type PredictOptions } from "./models";
import { RELATIVE_PARAMS, RELATIVE_PARAMS_BY_KEY } from "./parameters";
import { lookupPR } from "./prLookup";
import { cohortFeatures } from "./cohort";
import type {
  CohortContext,
  RelativeModelArtifact,
  RelativeParamResult,
  RelativeRawInput,
  RelativeReport,
  RelativeFieldValue,
  RelativeFieldKey,
} from "./types";

export interface RelativeEngineOptions {
  category?: string;
  institution?: { name?: string; id?: string } | null;
  /** This year's cohort stats (from the applicant pool). If absent → stale fallback. */
  cohortContext?: CohortContext | null;
  /** Trained/shipped model artifact (benchmarks, GBMs, PR tables). */
  model?: RelativeModelArtifact | null;
}

type FieldMap = Partial<Record<RelativeFieldKey, RelativeFieldValue>>;

const DEFAULT_BENCHMARKS: Record<string, { benchmark: number; label: string }> = {
  gphd: { benchmark: 500, label: "GPHD_Benchmark_PhD_graduates (fixed target)" },
};

const RATIO_CONFIGS: Record<string, RatioConfig> = {
  pu: { key: "pu", maxMarks: 35, logScaled: true, fieldKeys: ["totalPublications"], combine: "single", syntax: "Publications (Scopus/WoS, 3-yr window)" },
  qp: { key: "qp", maxMarks: 40, logScaled: true, fieldKeys: ["totalCitations"], combine: "single", syntax: "Citations (3-yr window)" },
  ipr: { key: "ipr", maxMarks: 15, logScaled: false, fieldKeys: ["patentsGranted", "patentsFiled"], combine: "sum", syntax: "Patents (granted + filed/published)", derivedCohortKey: "iprTotalPatents" },
  fppp: { key: "fppp", maxMarks: 10, logScaled: false, fieldKeys: ["sponsoredResearchAmount", "consultancyRevenue"], combine: "sum", syntax: "Sponsored + Consultancy funds (INR)", derivedCohortKey: "fpppTotalFunds" },
};

const CAPPED_CONFIGS: Record<string, CappedConfig> = {
  gphd: { key: "gphd", maxMarks: 20, fieldKeys: ["phdGraduates"], combine: "single", benchmark: DEFAULT_BENCHMARKS.gphd.benchmark, benchmarkLabel: DEFAULT_BENCHMARKS.gphd.label, syntax: "PhD graduates (3-yr window)" },
};

export function predictRelativeParameters(
  input: RelativeRawInput,
  targetYear: number,
  opts: RelativeEngineOptions = {}
): RelativeReport {
  const category = opts.category ?? "engineering";
  const fields = input.fields ?? {};

  // ── Cohort context ──
  const model = opts.model ?? null;
  let cohortYear = targetYear;
  let cohortStats = opts.cohortContext?.stats ?? {};
  let cohortSize = opts.cohortContext?.cohortSize ?? null;
  let stale = false;
  let cohortNote = opts.cohortContext?.note ?? "caller-supplied cohort context";

  if (!opts.cohortContext) {
    if (model && model.cohort) {
      cohortYear = model.cohort.year;
      cohortStats = model.cohort.stats;
      cohortSize = model.cohort.cohortSize;
      stale = targetYear !== model.cohort.year;
      cohortNote = model.cohort.note;
    } else {
      cohortNote = "no cohort context available — cohort-dependent parameters cannot be scored";
    }
  }

  const cohortContext: CohortContext = {
    year: cohortYear,
    category,
    stats: cohortStats,
    cohortSize,
    stale,
    note: cohortNote,
  };

  const paramModel = model?.params ?? {};
  const paramByKey = (k: string) =>
    (paramModel as Record<string, unknown>)[k] as RelativeModelArtifact["params"][keyof RelativeModelArtifact["params"]] | undefined;

  // ── Per-parameter computation ──
  const params: RelativeParamResult[] = [];
  const estimatedFields: string[] = [];
  const missingFields: string[] = [];

  for (const def of RELATIVE_PARAMS) {
    const res = computeParam(
      def.key,
      fields,
      input,
      targetYear,
      cohortContext,
      paramByKey(def.key),
      model
    );
    params.push(res);
    for (const m of res.missingFields) if (!missingFields.includes(m)) missingFields.push(m);
    if (res.status === "estimated" || res.status === "low_confidence") {
      for (const sf of res.sourceFields) {
        if (sf.source === "model_estimated") {
          const nm = sf.key;
          if (!estimatedFields.includes(nm)) estimatedFields.push(nm);
        }
      }
    }
    if (res.originTag === "rank_band_proxy" || res.originTag === "historical_actual") {
      // PR only — handled
    }
  }

  const averageConfidence =
    params.length > 0 ? params.reduce((a, p) => a + p.confidence, 0) / params.length : 0;

  return {
    category,
    year: targetYear,
    institution: opts.institution ?? input.instituteName
      ? { name: input.instituteName, id: input.instituteId }
      : null,
    cohort: cohortContext,
    params,
    summary: {
      cohortYearUsed: cohortYear,
      cohortStale: stale,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      estimatedFields,
      missingFields,
    },
    methodologyNote:
      "Relative parameters are scored by NIRF against the peer cohort of that year (best performer, sometimes log-scaled), not fixed benchmarks — with the exception of SS / FRU / GPHD which saturate at fixed targets. " +
      "Each card shows its source fields, the formula or model used, an arithmetic trace incl. cohort values, and an honest confidence label. " +
      "PR comes from published results or a rank-band proxy — it is never derived from institutional data.",
  };
}

function computeParam(
  key: string,
  fields: FieldMap,
  input: RelativeRawInput,
  targetYear: number,
  cohort: CohortContext,
  artifactParam: RelativeModelArtifact["params"][keyof RelativeModelArtifact["params"]] | undefined,
  model: RelativeModelArtifact | null
): RelativeParamResult {
  const def = RELATIVE_PARAMS_BY_KEY[key];
  const baseOpts: PredictOptions = {
    year: targetYear,
    rank: input.rank ?? null,
    cohortStale: cohort.stale,
    cohortYear: cohort.year,
    cohortSize: cohort.cohortSize,
    estimatedBenchmarks: !(model?.params as Record<string, unknown> | undefined)?.[key] || (model?.seedBaseline ?? false),
  };

  let partial: Partial<RelativeParamResult>;

  if (key === "pr") {
    const pr = lookupPR({
      year: targetYear,
      collegeId: input.instituteId ?? input.instituteName ?? "",
      collegeName: input.instituteName,
      rank: input.rank ?? null,
      prHistorical: model?.prHistorical ?? {},
      prBands: model?.prBands ?? {},
    });
    const status: RelativeParamResult["status"] =
      pr.source === "historical_actual" ? "computed" : pr.score === null ? "missing_data" : "low_confidence";
    partial = {
      score: pr.score,
      status,
      strategy: "historical_or_rank_band",
      originTag: pr.source,
      confidence: pr.confidence,
      confidenceLabel: pr.confidenceLabel,
      sourceFields: [],
      formulaLine: pr.formulaLine,
      explanation: def.explanation,
      warning: pr.warning,
      hasWarning: pr.hasWarning,
      steps: pr.steps,
      flags: [],
      missingFields: pr.score === null ? ["perceptionScore"] : [],
    };
  } else if (artifactParam?.strategy === "gbm" && artifactParam.gbm) {
    const cfgRatio = RATIO_CONFIGS[key];
    const rawValue =
      cfgRatio?.combine === "single"
        ? numericOf(fields[cfgRatio.fieldKeys[0]])
        : null;
    const features = cohortFeaturesString(cfgRatio, fields, cohort, input.rank ?? null);
    const gbmRes = computeGbmScore(
      key,
      def.maxMarks,
      rawValue,
      features,
      artifactParam.gbm,
      baseOpts
    );
    partial = {
      ...gbmRes,
      status: baseOpts.cohortStale ? "low_confidence" : "computed",
      confidenceLabel: confidenceLabel(gbmRes.confidence),
      name: def.name,
      parameter: def.parameter,
      parameterWeight: def.parameterWeight,
      maxMarks: def.maxMarks,
      explanation: def.explanation,
    };
  } else if (RATIO_CONFIGS[key]) {
    const cfg = RATIO_CONFIGS[key];
    const ratioOpts: PredictOptions = {
      ...baseOpts,
      strategy: (artifactParam?.strategy ?? (cfg.logScaled ? "cohort_log_ratio" : "cohort_ratio")) as PredictOptions["strategy"],
    };
    const ratioRes = computeCohortRatio(cfg, fields, cohort.stats, ratioOpts);
    let strategy = (artifactParam?.strategy ?? (cfg.logScaled ? "cohort_log_ratio" : "cohort_ratio")) as RelativeParamResult["strategy"];
    const estimated = ratioRes.missingFields.length > 0;
    partial = {
      ...ratioRes,
      strategy,
      status: estimated ? "estimated" : cohort.stale ? "low_confidence" : "computed",
      confidenceLabel: confidenceLabel(ratioRes.confidence),
      name: def.name,
      parameter: def.parameter,
      parameterWeight: def.parameterWeight,
      maxMarks: def.maxMarks,
      explanation: def.explanation,
    };
  } else if (CAPPED_CONFIGS[key]) {
    const cfg = CAPPED_CONFIGS[key];
    const benchmark = artifactParam?.benchmark ?? cfg.benchmark;
    const cappedOpts: PredictOptions = {
      ...baseOpts,
      benchmark,
      benchmarkLabel: artifactParam ? `fixed benchmark (${benchmark})` : DEFAULT_BENCHMARKS[key].label,
      strategy: "linear_capped",
    };
    const cappedRes = computeCapped({ ...cfg, benchmark }, fields, cohort.stats, cappedOpts);
    const estimated = cappedRes.missingFields.length > 0;
    partial = {
      ...cappedRes,
      status: estimated ? "estimated" : cohort.stale ? "low_confidence" : "computed",
      confidenceLabel: confidenceLabel(cappedRes.confidence),
      name: def.name,
      parameter: def.parameter,
      parameterWeight: def.parameterWeight,
      maxMarks: def.maxMarks,
      explanation: def.explanation,
    };
  } else {
    partial = {
      score: null,
      status: "missing_data",
      strategy: "historical_or_rank_band",
      originTag: "model_prediction",
      confidence: 0,
      confidenceLabel: "Low",
      sourceFields: [],
      formulaLine: `${def.code} could not be computed — no model/config available.`,
      explanation: def.explanation,
      hasWarning: true,
      warning: `No scoring configuration exists for ${def.code} in this module build.`,
      steps: [],
      flags: [],
      missingFields: def.inputFields as unknown as string[],
    };
  }

  const finalRes: RelativeParamResult = {
    key,
    code: def.code,
    name: def.name,
    parameter: def.parameter,
    parameterWeight: def.parameterWeight,
    maxMarks: def.maxMarks,
    score: (partial.score as number | null) ?? null,
    status: (partial.status as RelativeParamResult["status"]) ?? "missing_data",
    strategy: (partial.strategy as RelativeParamResult["strategy"]) ?? "historical_or_rank_band",
    originTag: (partial.originTag as RelativeParamResult["originTag"]) ?? "model_prediction",
    confidence: partial.confidence ?? 0,
    confidenceLabel: partial.confidenceLabel ?? "Low",
    sourceFields: (partial.sourceFields as RelativeFieldValue[]) ?? [],
    formulaLine: partial.formulaLine ?? "",
    explanation: partial.explanation ?? "",
    warning: partial.warning,
    hasWarning: partial.hasWarning ?? false,
    steps: partial.steps ?? [],
    flags: partial.flags ?? [],
    missingFields: partial.missingFields ?? [],
  };
  return finalRes;
}

function numericOf(fv?: RelativeFieldValue): number | null {
  return fv && typeof fv.value === "number" && Number.isFinite(fv.value) ? fv.value : null;
}

function cohortFeaturesString(
  cfg: RatioConfig | undefined,
  fields: FieldMap,
  cohort: CohortContext,
  rank: number | null
): number[] {
  const raw = cfg ? numericOf(fields[cfg.fieldKeys[0]]) : null;
  const stats = cfg ? cohort.stats[cfg.fieldKeys[0]] : undefined;
  return cohortFeatures(raw, stats, rank, cohort.cohortSize);
}