import { useState } from "react";
import { Card, cn, Icon, ICON } from "../ui";
import type { CohortContext } from "../../types/relative";

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e7) return `${(v / 1e7).toLocaleString(undefined, { maximumFractionDigits: 2 })} cr`;
  if (Math.abs(v) >= 1e4) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface InfoPanelProps {
  cohort: CohortContext;
  summary: {
    cohortYearUsed: number;
    cohortStale: boolean;
    averageConfidence: number;
    estimatedFields: string[];
    missingFields: string[];
  };
  methodologyNote: string;
  modelMeta: {
    seedBaseline: boolean;
    trainYears: number[];
    validateYear: number | null;
    provenanceNote: string;
  };
}

export function RelativeInfoPanel({ cohort, summary, methodologyNote, modelMeta }: InfoPanelProps) {
  const [open, setOpen] = useState(false);
  const cohortKeys = Object.keys(cohort.stats ?? {}).slice(0, 8);

  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon path={ICON.chart} className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-bold text-[var(--text-1)]">Methodology &amp; Cohort Context</h3>
        </div>
        <span
          className={cn("inline-block text-[var(--text-faint)] transition-transform duration-200", open && "rotate-180")}
        >
          ▼
        </span>
      </button>

      <p className="mt-3 text-xs leading-relaxed text-[var(--text-faint)]">{methodologyNote}</p>

      {modelMeta.seedBaseline && (
        <p className="mt-3 rounded-lg border border-[var(--chip-warn-border)] bg-[var(--chip-warn-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--chip-warn-text)]">
          <strong>Demo calibration.</strong> The current model was trained on the calibrated baseline synthetic
          dataset — not scraped NIRF ground truth. Predictions are illustrative until real Step-1 data is ingested.
          {modelMeta.provenanceNote ? ` ${modelMeta.provenanceNote}` : ""}
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-5)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-fainter)]">Cohort year</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text-1)]">
                {summary.cohortYearUsed || "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-5)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-fainter)]">Cohort size</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text-1)]">
                {cohort.cohortSize ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-5)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-fainter)]">Avg confidence</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text-1)]">
                {Math.round(summary.averageConfidence * 100)}%
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-5)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-fainter)]">Cohort state</p>
              <p
                className={cn(
                  "chip border mt-0.5",
                  summary.cohortStale
                    ? "bg-[var(--chip-warn-bg)] text-[var(--text-active)] border-[var(--chip-warn-border)]"
                    : "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]"
                )}
              >
                {summary.cohortStale ? "Stale" : "Current"}
              </p>
            </div>
          </div>

          {cohortKeys.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-2)]">
                    <th className="th">Raw metric</th>
                    <th className="th text-right">Cohort max</th>
                    <th className="th text-right">Cohort median</th>
                    <th className="th text-right">Cohort std</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortKeys.map((k) => {
                    const st = cohort.stats[k];
                    if (!st) return null;
                    return (
                      <tr key={k} className="border-b border-[var(--border)] tr-hover">
                        <td className="td">
                          <span className="font-semibold text-[var(--text-1)]">{k}</span>
                          {st.estimated && (
                            <span className="chip border ml-2 bg-[var(--chip-warn-bg)] text-[var(--text-active)] border-[var(--chip-warn-border)]">
                              baseline
                            </span>
                          )}
                        </td>
                        <td className="td text-right font-mono text-brand-400">{fmtNum(st.max)}</td>
                        <td className="td text-right font-mono text-[var(--text-4)]">{fmtNum(st.median)}</td>
                        <td className="td text-right font-mono text-[var(--text-faint)]">{fmtNum(st.std)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(summary.estimatedFields.length > 0 || summary.missingFields.length > 0) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {summary.estimatedFields.length > 0 && (
                <div className="rounded-lg border border-[var(--chip-warn-border)] bg-[var(--chip-warn-bg)] px-3 py-2 text-xs text-[var(--chip-warn-text)]">
                  <strong>Estimated inputs:</strong> {summary.estimatedFields.join(", ")}
                </div>
              )}
              {summary.missingFields.length > 0 && (
                <div className="rounded-lg border border-[var(--chip-danger-border)] bg-[var(--chip-danger-bg)] px-3 py-2 text-xs text-[var(--chip-danger-text)]">
                  <strong>Missing inputs:</strong> {summary.missingFields.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}