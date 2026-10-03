import { useRef, useState } from "react";
import api from "../services/api";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "computed" | "partial" | "unable";

interface Step {
  label: string;
  equation: string;
  result: number | string | null;
}

interface Flag {
  severity: "info" | "warning" | "error";
  message: string;
}

interface SubResult {
  key: string;
  label: string;
  officialName: string;
  parameter: string;
  parameterWeight: number;
  maxMarks: number;
  maxContribution: number;
  score: number | null;
  contribution: number | null;
  status: Status;
  sourceTables: string[];
  missingTables: string[];
  steps: Step[];
  flags: Flag[];
  officiality: string;
  note?: string;
}

interface Report {
  category: string;
  year: number;
  institution: { name?: string; id?: string } | null;
  inputs: Record<string, number | string | null>;
  subs: SubResult[];
  summary: {
    totalComputed: number;
    totalMax: number;
    availableMax: number;
    hasUnable: boolean;
    unableKeys: string[];
  };
  methodologyNote: string;
}

interface ScoreResponse {
  report: Report;
  provenance: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<Status, { label: string; chip: string }> = {
  computed: { label: "Computed", chip: "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]" },
  partial:  { label: "Partial",  chip: "bg-[var(--chip-warn-bg)] text-[var(--text-active)] border-[var(--chip-warn-border)]" },
  unable:   { label: "Unable",   chip: "bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)] border-[var(--chip-danger-border)]" },
};

const PARAM_COLORS: Record<string, string> = {
  TLR: "#830000",
  RP:  "#A51F1F",
  GO:  "#C93837",
  OI:  "#275889",
  PR:  "#10253F",
};

// ─── Step row (arithmetic trace) ─────────────────────────────────────────────

function StepRow({ step }: { step: Step }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-lg bg-[var(--surface-5)] border border-[var(--border)] px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-[var(--text-dim)]">{step.label}: </span>
        <code className="break-words font-mono text-[var(--text-4)]">{step.equation}</code>
      </div>
      <span className="shrink-0 font-mono font-semibold text-brand-400">
        {step.result === null ? "—" : String(step.result)}
      </span>
    </div>
  );
}

// ─── Sub-parameter card (same style as Relative's breakdown cards) ────────────

