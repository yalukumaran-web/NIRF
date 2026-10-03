import { useState } from "react";
import { Alert, Card, cn, Icon, ICON, Reveal } from "../ui";
import type {
  RelativeFlag,
  RelativeParamResult,
  RelativeStep,
} from "../../types/relative";

const STATUS_META: Record<RelativeParamResult["status"], { label: string; chip: string }> = {
  computed: { label: "Computed", chip: "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]" },
  estimated: { label: "Estimated", chip: "bg-[var(--chip-warn-bg)] text-[var(--text-active)] border-[var(--chip-warn-border)]" },
  low_confidence: { label: "Low Confidence", chip: "bg-[var(--chip-violet-bg)] text-[var(--chip-violet-text)] border-[var(--chip-violet-border)]" },
  missing_data: { label: "Missing Data", chip: "bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)] border-[var(--chip-danger-border)]" },
};

const STRATEGY_LABEL: Record<RelativeParamResult["strategy"], string> = {
  cohort_ratio: "cohort ratio",
  cohort_log_ratio: "log-scaled cohort ratio",
  linear_capped: "linear to fixed benchmark",
  gbm: "gradient-boosted model",
  historical_or_rank_band: "published / rank-band proxy",
};

const PARAM_COLORS: Record<string, string> = {
  TLR: "#830000",
  RP: "#A51F1F",
  GO: "#C93837",
  PR: "#10253F",
};

const SOURCE_LABEL: Record<string, string> = {
  from_dcs_pdf: "DCS PDF",
  cross_validated_web: "Web cross-check",
  historical_actual: "Published actual",
  rank_band_proxy: "Rank-band proxy",
  model_prediction: "Model",
  model_estimated: "Estimated",
  missing: "Missing",
};

function StepRow({ step }: { step: RelativeStep }) {
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

function FlagRow({ flag }: { flag: RelativeFlag }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        flag.severity === "error"
          ? "border-[var(--chip-danger-border)] bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)]"
          : flag.severity === "warning"
            ? "border-[var(--chip-warn-border)] bg-[var(--chip-warn-bg)] text-[var(--text-active)]"
            : "border-[var(--border-2)] bg-[var(--surface)] text-[var(--text-dim)]"
      )}
    >
      <Icon path={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{flag.message}</span>
    </div>
  );
}

export function RelativeParamCard({ param, index }: { param: RelativeParamResult; index: number }) {
  const [openExpr, setOpenExpr] = useState(false);
  const meta = STATUS_META[param.status];
  const color = PARAM_COLORS[param.parameter];
  const pct = param.score !== null ? Math.min(100, (param.score / param.maxMarks) * 100) : 0;
  const sourceNames = param.sourceFields
    .map((f) => f.key)
    .filter((k) => k)
    .join(", ");

  return (
    <Reveal delay={index * 60}>
      <Card className="animate-fade-up relative overflow-hidden">
        {/* Left accent bar */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-l-2xl"
          style={{ background: `linear-gradient(180deg, ${color}80, transparent)` }}
        />

        {/* Header row: code + name, parameter badge w/ weight, score / max, status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-[var(--text-1)]">
                {param.code} — {param.name}
              </h3>
              <span
                className="chip border text-[11px]"
                style={{
                  color,
                  backgroundColor: `${color}12`,
                  borderColor: `${color}30`,
                }}
              >
                {param.parameter} &middot; {Math.round(param.parameterWeight * 100)}%
              </span>
            </div>
            {/* Data-source subtitle */}
            <p className="mt-1 text-xs text-[var(--text-fainter)]">
              {sourceNames || "no source fields"}
              {param.sourceFields.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {param.sourceFields.map((f) => (
                    <span key={f.key} className="chip border bg-[var(--surface-5)] text-[10px] text-[var(--text-dim)] border-[var(--border-2)]">
                      {SOURCE_LABEL[f.source] ?? f.source}
                    </span>
                  ))}
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-2xl font-extrabold text-[var(--text-1)]"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              {param.score === null ? "—" : param.score.toFixed(2)}
              <span className="text-sm font-semibold text-[var(--text-fainter)]"> / {param.maxMarks}</span>
            </div>
            <span className={cn("chip border mt-1", meta.chip)}>{meta.label}</span>
            <span className="mt-1 block text-[10px] text-[var(--text-faint)]">{param.confidenceLabel}</span>
          </div>
        </div>

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

        {/* Formula line */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-5)] px-3 py-2">
          <Icon path={ICON.calculator} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faintest)]">
              Score via {STRATEGY_LABEL[param.strategy]}
            </p>
            <p className="mt-0.5 break-words font-mono text-xs text-[var(--text-4)]">{param.formulaLine}</p>
          </div>
        </div>

        {/* Conditional amber warning box */}
        {param.hasWarning && param.warning && (
          <Alert tone="amber" title="Warning:" className="mt-3">
            {param.warning}
          </Alert>
        )}

        <p className="mt-3 text-xs leading-relaxed text-[var(--text-faint)]">{param.explanation}</p>

        {/* Flags */}
        {param.flags.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {param.flags.map((fl, i) => (
              <FlagRow key={i} flag={fl} />
            ))}
          </div>
        )}

        {/* Arithmetic trace (collapsible) */}
        {param.steps.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setOpenExpr((o) => !o)}
              className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-fainter)] transition-colors hover:text-brand-400"
            >
              <span
                className={cn("inline-block transition-transform duration-200", openExpr && "rotate-90")}
              >
                ›
              </span>
              Arithmetic Trace
            </button>
            {openExpr && (
              <div className="mt-2 space-y-1.5">
                {param.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </Reveal>
  );
}