import { Request, Response } from "express";
import { predictRelativeParameters } from "../services/nirf/relative/engine";
import { loadRelativeModel, saveRelativeModel, artifactPath } from "../services/nirf/relative/loader";
import { parseRelativeDatasetJson, parseRelativeDatasetCsv, buildSeedBaselineDataset } from "../services/nirf/relative/dataset";
import { runRelativeTraining } from "../services/nirf/relative/train";
import { RELATIVE_PARAMS } from "../services/nirf/relative/parameters";
import type { RelativeFieldKey, RelativeFieldValue, RelativeRawInput } from "../services/nirf/relative/types";
import fs from "fs";

const VALID_FIELD_KEYS = new Set<RelativeFieldKey>([
  "capitalExpenditure", "operationalExpenditure", "totalPublications", "totalCitations", "top25Citations",
  "patentsFiled", "patentsGranted", "sponsoredResearchAmount", "consultancyRevenue", "phdGraduates",
]);

function normalizeRawInput(body: any): RelativeRawInput {
  const raw = body?.raw ?? body?.fields ?? {};
  const fields: Partial<Record<RelativeFieldKey, RelativeFieldValue>> = {};

  for (const [k, v] of Object.entries(raw)) {
    if (!VALID_FIELD_KEYS.has(k as RelativeFieldKey)) continue;
    let value: number | null = null;
    let source: RelativeFieldValue["source"] = "from_dcs_pdf";
    let basis: string | undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
      value = v;
    } else if (v && typeof v === "object") {
      const ov = v as { value?: unknown; source?: unknown; basis?: unknown };
      value = typeof ov.value === "number" && Number.isFinite(ov.value) ? ov.value : null;
      source = (ov.source as RelativeFieldValue["source"]) ?? "from_dcs_pdf";
      basis = typeof ov.basis === "string" ? ov.basis : undefined;
    }
    fields[k as RelativeFieldKey] = { key: k as RelativeFieldKey, value, source, basis };
  }

  return {
    instituteName: body?.instituteName ?? body?.collegeName,
    instituteId: body?.instituteId ?? body?.collegeId,
    rank: body?.rank ?? null,
    fields,
  };
}

/** POST /api/relative/predict */
export async function predictRelative(req: Request, res: Response) {
  const body = req.body ?? {};
  const model = loadRelativeModel();
  const input = normalizeRawInput(body);

  if (model && model.seedBaseline) {
    // surface the honesty flag to the caller
  }

  const year = Number(body?.year ?? 2025);

  // optional caller-supplied cohort context (this year's actual applicant-pool stats)
  let cohortContext = undefined;
  if (body?.cohortContext && typeof body.cohortContext === "object") {
    const cc = body.cohortContext;
    cohortContext = {
      year: Number(cc.year ?? year),
      category: cc.category ?? "engineering",
      stats: cc.stats ?? {},
      cohortSize: cc.cohortSize ?? null,
      stale: Boolean(cc.stale),
      note: cc.note ?? "caller-supplied cohort context",
    };
  }

  try {
    const report = predictRelativeParameters(input, year, {
      category: "engineering",
      institution: input.instituteName ? { name: input.instituteName, id: input.instituteId } : null,
      cohortContext,
      model,
    });
    return res.json({
      report,
      modelMeta: {
        seedBaseline: model?.seedBaseline ?? false,
        trainYears: model?.trainYears ?? [],
        validateYear: model?.validateYear ?? null,
        provenanceNote: model?.provenanceNote ?? "",
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Relative prediction failed", detail: String(err) });
  }
}

/** POST /api/relative/train */
export async function trainRelative(req: Request, res: Response) {
  const body = req.body ?? {};
  const trainYears = Array.isArray(body?.trainYears) ? body.trainYears.map(Number) : [2023, 2024];
  const validateYear = Number(body?.validateYear ?? 2025);
  const tolerance = Number(body?.tolerance ?? 2);

  let dataset: import("../services/nirf/relative/types").RelativeTrainingRecord[] | null = null;

  if (req.file) {
    const text = req.file.buffer.toString("utf-8");
    const isCsv =
      req.file.mimetype === "text/csv" ||
      /\.csv$/i.test(req.file.originalname) ||
      text.trimLeft().startsWith("college_id");
    try {
      dataset = isCsv ? parseRelativeDatasetCsv(text) : parseRelativeDatasetJson(JSON.parse(text));
    } catch (err) {
      return res.status(422).json({ error: "Dataset file could not be parsed", detail: String(err) });
    }
  } else if (Array.isArray(body.dataset)) {
    dataset = parseRelativeDatasetJson(body.dataset);
  } else if (body.useBaseline === true) {
    dataset = buildSeedBaselineDataset();
  } else {
    return res.status(400).json({
      error: "Provide a `dataset` array (Step-1 records), a CSV/JSON file, or useBaseline=true.",
      schema:
        "dataset: [{ college_id, college_name, year, rank, raw_inputs: {fieldKey: number}, raw_sources: {fieldKey: 'from_dcs_pdf'|'cross_validated_web'}, targets: {pu,qp,ipr,fppp,gphd,pr} }]",
    });
  }

  try {
    const result = runRelativeTraining(dataset, {
      trainYears,
      validateYear,
      tolerance,
      category: "engineering",
    });
    saveRelativeModel(result.artifact);
    // persist the baseline error report for future retrain comparison (Step 10.7)
    const dir = artifactPath().replace(/relative_model\.json$/, "");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dir + "last_error_report.json", JSON.stringify(result.errorReport, null, 2), "utf-8");

    return res.json({
      model: result.artifact,
      errorReport: result.errorReport,
      regression: result.regression,
    });
  } catch (err) {
    return res.status(422).json({ error: "Training failed", detail: String(err) });
  }
}

/** GET /api/relative/model */
export function getRelativeModel(_req: Request, res: Response) {
  const model = loadRelativeModel();
  return res.json({ model, parameters: RELATIVE_PARAMS });
}

/** GET /api/relative/error-report */
export function getRelativeErrorReport(_req: Request, res: Response) {
  const dir = artifactPath().replace(/relative_model\.json$/, "");
  const reportPath = dir + "last_error_report.json";
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    return res.json({ errorReport: report });
  }
  return res.json({ errorReport: null, note: "No baseline error report yet — the train loop has not been run on real data." });
}