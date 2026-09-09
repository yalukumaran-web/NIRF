import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { METRIC_FIELDS } from "../types/metrics";
import type { ScoreResult, PredictionResult } from "../types";
import {
  Alert,
  Badge,
  Card,
  cn,
  Icon,
  ICON,
  PageHeader,
  Reveal,
} from "../components/ui";

type Source = "pdf" | "estimated_default" | "missing" | "requires_external_source";

interface ExtractedField {
  value: number | string | boolean | null;
  source: Source;
  basis: string;
}

interface ExtractResponse {
  extracted: Record<string, number | boolean | ExtractedField | undefined> & {
    fields?: Record<string, ExtractedField>;
    fieldSources?: Record<string, Source>;
    fieldBases?: Record<string, string>;
  };
  missing: string[];
  includesEstimates?: boolean;
  requiresExternalSources?: boolean;
  missingCount?: number;
  file: { original: string };
}

const SOURCE_META: Record<Source, { label: string; chip: string }> = {
  pdf: {
    label: "From PDF",
    chip: "bg-mint-200/70 text-mint-800 border-mint-300/80",
  },
  estimated_default: {
    label: "Estimated",
    chip: "bg-amber-100 text-amber-800 border-amber-300",
  },
  missing: {
    label: "Missing",
    chip: "bg-rose-100 text-rose-700 border-rose-200",
  },
  requires_external_source: {
    label: "External source",
    chip: "bg-violet-100 text-violet-700 border-violet-200",
  },
};

