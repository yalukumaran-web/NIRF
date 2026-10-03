import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Reveal,
  Spinner,
} from "../components/ui";
import type { ScoreRow, ScoreResult, ParameterScore } from "../types";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

const COLORS: Record<string, string> = {
  TLR: "#830000",
  RP: "#A51F1F",
  GO: "#C93837",
  OI: "#275889",
  PR: "#10253F",
};

interface PredictionRow {
  id: number;
  year: number;
  source_file: string;
  predicted_rank: number;
  composite: number;
  confidence: number;
  model_category: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, institution } = useAuth();
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [latest, setLatest] = useState<ScoreResult | null>(null);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const s = await api.get("/scores");
      const row: ScoreRow | undefined = s.data?.scores?.[0];
      const rows: ScoreRow[] = s.data?.scores ?? [];
      setScores(rows);
      if (row) {
        const detail = await api.get(`/scores/${row.id}/breakdown`);
        setLatest(toScoreResult(row, detail.data.breakdown));
      }
      try {
        const p = await api.get("/predictions");
        setPredictions(p.data?.predictions || []);
      } catch {
        // predictions endpoint may not be available
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${institution?.name ?? ""} · ${institution?.category ?? ""} · ${user?.email ?? ""}`}
        actions={
          <Badge tone="gold">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-soft" />
            Session active
          </Badge>
        }
      />

      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : latest ? (
        <ScoreOverview latest={latest} scores={scores} predictions={predictions} />
      ) : (
        <EmptyState
          title="No score computed yet"
          description="Upload your institution credentials (PDF) or enter metrics to compute your NIRF ranking."
          action={{ label: "Upload & Compute", to: "/upload" }}
        />
      )}
    </>
  );
}

function toScoreResult(row: ScoreRow, breakdown: any[]): ScoreResult {
  const rw = row as any;
  const params: ParameterScore[] = ["TLR", "RP", "GO", "OI", "PR"].map((p) => {
    const val = rw[p.toLowerCase()];
    const numVal = val !== null && val !== undefined ? Number(val) : null;
    const weight = p === "TLR" || p === "RP" ? 0.3 : p === "GO" ? 0.2 : 0.1;
    return {
      parameter: p as ParameterScore["parameter"],
      label: p,
      weight,
      weightedScore: numVal ?? 0,
      unweightedScore: numVal !== null ? numVal / weight : null,
      subs: breakdown
        .filter((b) => b.parameter === p)
        .map((b) => ({
          key: b.sub_key || b.key,
          label: b.label,
          rawValue: b.raw_value != null ? Number(b.raw_value) : undefined,
          score:
            b.normalized != null
              ? Number(b.normalized)
              : b.score != null
              ? Number(b.score)
              : null,
          status: b.status,
          missingFields: b.missing_fields || b.missingFields || [],
        })),
    };
  });
  const final = row.final_score != null ? Number(row.final_score) : null;
  return {
    category: row.category,
    year: row.year,
    finalScore: final,
    finalWeighted: final,
    parameters: params,
    insufficientParams: [],
    hasInsufficientData: row.has_insufficient,
  };
}

function ScoreOverview({
  latest,
  scores,
  predictions,
}: {
  latest: ScoreResult;
  scores: ScoreRow[];
  predictions: PredictionRow[];
}) {
  const radarData = latest.parameters.map((p) => ({
    subject: p.parameter,
    A: Math.round(((p as any).weightedScore || 0) / p.weight),
  }));

  const barData = latest.parameters.map((p) => ({
    name: p.parameter,
    score: Math.round(p.weightedScore),
  }));

  const partialCount = latest.parameters.filter(
    (p) => (p as any).status && (p as any).status !== "ok"
  ).length;

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Score hero card */}
          <Card className="relative overflow-hidden flex flex-col items-center justify-center py-10 text-center animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/8 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-brand-500/6 blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
            <p className="relative text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)]">
              Final NIRF Score
            </p>
            <p className="relative mt-3 text-6xl font-extrabold tracking-tight text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              {latest.finalScore !== null ? (
                <>
                  <span className="text-gradient">{latest.finalScore.toFixed(1)}</span>
                </>
              ) : "—"}
            </p>
            <p className="relative mt-1 text-xs text-[var(--text-faint)]">
              {latest.finalScore === null
                ? "Insufficient data to finalize"
                : "out of 100"}
            </p>
            <div className="relative mt-4 flex flex-wrap justify-center gap-1.5">
              {latest.hasInsufficientData && (
                <Badge tone="amber">
                  {partialCount} parameter{partialCount === 1 ? "" : "s"} partial
                </Badge>
              )}
            </div>
          </Card>

          {/* Radar chart */}
          <Card className="animate-fade-up">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)]">
              Parameter Radar
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(131,0,0,0.15)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#7E7E7E", fontSize: 12 }}
                />
                <Radar
                  dataKey="A"
                  stroke="#830000"
                  fill="#830000"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Card>

          {/* Bar chart */}
          <Card className="animate-fade-up">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)]">
              Weighted Contribution
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fill: "#888888", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#888888", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(131,0,0,0.05)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #2A2A2A",
                    background: "#141414",
                    color: "#E8E8E8",
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {barData.map((d, i) => (
                    <Cell key={i} fill={COLORS[d.name]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </Reveal>

      {/* Parameter drill-down cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {latest.parameters.map((p, i) => (
          <Reveal key={p.parameter} delay={i * 70}>
            <ParameterCard param={p} />
          </Reveal>
        ))}
      </div>

      {/* Score History table */}
      {scores.length > 1 && (
        <Reveal>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-4">
              Score History
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-[var(--border-2)]">
                  <tr>
                    <th className="th">Year</th>
                    <th className="th">TLR</th>
                    <th className="th">RP</th>
                    <th className="th">GO</th>
                    <th className="th">OI</th>
                    <th className="th">PR</th>
                    <th className="th">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.id} className="tr-hover border-b border-[var(--border)] last:border-0">
                      <td className="td">{s.year}</td>
                      <td className="td">{s.tlr != null ? Number(s.tlr).toFixed(1) : "—"}</td>
                      <td className="td">{s.rp != null ? Number(s.rp).toFixed(1) : "—"}</td>
                      <td className="td">{s.go != null ? Number(s.go).toFixed(1) : "—"}</td>
                      <td className="td">{s.oi != null ? Number(s.oi).toFixed(1) : "—"}</td>
                      <td className="td">{s.pr != null ? Number(s.pr).toFixed(1) : "—"}</td>
                      <td className="td font-bold text-brand-400">
                        {s.final_score != null ? Number(s.final_score).toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Rank Predictions */}
      {predictions.length > 0 && (
        <Reveal>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-4">
              Rank Predictions
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-[var(--border-2)]">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Source</th>
                    <th className="th">Predicted Rank</th>
                    <th className="th">Composite</th>
                    <th className="th">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.id} className="tr-hover border-b border-[var(--border)] last:border-0">
                      <td className="td">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="td text-[var(--text-faint)] truncate max-w-[200px]">
                        {p.source_file}
                      </td>
                      <td className="td">
                        <Badge tone="gold">#{p.predicted_rank}</Badge>
                      </td>
                      <td className="td">{(p.composite * 100).toFixed(1)}</td>
                      <td className="td">{(p.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  );
}

function ParameterCard({ param }: { param: ParameterScore }) {
  const [open, setOpen] = useState(false);
  const color = COLORS[param.parameter];
  return (
    <Card className="group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift animate-fade-up hover:border-[var(--border-3)]">
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-bold"
          style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
        >
          {param.parameter}
        </span>
        <span className="text-lg font-bold text-[var(--text-1)]">
          {param.weightedScore != null
            ? Number(param.weightedScore).toFixed(1)
            : "—"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-faint)]">{param.label}</p>
      <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
        {param.unweightedScore !== null
          ? `${Number(param.unweightedScore).toFixed(1)}/100 unweighted`
          : "—"}
      </p>
      {param.penalty ? (
        <p className="mt-0.5 text-xs font-medium text-rose-400">
          Penalty −{param.penalty}
        </p>
      ) : null}
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-xs font-semibold text-brand-500 hover:text-brand-300 transition-colors"
      >
        {open ? "Hide details" : "View details"}
      </button>
      {open && (
        <div className="mt-3 space-y-1.5 border-t border-[var(--border-2)] pt-3">
          {param.subs.map((s) => (
            <div
              key={s.key}
              className="flex justify-between items-center text-xs"
            >
              <span
                className="text-[var(--text-dim)] truncate max-w-[140px]"
                title={s.label}
              >
                {s.label}
              </span>
              {s.score !== null && !isNaN(Number(s.score)) ? (
                <span className="font-medium text-[var(--text-2)]">
                  {Number(s.score).toFixed(1)}
                </span>
              ) : (
                <span
                  className="font-medium text-brand-600"
                  title={s.missingFields.join(", ")}
                >
                  Insufficient data
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}