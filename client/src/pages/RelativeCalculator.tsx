import { useRef, useState } from "react";
import api from "../services/api";
import { METRIC_FIELDS } from "../types/metrics";
import type { ScoreResult } from "../types";
import RelativePredictor from "./RelativePredictor";
import {
  Alert,
  Card,
  cn,
  Icon,
  ICON,
  PageHeader,
  Reveal,
  Spinner,
} from "../components/ui";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  file: { original: string };
}

const SOURCE_META: Record<Source, { label: string; chip: string }> = {
  pdf: {
    label: "From PDF",
    chip: "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]",
  },
  estimated_default: {
    label: "Estimated",
    chip: "bg-[var(--chip-warn-bg)] text-[var(--chip-warn-text)] border-[var(--chip-warn-border)]",
  },
  missing: {
    label: "Missing",
    chip: "bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)] border-[var(--chip-danger-border)]",
  },
  requires_external_source: {
    label: "External",
    chip: "bg-[var(--chip-violet-bg)] text-[var(--chip-violet-text)] border-[var(--chip-violet-border)]",
  },
};

const PARAM_COLORS: Record<string, string> = {
  TLR: "#830000",
  RP:  "#A51F1F",
  GO:  "#C93837",
  OI:  "#275889",
  PR:  "#10253F",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function RelativeCalculator() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  // View mode: the existing NIRF-weighted scoring view (default) v/s the
  // additive relative-parameter prediction module.
  const [mode, setMode] = useState<"score" | "predict">("score");

  // extraction state
  const [extract, setExtract]   = useState<ExtractResponse | null>(null);
  const [values,  setValues]    = useState<Record<string, string>>({});
  const [checks,  setChecks]    = useState<Record<string, boolean>>({});
  const [sources, setSources]   = useState<Record<string, Source>>({});
  const [bases,   setBases]     = useState<Record<string, string>>({});
  const [acked,   setAcked]     = useState<Record<string, boolean>>({});

  // loading
  const [uploading,   setUploading]   = useState(false);
  const [calculating, setCalculating] = useState(false);

  // results / errors
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error,  setError]  = useState("");

  // ── upload PDF ──────────────────────────────────────────────────────────────
  async function onFile(file: File) {
    setUploading(true);
    setError("");
    setResult(null);
    setExtract(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data: ExtractResponse = res.data;
      setExtract(data);
      const fieldMap  = data.extracted.fields        ?? {};
      const srcMap    = data.extracted.fieldSources  ?? {};
      const basisMap  = data.extracted.fieldBases    ?? {};
      setSources(srcMap);
      setBases(basisMap);
      setAcked({});

      const init: Record<string, string>  = {};
      const chk:  Record<string, boolean> = {};
      for (const f of METRIC_FIELDS) {
        const rec   = fieldMap[f.key];
        const value = rec?.value;
        if (f.type === "boolean") {
          chk[f.key] = Boolean(value);
        } else {
          init[f.key] = value !== undefined && value !== null ? String(value) : "";
        }
      }
      setValues(init);
      setChecks(chk);
    } catch (e: any) {
      setError(e.response?.data?.error || "Upload / extraction failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── compute ─────────────────────────────────────────────────────────────────
  // Absolute-methodology sub-parameters removed from the relative calculation.
  const ABSOLUTE_SUBS = ["fsr", "fqe", "gue", "pcs", "wd", "rd"];

  function compute() {
    setCalculating(true);
    setError("");
    const body: Record<string, any> = { year };
    const manual = !hasExtract;
    for (const f of METRIC_FIELDS) {
      if (f.type === "boolean") {
        const src = sources[f.key];
        // An un-acknowledged checkbox after a PDF upload is NOT a real value —
        // omit it so the engine reports it missing (never fabricated "no").
        if (manual || src === "pdf" || acked[f.key]) body[f.key] = !!checks[f.key];
      } else {
        const v = values[f.key];
        if (v !== undefined && v.trim() !== "") body[f.key] = Number(v);
      }
    }
    // Skip the absolute-methodology sub-parameters. The remaining relative
    // parameters renormalize over their marks — no formula changes.
    body.excludedSubParameters = ABSOLUTE_SUBS;
    api
      .post("/metrics", body)
      .then((res) => setResult(res.data.score))
      .catch((e) => setError(e.response?.data?.error || "Failed to compute score"))
      .finally(() => setCalculating(false));
  }

  const hasExtract = !!extract;

  return (
    <div>
      {/* Additive mode toggle — default "score" keeps the existing view untouched */}
      <div className="mb-6 inline-flex rounded-xl border border-[var(--border-2)] bg-[var(--surface-5)] p-1">
        <button
          onClick={() => setMode("score")}
          className={cn(
            "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
            mode === "score" ? "bg-brand-700 text-white shadow-glow" : "text-[var(--text-faint)] hover:text-[var(--text-1)]"
          )}
        >
          Parameter Calculator
        </button>
        <button
          onClick={() => setMode("predict")}
          className={cn(
            "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
            mode === "predict" ? "bg-brand-700 text-white shadow-glow" : "text-[var(--text-faint)] hover:text-[var(--text-1)]"
          )}
        >
          Prediction Module
        </button>
      </div>

      {mode === "predict" ? <RelativePredictor /> : (
      <>
      <PageHeader
        title="Relative Parameter Calculator"
        description="NIRF weighted relative scoring (TLR 30% · RP 30% · GO 20% · OI 10% · PR 10%) with full parameter breakdown. Upload a credentials PDF to auto-fill fields — every field is optional; anything not supplied is reported as missing and never fabricated."
      />

      {/* ── Step 1: upload ── */}
      {!result && (
        <Card className="mb-5 space-y-5">
          {/* Year */}
          <div>
            <label className="label" htmlFor="rel-year">Score Year</label>
            <input
              id="rel-year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input w-32"
            />
          </div>

          {/* Dropzone */}
          <div>
            <label className="label">Upload NIRF Credentials PDF</label>
            <label
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300",
                uploading
                  ? "border-brand-500/60 bg-brand-500/5"
                  : "border-[var(--border-2)] bg-[var(--surface-5)] hover:border-brand-500/40 hover:bg-brand-500/5"
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-glow transition-transform duration-300 group-hover:scale-110">
                <Icon path={ICON.upload} className="h-6 w-6" />
              </span>
              <span className="mt-5 text-sm font-semibold text-[var(--text-1)]">
                {uploading ? "Parsing PDF…" : "Choose a PDF or drop it here"}
              </span>
              <span className="mt-1.5 text-xs text-[var(--text-fainter)]">
                Structured credentials PDF &mdash; auto-fills most fields
              </span>
            </label>
          </div>
        </Card>
      )}

      {/* ── Errors ── */}
      {error && (
        <Alert tone="rose" title="Error:" className="mb-5 whitespace-pre-line">
          {error}
        </Alert>
      )}

      {/* ── Step 2: review extracted fields ── */}
      {uploading && <Spinner label="Extracting PDF…" />}

      {hasExtract && !result && (
        <Reveal>
          <Card className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-2)] pb-4">
              <div>
                <h2 className="font-bold text-[var(--text-1)]">
                  Extracted from &ldquo;{extract!.file.original}&rdquo;
                </h2>
                <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[var(--text-faint)]">
                  Values read verbatim from the PDF are marked <span className="text-emerald-400">From PDF</span>.
                  Fields tagged <span className="text-violet-400">External</span> must be supplied from
                  Scopus / WoS or NIRF survey data. Review all values before computing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(SOURCE_META).map(([k, m]) => (
                  <span key={k} className={cn("chip border", m.chip)}>{m.label}</span>
                ))}
              </div>
            </div>

            {/* All fields optional — missing inputs surface in the breakdown */}
            <Alert tone="amber" className="border-brand-500/30 bg-brand-950/20">
              All fields are optional — anything not supplied is reported as{" "}
              <span className="font-semibold text-brand-400">not available</span> below,
              never fabricated. The absolute-methodology sub-parameters{" "}
              <span className="font-semibold">FSR, FQE, GUE, PCS, WD, RD</span> are not
              calculated in the relative scoring; the remaining relative parameters are
              scored over the marks available.
            </Alert>

            {/* Fields grid */}
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {METRIC_FIELDS.map((f, idx) => {
                const src   = sources[f.key];
                const meta  = src ? SOURCE_META[src] : null;
                const isPdf = src === "pdf";
                const basis = bases[f.key];
                return (
                  <div
                    key={f.key}
                    className="mb-4 animate-fade-up"
                    style={{ animationDelay: `${idx * 20}ms` }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="block text-xs font-medium text-[var(--text-dim)]">
                        {f.label}{" "}
                        <span className="font-normal text-[var(--text-fainter)]">({f.parameter})</span>
                      </label>
                      {meta && (
                        <span title={basis} className={cn("chip border", meta.chip)}>
                          {meta.label}
                        </span>
                      )}
                    </div>

                    {f.type === "boolean" ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checks[f.key]}
                          onChange={() => {
                            setChecks((s) => ({ ...s, [f.key]: !s[f.key] }));
                            setAcked((s) => ({ ...s, [f.key]: true }));
                          }}
                          className="h-4 w-4 rounded border-[var(--border-3)] accent-brand-500"
                        />
                        <span className="text-xs text-[var(--text-faint)]">Facilities available on campus</span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.externalOnly ? "Enter external value…" : "0"}
                        className={cn(
                          "input",
                          isPdf && "border-[var(--chip-success-border)] bg-emerald-950/20 focus:border-emerald-600/50"
                        )}
                      />
                    )}

                    {basis && !isPdf && (
                      <p className="mt-1 text-[10px] leading-snug text-[var(--text-fainter)]">{basis}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Compute button */}
            <button
              onClick={compute}
              disabled={calculating}
              className="btn-primary w-full py-3"
            >
              {calculating ? "Computing Score…" : "Compute Relative NIRF Score"}
            </button>
          </Card>
        </Reveal>
      )}

      {/* ── Step 3: result ── */}
      {calculating && <Spinner label="Computing…" />}

      {result && <RelativeResultView result={result} onReset={() => { setResult(null); setExtract(null); setError(""); }} />}
      </>
      )}
    </div>
  );
}

// ─── Result view ──────────────────────────────────────────────────────────────

function RelativeResultView({
  result,
  onReset,
}: {
  result: ScoreResult;
  onReset: () => void;
}) {
  const partialCount = result.parameters.filter(
    (p) => (p as any).status && (p as any).status !== "ok"
  ).length;

  return (
    <div className="space-y-5">
      <Reveal>
        {/* Score hero */}
        <Card className="relative overflow-hidden py-12 text-center animate-scale-in">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />

          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
            Relative NIRF Score
          </p>
          <p
            className="mt-4 text-7xl font-extrabold tracking-tight text-gradient"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            {result.finalScore !== null ? result.finalScore.toFixed(2) : "—"}
          </p>
          <p className="mt-2 text-sm text-[var(--text-fainter)]">
            Final Weighted Score / 100
            {result.finalScore === null && " — Insufficient data"}
          </p>

          {result.hasInsufficientData && (
            <Alert tone="amber" className="mx-auto mt-5 max-w-lg text-left">
              <strong>{partialCount} parameter{partialCount === 1 ? "" : "s"} partial: </strong>
              {result.insufficientParams.join(", ") || "review breakdown below"}
            </Alert>
          )}

          {result.parameters.some((p) => p.subs.some((s) => s.excluded)) && null}

          <button onClick={onReset} className="btn-outline mt-8">
            Compute Again
          </button>
        </Card>
      </Reveal>

      {/* Parameter cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {result.parameters.map((p, i) => (
          <Reveal key={p.parameter} delay={i * 70}>
            <ParamCard param={p} />
          </Reveal>
        ))}
      </div>

      {/* Sub-score breakdown per parameter */}
      {result.parameters.map((p) =>
        p.subs.length > 0 ? (
          <Reveal key={p.parameter}>
            <Card className="relative overflow-hidden animate-fade-up">
              {/* left accent bar */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-2xl"
                style={{
                  background: `linear-gradient(180deg, ${PARAM_COLORS[p.parameter]}80, transparent)`,
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="chip border text-[11px] font-bold"
                    style={{
                      color: PARAM_COLORS[p.parameter],
                      backgroundColor: `${PARAM_COLORS[p.parameter]}12`,
                      borderColor: `${PARAM_COLORS[p.parameter]}30`,
                    }}
                  >
                    {p.parameter}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-1)]">{p.label}</span>
                  <span className="text-xs text-[var(--text-fainter)]">
                    {Math.round(p.weight * 100)}% weight
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: PARAM_COLORS[p.parameter], fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {p.weightedScore.toFixed(2)}
                  </span>
                  <span className="text-xs text-[var(--text-fainter)] ml-1">/ {(p.weight * 100).toFixed(0)} pts</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-2)]">
                      <th className="th">Sub-parameter</th>
                      <th className="th text-right">Marks</th>
                      <th className="th text-right">Score</th>
                      <th className="th text-right">Contribution</th>
                      <th className="th text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.subs.filter((s) => !s.excluded).map((s) => (
                      <tr key={s.key} className="border-b border-[var(--border)] tr-hover">
                        <td className="td">
                          <span className="font-semibold text-[var(--text-1)]">{s.key.toUpperCase()}</span>{" "}
                          <span className="text-[var(--text-faint)]">{s.label}</span>
                        </td>
                        <td className="td text-right font-mono text-[var(--text-faint)]">
                          {s.marks !== undefined ? s.marks : "—"}
                        </td>
                        <td className="td text-right font-mono font-semibold text-brand-400">
                          {s.score !== null && !isNaN(Number(s.score))
                            ? Number(s.score).toFixed(2)
                            : "—"}
                        </td>
                        <td className="td text-right font-mono text-[#C9B458]">
                          {s.contribution !== null && s.contribution !== undefined
                            ? `${Number(s.contribution).toFixed(2)} / ${Number(
                                s.maxContribution ?? 0
                              ).toFixed(1)}`
                            : "—"}
                        </td>
                        <td className="td text-right">
                          {s.excluded ? (
                            <span className="chip border bg-[var(--chip-violet-bg)] text-[var(--chip-violet-text)] border-[var(--chip-violet-border)]">
                              Skipped
                            </span>
                          ) : s.status === "ok" ? (
                            <span className="chip border bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]">
                              Computed
                            </span>
                          ) : s.status === "partial" ? (
                            <span className="chip border bg-[var(--chip-warn-bg)] text-[var(--chip-warn-text)] border-[var(--chip-warn-border)]">
                              Partial
                            </span>
                          ) : (
                            <span className="chip border bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)] border-[var(--chip-danger-border)]">
                              Insufficient
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Per-sub description: how it was calculated (values from the PDF + formula) */}
              {p.subs.filter((s) => !s.excluded).map((s) => {
                const hasSteps = !!s.steps && s.steps.length > 0;
                const hasMissing = s.missingFields.length > 0;
                if (!hasSteps && !hasMissing) return null;
                return (
                  <div
                    key={`${p.parameter}-${s.key}-detail`}
                    className="mt-3 rounded-xl border border-[var(--border-5)] bg-[var(--surface-8)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-1)]">
                        {s.key.toUpperCase()} — {s.officialName ?? s.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-fainter)]">
                        {s.formulaRef ?? "calculation detail"}
                      </span>
                    </div>
                    {s.formula && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
                        <span className="text-[var(--text-dim)]">Formula:</span> {s.formula}
                      </p>
                    )}
                    {hasMissing && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-rose-400">
                        {s.status === "insufficient_data"
                          ? "Could not be calculated — data required: "
                          : `Partial — missing data: `}
                        {s.missingFields.join(", ")}
                      </p>
                    )}
                    {hasSteps && (
                      <div className="mt-2 rounded-lg border border-[var(--surface-4)] bg-[var(--bg-deep)] p-2.5">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                          Values from the PDF — how this was calculated
                        </p>
                        {(s.steps ?? []).map((sp, i) => (
                          <div
                            key={i}
                            className="flex items-baseline justify-between gap-3 border-b border-[var(--border-6)] py-1 last:border-0"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="text-[10px] text-[var(--text-faint)]">{i + 1}.</span>{" "}
                              <span className="text-[10px] font-medium text-[var(--text-4)]">{sp.label}</span>
                              <span className="ml-1.5 font-mono text-[10px] text-[var(--text-fainter)]">{sp.equation}</span>
                            </span>
                            <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-brand-400">
                              {sp.result === null ? "—" : String(sp.result)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          </Reveal>
        ) : null
      )}
    </div>
  );
}

// ─── Small parameter card ─────────────────────────────────────────────────────

function ParamCard({ param }: { param: import("../types").ParameterScore }) {
  const color = PARAM_COLORS[param.parameter];
  const pct = Math.min(100, param.unweightedScore !== null ? param.unweightedScore : 0);

  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:border-[var(--border-3)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <span
          className="chip border text-sm font-bold"
          style={{ color, backgroundColor: `${color}15`, borderColor: `${color}30` }}
        >
          {param.parameter}
        </span>
        <span className="text-lg font-bold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
          {param.weightedScore.toFixed(1)}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-fainter)]">
        {param.unweightedScore !== null
          ? `${param.unweightedScore.toFixed(1)} / 100 unweighted`
          : "Insufficient data"}
      </p>

      {/* Mini progress bar */}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(2, pct)}%`,
            background: `linear-gradient(90deg, ${color}AA, ${color})`,
          }}
        />
      </div>
      <p className="mt-1 text-[10px] text-[var(--text-faintest)]">
        {Math.round(param.weight * 100)}% of final score
      </p>

      {param.penalty ? (
        <p className="mt-1 text-xs font-medium text-rose-400">Penalty −{param.penalty}</p>
      ) : null}
    </Card>
  );
}
