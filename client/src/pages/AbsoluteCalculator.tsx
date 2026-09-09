import { useRef, useState } from "react";
import api from "../services/api";
import {
  Alert,
  Badge,
  Card,
  cn,
  Icon,
  ICON,
  PageHeader,
  Reveal,
  Spinner,
} from "../components/ui";

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

const STATUS_META: Record<Status, { label: string; chip: string }> = {
  computed: { label: "Computed", chip: "bg-mint-200/70 text-mint-800 border-mint-300/80" },
  partial: { label: "Partial", chip: "bg-amber-100 text-amber-800 border-amber-300" },
  unable: { label: "Unable", chip: "bg-rose-100 text-rose-700 border-rose-200" },
};

function StepRow({ step }: { step: Step }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-lg bg-white/60 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-brand-900/70">{step.label}: </span>
        <code className="break-words font-mono text-brand-900/70">{step.equation}</code>
      </div>
      <span className="shrink-0 font-mono font-semibold text-brand-900">
        {step.result === null ? "—" : String(step.result)}
      </span>
    </div>
  );
}

function SubCard({ sub }: { sub: SubResult }) {
  const meta = STATUS_META[sub.status];
  return (
    <Card className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-brand-900">
              {sub.label} — {sub.officialName}
            </h3>
            <Badge tone={sub.parameter === "TLR" ? "violet" : sub.parameter === "GO" ? "blue" : "green"}>
              {sub.parameter} · {Math.round(sub.parameterWeight * 100)}%
            </Badge>
          </div>
          <p className="mt-1 text-xs text-brand-900/50">
            {sub.sourceTables.join(" · ") || "no source table read"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold text-brand-900">
            {sub.score === null ? "—" : sub.score.toFixed(2)}
            <span className="text-sm font-semibold text-brand-900/45"> / {sub.maxMarks}</span>
          </div>
          <Badge tone={meta.chip}>{meta.label}</Badge>
        </div>
      </div>

      {sub.note && <p className="mt-3 text-sm text-brand-900/60">{sub.note}</p>}

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
                  ? "border-rose-200 bg-rose-50/70 text-rose-700"
                  : fl.severity === "warning"
                    ? "border-amber-200 bg-amber-50/70 text-amber-800"
                    : "border-brand-200 bg-brand-50/70 text-brand-900/70"
              )}
            >
              <Icon
                path={ICON.alert}
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
              />
              <span>{fl.message}</span>
            </div>
          ))}
        </div>
      )}

      {sub.steps.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-900/40">
            Arithmetic trace
          </p>
          {sub.steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AbsoluteCalculator() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [provenance, setProvenance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div>
      <PageHeader
        title="Absolute Parameter Calculator"
        description="Current-year-only NIRF sub-parameters (FSR, GUE, PCS, FQE, WD, RD) with a full arithmetic trace. Upload a NIRF DCS PDF or paste the extracted text."
      />

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-900">
              Upload a NIRF data-submission PDF
            </p>
            <button
              className="btn-primary w-full py-3"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <Icon path={ICON.upload} className="h-4 w-4" />
              Choose PDF
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-900">…or paste extracted text</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="[PAGE 1] Institute Name: …"
              className="w-full rounded-xl border border-brand-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            <button
              className="btn-primary mt-2 px-3 py-2 text-xs"
              onClick={onText}
              disabled={loading || !text.trim()}
            >
              Score pasted text
            </button>
          </div>
        </div>
        {error && (
          <Alert tone="rose" className="mt-4">
            {error}
          </Alert>
        )}
      </Card>

      {loading && <Spinner label="Scoring…" />}

      {report && (
        <div className="space-y-6">
          <Reveal>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-brand-900">
                    {report.institution?.name ?? "Institution"} · {report.category} {report.year}
                  </h2>
                  <p className="mt-1 text-xs text-brand-900/50">{provenance}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold text-gradient">
                    {report.summary.totalComputed.toFixed(2)}
                  </div>
                  <div className="text-xs font-semibold text-brand-900/50">
                    of {report.summary.totalMax.toFixed(1)} absolute points (overall 100 scale)
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full table-auto border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-brand-200 text-left text-xs uppercase tracking-wider text-brand-900/45">
                      <th className="py-2 pr-4 font-semibold">Parameter</th>
                      <th className="py-2 pr-4 font-semibold">Score</th>
                      <th className="py-2 pr-4 font-semibold">Max</th>
                      <th className="py-2 pr-4 font-semibold">Weight in overall score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subs.map((s) => (
                      <tr key={s.key} className="border-b border-brand-200/60">
                        <td className="py-2.5 pr-4">
                          <span className="font-semibold text-brand-900">{s.key.toUpperCase()}</span>{" "}
                          <span className="text-brand-900/50">{s.officialName}</span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono font-semibold text-brand-900">
                          {s.score === null ? "—" : s.score.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-brand-900/60">{s.maxMarks}</td>
                        <td className="py-2.5 pr-4 font-mono text-brand-900/70">
                          {s.contribution === null ? "—" : `${s.contribution.toFixed(2)} pts`}
                          <span className="text-brand-900/35"> / {s.maxContribution.toFixed(1)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.summary.hasUnable && (
                <Alert tone="amber" className="mt-4">
                  {report.summary.unableKeys.map((k) => k.toUpperCase()).join(", ")}: Unable to
                  compute — source table absent. No value was fabricated for missing tables.
                </Alert>
              )}
              <p className="mt-3 text-xs text-brand-900/45">{report.methodologyNote}</p>
            </Card>
          </Reveal>

          {report.subs.map((s) => (
            <SubCard key={s.key} sub={s} />
          ))}
        </div>
      )}
    </div>
  );
}