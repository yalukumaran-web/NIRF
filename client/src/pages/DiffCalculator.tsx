import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types (mirror server/src/services/nirf/diff/types.ts) ────────────────────

type DiffStatus = "computed" | "partial" | "unable";

interface DiffRow {
  key: string;
  uiLabel: string;
  officialName: string;
  parameter: string;
  parameterWeight: number;
  maxMarks: number;
  actual: number | null;
  mine: number | null;
  delta: number | null;
  absDelta: number | null;
  status: DiffStatus;
  sourceTables: string[];
  missingTables: string[];
  note: string;
}

interface DiffReport {
  category: string;
  year: number;
  institution: { name?: string; id?: string } | null;
  expected: {
    slug: string;
    image: string;
    imageUrl: string;
    nirfId: string;
    instituteName: string;
    title: string;
    ocrConfidence: number;
    matchMethod: "filename" | "nirf-id" | "name-exact" | "name-similar";
  };
  rows: DiffRow[];
  summary: {
    compared: number;
    total: number;
    unableKeys: string[];
    totalAbsDelta: number;
    meanAbsDelta: number | null;
    maxAbsDelta: number | null;
    maxAbsDeltaLabel: string | null;
    maxAbsDeltaShare: number | null;
  };
  methodologyNote: string;
}

interface CollegeOption {
  slug: string;
  instituteName: string;
  nirfId: string;
  imageUrl: string;
  hasDatasetPdf: boolean;
}

interface CompareResponse {
  diff: DiffReport;
  provenance: string;
}

const MATCH_LABEL: Record<DiffReport["expected"]["matchMethod"], string> = {
  filename: "PDF filename ↔ graph filename",
  "nirf-id": "NIRF institute ID",
  "name-exact": "institute name (exact)",
  "name-similar": "institute name (similar)",
};

const STATUS_CHIP: Record<DiffStatus, string> = {
  computed:
    "bg-[var(--chip-success-bg)] text-[var(--chip-success-text)] border-[var(--chip-success-border)]",
  partial:
    "bg-[var(--chip-warn-bg)] text-[var(--text-active)] border-[var(--chip-warn-border)]",
  unable:
    "bg-[var(--chip-danger-bg)] text-[var(--chip-danger-text)] border-[var(--chip-danger-border)]",
};

const CHART_COLORS = {
  official: "#830000",
  mine: "#275889",
};