export default function Upload() {
  const { user, institution } = useAuth();
  const nav = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [extract, setExtract] = useState<ExtractResponse | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [bases, setBases] = useState<Record<string, string>>({});
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [error, setError] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  async function onFile(file: File) {
    setUploading(true);
    setError("");
    setUploadedFile(file);
    setPrediction(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setExtract(res.data);
      const basis = res.data.extracted.fieldBases ?? {};
      const fields = res.data.extracted.fields ?? {};
      setSources(res.data.extracted.fieldSources ?? {});
      setBases(basis);
      setAcked({});

      const init: Record<string, string> = {};
      const chk: Record<string, boolean> = {};
      for (const f of METRIC_FIELDS) {
        const rec = fields[f.key];
        const value = rec?.value;
        if (f.type === "boolean") {
          chk[f.key] = Boolean(value);
        } else {
          // Never silently default to 0/15 — leave unresolved fields blank so
          // compute stays blocked until the user supplies them.
          init[f.key] = value !== undefined && value !== null ? String(value) : "";
        }
      }
      setValues(init);
      setChecks(chk);
    } catch (e: any) {
      setError(e.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function predictRank() {
    if (!uploadedFile) return;
    setPredicting(true);
    setError("");
    const fd = new FormData();
    fd.append("file", uploadedFile);
    try {
      const res = await api.post("/predict", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPrediction(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || "Prediction failed");
    } finally {
      setPredicting(false);
    }
  }

  function setVal(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function toggleCheck(key: string) {
    setChecks((s) => ({ ...s, [key]: !s[key] }));
    setAcked((s) => ({ ...s, [key]: true }));
  }

  function blockers(): string[] {
    const problems: string[] = [];
    for (const f of METRIC_FIELDS) {
      const src = sources[f.key];
      if (f.type === "number") {
        const v = values[f.key];
        const empty = v === undefined || v.trim() === "";
        if (f.required && empty) {
          problems.push(
            `${f.label} — empty (${
              src === "requires_external_source"
                ? "requires external data (Scopus/WoS or NIRF survey)"
                : "missing from PDF"
            }).`
          );
        }
      } else if (f.required && src && src !== "pdf" && !acked[f.key]) {
        problems.push(
          `${f.label} — not read from the PDF; confirm the checkbox manually.`
        );
      }
    }
    return problems;
  }

  function submitMetrics() {
    const problems = blockers();
    if (problems.length > 0) {
      setError(`Resolve before computing:\n${problems.join("\n")}`);
      return;
    }
    setCalculating(true);
    setError("");
    const body: Record<string, any> = { year };
    for (const f of METRIC_FIELDS) {
      if (f.type === "boolean") {
        body[f.key] = !!checks[f.key];
      } else {
        const v = values[f.key];
        // Blank optional fields are omitted — never silently sent as 0.
        if (v !== undefined && v.trim() !== "") body[f.key] = Number(v);
      }
    }
    api
      .post("/metrics", body)
      .then((res) => {
        setResult(res.data.score);
        setExtract(null);
      })
      .catch((e) =>
        setError(e.response?.data?.error || "Failed to compute score")
      )
      .finally(() => setCalculating(false));
  }

  const blocked = blockers();
  const hasInteraction = extract || uploading;

  return (
    <>
      <PageHeader
        title="Upload Credentials"
        description={`${institution?.name ?? ""} · ${institution?.category ?? ""} · ${user?.email ?? ""}`}
        actions={
          <Badge tone="blue">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-soft" />
            Review required
          </Badge>
        }
      />

      <div className="mx-auto max-w-4xl space-y-5">
        {prediction ? (
          <PredictionResultView
            prediction={prediction}
            onDone={() => nav("/")}
          />
        ) : result ? (
          <ResultView
            result={result}
            onDone={() => nav("/")}
            onPredict={uploadedFile ? predictRank : undefined}
            predicting={predicting}
          />
        ) : (
          <>
            <Reveal>
              <Card className="space-y-5">
                <div>
                  <label className="label" htmlFor="year">
                    Score Year
                  </label>
                  <input
                    id="year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="input w-32"
                  />
                </div>

                <div>
                  <label className="label">Upload NIRF credentials PDF</label>
                  <label
                    className={cn(
                      "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300",
                      uploading
                        ? "border-brand-400 bg-brand-100/60"
                        : "border-brand-300/70 bg-brand-50/60 hover:border-brand-400 hover:bg-brand-100/60"
                    )}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) =>
                        e.target.files?.[0] && onFile(e.target.files[0])
                      }
                    />
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-mint-500 text-white shadow-glow transition-transform duration-300 group-hover:scale-110">
                      <Icon path={ICON.upload} className="h-6 w-6" />
                    </span>
                    <span className="mt-4 text-sm font-semibold text-brand-900">
                      {uploading ? "Parsing PDF…" : "Choose a PDF or drop it here"}
                    </span>
                    <span className="mt-1 text-xs text-brand-900/50">
                      Structured credentials PDF · auto-fills most fields
                    </span>
                  </label>
                </div>
              </Card>
            </Reveal>

            {error && (
              <Alert tone="rose" title="Error:" className="whitespace-pre-line">
                {error}
              </Alert>
            )}

            {extract && (
              <Reveal>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-200/70 pb-4">
                    <div>
                      <h2 className="font-bold text-brand-900">
                        Extracted from “{extract.file.original}”
                      </h2>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-brand-900/50">
                        Values read verbatim from the PDF are shown as “From PDF”.
                        Fields tagged “External source” must be supplied from
                        Scopus/WoS or NIRF survey data — the app never guesses
                        them. Review before computing.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Object.entries(SOURCE_META).map(([k, m]) => (
                        <span key={k} className={cn("chip border", m.chip)}>
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {blocked.length > 0 && (
                    <Alert tone="amber" title="Compute blocked.">
                      Resolve the following before calculating (no values are
                      silently assumed):
                      <ul className="mt-1 list-inside list-disc space-y-0.5">
                        {blocked.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
                    {METRIC_FIELDS.map((f, idx) => {
                      const src = sources[f.key];
                      const meta = src ? SOURCE_META[src] : null;
                      const isPdf = src === "pdf";
                      const basis = bases[f.key];
                      return (
                        <div
                          key={f.key}
                          className="mb-3 animate-fade-up"
                          style={{ animationDelay: `${idx * 20}ms` }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label className="block text-xs font-medium text-brand-900/70">
                              {f.label}{" "}
                              <span className="font-normal text-brand-900/35">
                                ({f.parameter})
                              </span>
                              {f.required && (
                                <span className="text-rose-400"> *</span>
                              )}
                            </label>
                            {meta && (
                              <span
                                title={basis}
                                className={cn("chip border", meta.chip)}
                              >
                                {meta.label}
                              </span>
                            )}
                          </div>
                          {f.type === "boolean" ? (
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!!checks[f.key]}
                                onChange={() => toggleCheck(f.key)}
                                className="h-4 w-4 rounded border-brand-300 accent-brand-600"
                              />
                              <span className="text-xs text-brand-900/60">
                                Facilities available on campus
                              </span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              value={values[f.key] ?? ""}
                              onChange={(e) => setVal(f.key, e.target.value)}
                              placeholder={
                                f.externalOnly
                                  ? "Enter external value…"
                                  : "0"
                              }
                              className={cn(
                                "input",
                                isPdf &&
                                  "border-mint-300/80 bg-mint-100/40 focus:border-mint-500 focus:ring-mint-400/25"
                              )}
                            />
                          )}
                          {basis && !isPdf && (
                            <p className="mt-1 text-[10px] leading-snug text-brand-900/45">
                              {basis}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={submitMetrics}
                    disabled={calculating || blocked.length > 0}
                    className="btn-primary w-full py-3"
                  >
                    {calculating
                      ? "Computing Score…"
                      : blocked.length > 0
                      ? "Resolve Required Fields to Compute"
                      : "Compute NIRF Score"}
                  </button>
                </Card>
              </Reveal>
            )}

            {!hasInteraction && (
              <Reveal delay={120}>
                <p className="text-sm text-brand-900/45">
                  Upload a structured PDF to auto-fill most fields, then review
                  and confirm before computing.
                </p>
              </Reveal>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ResultView({
  result,
  onDone,
  onPredict,
  predicting,
}: {
  result: ScoreResult;
  onDone: () => void;
  onPredict?: () => void;
  predicting?: boolean;
}) {
  return (
    <Reveal>
      <Card className="animate-scale-in py-10 text-center">
        <p className="text-sm font-medium text-brand-900/55">Score Computed</p>
        <p className="mt-2 text-center text-6xl font-extrabold tracking-tight text-gradient">
          {result.finalScore !== null ? result.finalScore.toFixed(1) : "—"}
        </p>
        <p className="mt-1 text-sm text-brand-900/40">Final NIRF Score / 100</p>

        {result.hasInsufficientData && (
          <Alert tone="amber" className="mx-auto mt-4 max-w-lg text-left">
            <strong>Insufficient data: </strong>
            {result.insufficientParams.join(", ")}
          </Alert>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
          {result.parameters.map((p) => (
            <div
              key={p.parameter}
              className="rounded-xl border border-brand-200/70 bg-brand-50/50 p-3 transition-colors hover:bg-brand-100/60"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-brand-900/45">
                {p.parameter}
              </p>
              <p className="mt-0.5 text-xl font-bold text-brand-900">
                {p.unweightedScore !== null ? p.weightedScore.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-brand-900/40">({p.weight * 100}% wt.)</p>
              {p.penalty ? (
                <p className="text-xs font-medium text-rose-500">
                  −{p.penalty} penalty
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button onClick={onDone} className="btn-primary">
            View Dashboard
          </button>
          {onPredict && (
            <button
              onClick={onPredict}
              disabled={predicting}
              className="btn-success"
            >
              {predicting ? "Predicting…" : "Predict Rank"}
            </button>
          )}
        </div>
      </Card>
    </Reveal>
  );
}

function PredictionResultView({
  prediction,
  onDone,
}: {
  prediction: PredictionResult;
  onDone: () => void;
}) {
  const pctScores = Object.entries(prediction.percentileScores);
  return (
    <Reveal>
      <Card className="animate-scale-in py-10 text-center">
        <p className="text-sm font-medium text-brand-900/55">Rank Prediction</p>
        <p className="mt-2 text-6xl font-extrabold tracking-tight text-gradient">
          #{prediction.predictedRank}
        </p>
        <p className="mt-1 text-sm text-brand-900/40">Predicted NIRF Rank</p>

        <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-4 text-left">
          <div className="rounded-xl border border-brand-200/70 bg-brand-50/50 p-3">
            <p className="text-xs text-brand-900/50">Composite Score</p>
            <p className="mt-0.5 text-lg font-bold text-brand-900">
              {(prediction.composite * 100).toFixed(1)}
            </p>
          </div>
          <div className="rounded-xl border border-mint-300/60 bg-mint-100/40 p-3">
            <p className="text-xs text-mint-800/60">Confidence</p>
            <p className="mt-0.5 text-lg font-bold text-mint-800">
              {(prediction.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-lg text-left">
          <h3 className="mb-2 text-sm font-semibold text-brand-900/70">
            Feature Percentiles
          </h3>
          <div className="space-y-1.5">
            {pctScores.map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-xs">
                  <span className="text-brand-900/55">{key}</span>
                  <span className="font-semibold text-brand-900">
                    {(val * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-brand-200/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-mint-500 transition-all duration-700"
                    style={{ width: `${Math.max(2, val * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {prediction.missing.length > 0 && (
          <Alert tone="amber" className="mx-auto mt-4 max-w-lg text-left">
            <strong>Missing fields: </strong>
            {prediction.missing.join(", ")}
          </Alert>
        )}

        <p className="mt-4 text-xs text-brand-900/40">
          Model: {prediction.model.n} institutions, Spearman r ={" "}
          {prediction.model.spearmanR.toFixed(3)}
        </p>

        <button onClick={onDone} className="btn-primary mt-6">
          View Dashboard
        </button>
      </Card>
    </Reveal>
  );
}