function SubCard({ sub }: { sub: SubResult }) {
  const meta       = STATUS_META[sub.status];
  const paramColor = PARAM_COLORS[sub.parameter] || "#830000";
  const pct        = sub.score !== null ? Math.min(100, (sub.score / sub.maxMarks) * 100) : 0;

  return (
    <Reveal>
      <Card className="animate-fade-up relative overflow-hidden">
        {/* Left accent bar */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-2xl"
          style={{ background: `linear-gradient(180deg, ${paramColor}80, transparent)` }}
        />

        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-[var(--text-1)]">
                {sub.label} — {sub.officialName}
              </h3>
              <span
                className="chip border text-[11px]"
                style={{
                  color: paramColor,
                  backgroundColor: `${paramColor}12`,
                  borderColor: `${paramColor}30`,
                }}
              >
                {sub.parameter} &middot; {Math.round(sub.parameterWeight * 100)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-fainter)]">
              {sub.sourceTables.join(" · ") || "no source table read"}
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-2xl font-extrabold text-[var(--text-1)]"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              {sub.score === null ? "—" : sub.score.toFixed(2)}
              <span className="text-sm font-semibold text-[var(--text-fainter)]"> / {sub.maxMarks}</span>
            </div>
            <span className={cn("chip border mt-1", meta.chip)}>{meta.label}</span>
          </div>
        </div>

        {/* Mini progress bar */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(2, pct)}%`,
              background: `linear-gradient(90deg, ${paramColor}AA, ${paramColor})`,
            }}
          />
        </div>

        {sub.note && <p className="mt-3 text-sm text-[var(--text-faint)]">{sub.note}</p>}

        {sub.missingTables.length > 0 && (
          <Alert tone="rose" title="Unable to compute — source table absent:" className="mt-3">
            {sub.missingTables.join("; ")}.
          </Alert>
        )}

        {sub.flags.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {sub.flags.map((fl, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                  fl.severity === "error"
                    ? "border-[var(--chip-danger-border)] bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)]"
                    : fl.severity === "warning"
                      ? "border-[var(--chip-warn-border)] bg-[var(--chip-warn-bg)] text-[var(--text-active)]"
                      : "border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-dim)]"
                )}
              >
                <Icon path={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{fl.message}</span>
              </div>
            ))}
          </div>
        )}

        {sub.steps.length > 0 && (
          <div className="mt-5 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faintest)]">
              Arithmetic Trace
            </p>
            {sub.steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </div>
        )}
      </Card>
    </Reveal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AbsoluteCalculator() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text,       setText]       = useState("");
  const [report,     setReport]     = useState<Report | null>(null);
  const [provenance, setProvenance] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  async function postScore(payload: FormData | { text: string }) {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await api.post<ScoreResponse>("/absolute/score", payload, {
        headers:
          payload instanceof FormData
            ? { "Content-Type": "multipart/form-data" }
            : { "Content-Type": "application/json" },
      });
      setReport(res.data.report);
      setProvenance(res.data.provenance);
    } catch (e: any) {
      setError(e.response?.data?.error || e.response?.data?.detail || "Scoring failed");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    void postScore(fd);
  }

  function onText() {
    if (!text.trim()) return;
    void postScore({ text });
  }

  function reset() {
    setReport(null);
    setError("");
    setText("");
  }

  return (
    <div>
      <PageHeader
        title="Absolute Parameter Calculator"
        description="Current-year NIRF sub-parameters (FSR, GUE, PCS, FQE, WD, RD) with full arithmetic trace. Upload a NIRF DCS PDF or paste extracted text."
      />

      {/* ── Step 1: input (hidden once result is shown) ── */}
      {!report && (
        <Card className="mb-5 space-y-5">
          {/* Dropzone */}
          <div>
            <label className="label">Upload NIRF Data Submission PDF</label>
            <label
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300",
                loading
                  ? "border-brand-500/60 bg-brand-500/5"
                  : "border-[var(--border-2)] bg-[var(--surface-5)] hover:border-brand-500/40 hover:bg-brand-500/5"
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-glow transition-transform duration-300 group-hover:scale-110">
                <Icon path={ICON.upload} className="h-6 w-6" />
              </span>
              <span className="mt-5 text-sm font-semibold text-[var(--text-1)]">
                {loading ? "Scoring PDF…" : "Choose a PDF or drop it here"}
              </span>
              <span className="mt-1.5 text-xs text-[var(--text-fainter)]">
                NIRF DCS PDF &mdash; tables extracted automatically
              </span>
            </label>
          </div>

          {/* Paste text (secondary option) */}
          <div className="border-t border-[var(--border)] pt-5">
            <label className="label">Or paste extracted text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="[PAGE 1] Institute Name: …"
              className="w-full rounded-xl border border-[var(--border-4)] bg-[var(--surface-5)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faintest)] outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/10 transition-all"
            />
            <button
              className="btn-outline mt-3 px-4 py-2 text-xs"
              onClick={onText}
              disabled={loading || !text.trim()}
            >
              Score Pasted Text
            </button>
          </div>
        </Card>
      )}

      {/* ── Errors ── */}
      {error && (
        <Alert tone="rose" className="mb-5">
          {error}
        </Alert>
      )}

      {/* ── Loading ── */}
      {loading && <Spinner label="Scoring…" />}

      {/* ── Results ── */}
      {report && (
        <div className="space-y-5">
          {/* Hero score card */}
          <Reveal>
            <Card className="relative overflow-hidden py-12 text-center animate-scale-in">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />

              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                Absolute NIRF Score
              </p>
              <p
                className="mt-4 text-7xl font-extrabold tracking-tight text-gradient"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                {report.summary.totalComputed.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-[var(--text-fainter)]">
                of {report.summary.totalMax.toFixed(1)} absolute points (overall 100 scale)
              </p>

              {/* Institution & provenance */}
              <p className="mt-3 text-xs text-[var(--text-faintest)]">
                {report.institution?.name ?? "Institution"} &middot; {report.category} {report.year}
              </p>
              {provenance && (
                <p className="mt-0.5 text-xs text-[#3A3A3A]">{provenance}</p>
              )}

              {report.summary.hasUnable && (
                <Alert tone="amber" className="mx-auto mt-5 max-w-lg text-left">
                  <strong>Unable to compute: </strong>
                  {report.summary.unableKeys.map((k) => k.toUpperCase()).join(", ")} — source
                  table absent. No value was fabricated.
                </Alert>
              )}

              <button onClick={reset} className="btn-outline mt-8">
                Compute Again
              </button>
            </Card>
          </Reveal>

          {/* Summary table card */}
          <Reveal>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent" />
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-4">
                Sub-parameter Summary
              </p>
              <div className="overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-2)]">
                      <th className="th">Parameter</th>
                      <th className="th text-right">Score</th>
                      <th className="th text-right">Max</th>
                      <th className="th text-right">Contribution</th>
                      <th className="th text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subs.map((s) => (
                      <tr key={s.key} className="border-b border-[var(--border)] tr-hover">
                        <td className="td">
                          <span className="font-semibold text-[var(--text-1)]">{s.key.toUpperCase()}</span>{" "}
                          <span className="text-[var(--text-faint)]">{s.officialName}</span>
                        </td>
                        <td className="td text-right font-mono font-semibold text-brand-400">
                          {s.score === null ? "—" : s.score.toFixed(2)}
                        </td>
                        <td className="td text-right font-mono text-[var(--text-fainter)]">{s.maxMarks}</td>
                        <td className="td text-right font-mono text-[var(--text-dim)]">
                          {s.contribution === null ? "—" : `${s.contribution.toFixed(2)} pts`}
                          <span className="text-[var(--text-faintest)]"> / {s.maxContribution.toFixed(1)}</span>
                        </td>
                        <td className="td text-right">
                          <span className={cn("chip border", STATUS_META[s.status].chip)}>
                            {STATUS_META[s.status].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-[#3A3A3A]">{report.methodologyNote}</p>
            </Card>
          </Reveal>

          {/* Per-sub breakdown cards */}
          {report.subs.map((s) => (
            <SubCard key={s.key} sub={s} />
          ))}
        </div>
      )}
    </div>
  );
}