function fmt(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

function signed(v: number | null): string {
  if (v === null) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(2)}`;
}

function deltaClass(v: number | null): string {
  if (v === null) return "text-[var(--text-faintest)]";
  if (Math.abs(v) < 0.005) return "text-[var(--chip-success-text)]";
  return v > 0
    ? "text-[var(--chip-warn-text)]"
    : "text-[var(--chip-blue-text)]";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DiffCalculator() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [slug, setSlug] = useState("");
  const [result, setResult] = useState<DiffReport | null>(null);
  const [provenance, setProvenance] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<{ colleges: CollegeOption[] }>("/diff/colleges")
      .then((res) => setColleges(res.data.colleges))
      .catch(() => setColleges([]));
  }, []);

  async function compare(file: File) {
    setLoading(true);
    setError("");
    setResult(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (slug) fd.append("slug", slug);
      const res = await api.post<CompareResponse>("/diff/compare", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data.diff);
      setProvenance(res.data.provenance);
    } catch (e: any) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.detail ||
          "Comparison failed"
      );
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function reset() {
    setResult(null);
    setProvenance("");
    setFileName("");
    setError("");
  }

  const chartData = useMemo(
    () =>
      (result?.rows ?? []).map((r) => ({
        param: r.uiLabel,
        Official: r.actual,
        Computed: r.mine,
        max: r.maxMarks,
      })),
    [result]
  );

  const summary = result?.summary;

  return (
    <div>
      <PageHeader
        title="Diff Calculator"
        description="Compares the absolute-parameter engine against each institute's official NIRF 2025 values from expected_output/ — actual vs computed, with the difference for FSR, FQU, GPH, WD, RD, PCS and GUE."
      />

      {/* ── Input ── */}
      {!result && (
        <Card className="mb-5 space-y-5">
          <div>
            <label className="label">Official values to compare against</label>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-4)] bg-[var(--surface-5)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/10"
            >
              <option value="">
                Auto-detect from the uploaded PDF ({colleges.length} official
                graphs available)
              </option>
              {colleges.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.instituteName} — {c.nirfId}
                  {c.hasDatasetPdf ? "" : " (no sample PDF)"}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-[var(--text-faintest)]">
              Leave on auto to match by PDF filename, then NIRF ID, then
              institute name.
            </p>
          </div>

          <div className="border-t border-[var(--border)] pt-5">
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
                  if (f) void compare(f);
                }}
              />
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-glow transition-transform duration-300 group-hover:scale-110">
                <Icon path={ICON.upload} className="h-6 w-6" />
              </span>
              <span className="mt-5 text-sm font-semibold text-[var(--text-1)]">
                {loading ? "Comparing…" : "Choose a PDF or drop it here"}
              </span>
              <span className="mt-1.5 text-xs text-[var(--text-fainter)]">
                PDF only — tables are extracted automatically
              </span>
            </label>
          </div>
        </Card>
      )}

      {error && (
        <Alert tone="rose" className="mb-5" title="Comparison unavailable:">
          {error}
        </Alert>
      )}

      {loading && <Spinner label="Parsing PDF and comparing…" />}

      {/* ── Results ── */}
      {result && (
        <div className="space-y-5">
          {/* Matched institute */}
          <Reveal>
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                    Compared against official graph
                  </p>
                  <h2 className="mt-1.5 text-xl font-extrabold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {result.expected.instituteName}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-faint)]">
                    {result.expected.nirfId} &middot; {result.category}{" "}
                    {result.year} &middot; matched via{" "}
                    {MATCH_LABEL[result.expected.matchMethod]}
                  </p>
                  {provenance && (
                    <p className="mt-1 text-xs text-[var(--text-faintest)]">
                      {provenance}
                    </p>
                  )}
                </div>

                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faintest)]">
                      Compared
                    </p>
                    <p className="text-2xl font-extrabold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {summary?.compared}/{summary?.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faintest)]">
                      Mean |Δ|
                    </p>
                    <p className="text-2xl font-extrabold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {fmt(summary?.meanAbsDelta ?? null)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faintest)]">
                      Max |Δ|
                    </p>
                    <p className="text-2xl font-extrabold text-[var(--text-1)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {fmt(summary?.maxAbsDelta ?? null)}
                      {summary?.maxAbsDeltaLabel && (
                        <span className="ml-1 text-sm font-semibold text-[var(--text-faint)]">
                          {summary.maxAbsDeltaLabel}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <button onClick={reset} className="btn-outline mt-6">
                Compare Another PDF
              </button>
            </Card>
          </Reveal>

          {result.institution && (
            <Alert tone="blue" title="Institution read from the PDF:">
              {result.institution.name ?? "—"}
              {result.institution.id ? ` (${result.institution.id})` : ""}
              {fileName ? ` · ${fileName}` : ""}
            </Alert>
          )}

          {/* Difference table */}
          <Reveal delay={60}>
            <Card className="relative overflow-hidden">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                Actual vs Calculated
              </p>
              <p className="mb-4 text-xs text-[var(--text-faintest)]">
                Δ = actual − calculated. A negative Δ means the engine scores
                above the official value.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-2)]">
                      <th className="th">Parameter</th>
                      <th className="th text-right">Actual</th>
                      <th className="th text-right">Calculated</th>
                      <th className="th text-right">Δ</th>
                      <th className="th text-right">Max</th>
                      <th className="th text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.key} className="border-b border-[var(--border)] tr-hover">
                        <td className="td">
                          <span className="font-semibold text-[var(--text-1)]">
                            {r.uiLabel}
                          </span>{" "}
                          <span className="text-[var(--text-faint)]">
                            {r.officialName}
                          </span>
                          <p className="mt-0.5 text-[11px] text-[var(--text-faintest)]">
                            {r.note}
                          </p>
                        </td>
                        <td className="td text-right font-mono font-semibold text-[var(--text-1)]">
                          {fmt(r.actual)}
                        </td>
                        <td className="td text-right font-mono font-semibold text-brand-400">
                          {fmt(r.mine)}
                        </td>
                        <td
                          className={cn(
                            "td text-right font-mono font-bold",
                            deltaClass(r.delta)
                          )}
                        >
                          {signed(r.delta)}
                        </td>
                        <td className="td text-right font-mono text-[var(--text-fainter)]">
                          {r.maxMarks}
                        </td>
                        <td className="td text-right">
                          <span className={cn("chip border", STATUS_CHIP[r.status])}>
                            {r.status === "unable"
                              ? "Unable"
                              : r.status === "partial"
                                ? "Partial"
                                : "Computed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary && summary.unableKeys.length > 0 && (
                <Alert tone="amber" className="mt-4 text-left">
                  <strong>Not compared: </strong>
                  {summary.unableKeys.map((k) => k.toUpperCase()).join(", ")} —
                  the absolute engine could not compute these (source table
                  absent from the PDF). No value was fabricated.
                </Alert>
              )}

              <p className="mt-4 text-xs text-[var(--text-faintest)]">
                {result.methodologyNote}
              </p>
            </Card>
          </Reveal>

          {/* Paired bar chart */}
          <Reveal delay={120}>
            <Card>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                Official vs Computed
              </p>
              <p className="mb-4 text-xs text-[var(--text-faintest)]">
                Paired bars per sub-parameter, on each sub-parameter's own
                scale. A missing bar means that side had no value.
              </p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(131,0,0,0.12)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="param"
                    tick={{ fill: "var(--text-faint)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--text-faint)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(131,0,0,0.05)" }}
                    contentStyle={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-3)",
                      borderRadius: 10,
                      color: "var(--text-1)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [
                      typeof value === "number" ? value.toFixed(2) : "—",
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="Official"
                    fill={CHART_COLORS.official}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="Computed"
                    fill={CHART_COLORS.mine}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Reveal>

          {/* Official graph */}
          <Reveal delay={180}>
            <Card>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                Source graph — expected_output/{result.expected.image}
              </p>
              <img
                src={result.expected.imageUrl}
                alt={`Official NIRF 2025 score graph for ${result.expected.instituteName}`}
                className="w-full rounded-xl border border-[var(--border-2)] bg-white"
                loading="lazy"
              />
              <p className="mt-3 text-xs text-[var(--text-faintest)]">
                Official sub-parameter values read from this graph
                (OCR confidence {result.expected.ocrConfidence}%).
              </p>
            </Card>
          </Reveal>
        </div>
      )}
    </div>
  );
}
