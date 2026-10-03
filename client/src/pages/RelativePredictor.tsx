import { useRef, useState } from "react";
import api from "../services/api";
import { Alert, Card, cn, Icon, ICON, PageHeader, Reveal, Spinner } from "../components/ui";
import { RelativeParamCard } from "../components/relative/RelativeParamCard";
import { RelativeInfoPanel } from "../components/relative/RelativeInfoPanel";
import type {
  RelativeFieldKey,
  RelativePredictResponse,
  RelativeReport,
} from "../types/relative";

// ─── Field catalog (the 18 raw institutional inputs) ──────────────────────────

const FIELDS: { key: RelativeFieldKey; label: string; unit: string; hint: string }[] = [
  { key: "capitalExpenditure", label: "Capital Expenditure", unit: "INR", hint: "Capital spend, e.g. 4.43e9" },
  { key: "operationalExpenditure", label: "Operational Expenditure", unit: "INR", hint: "Operational spend, e.g. 7.83e9" },
  { key: "totalPublications", label: "Total Publications", unit: "count", hint: "Research publications in window" },
  { key: "totalCitations", label: "Total Citations", unit: "count", hint: "Citations received in window" },
  { key: "top25Citations", label: "Citations in Top 25% journals", unit: "count", hint: "Publications in top-quartile venues" },
  { key: "patentsFiled", label: "Patents Filed", unit: "count", hint: "Filed in window" },
  { key: "patentsGranted", label: "Patents Granted", unit: "count", hint: "Granted in window" },
  { key: "sponsoredResearchAmount", label: "Sponsored Research Funds", unit: "INR", hint: "Value, e.g. 5.65e9" },
  { key: "consultancyRevenue", label: "Consultancy Revenue", unit: "INR", hint: "Value, e.g. 1e9" },
  { key: "phdGraduates", label: "PhD Graduates", unit: "count", hint: "3-yr PhD graduating window" },
];

const DEFAULTS: Record<string, string> = {
  capitalExpenditure: "4100000000",
  operationalExpenditure: "7200000000",
  totalPublications: "5400",
  totalCitations: "66000",
  top25Citations: "21800",
  patentsFiled: "298",
  patentsGranted: "160",
  sponsoredResearchAmount: "5200000000",
  consultancyRevenue: "900000000",
  phdGraduates: "540",
};

const CONTRIB_MAX: Record<string, number> = {
  RP: 100, // PU 35 + QP 40 + IPR 15 + FPPP 10
  GO: 20,  // GPHD 20
  PR: 100,
};
const WEIGHTS: Record<string, number> = { RP: 0.3, GO: 0.2, PR: 0.1 };

// ─── Main component ───────────────────────────────────────────────────────────

export default function RelativePredictor() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(2025);
  const [rank, setRank] = useState("");
  const [instName, setInstName] = useState("");
  const [instId, setInstId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNote, setFileNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<RelativeReport | null>(null);
  const [modelMeta, setModelMeta] = useState<RelativePredictResponse["modelMeta"] | null>(null);
  const [error, setError] = useState("");

  function setField(k: string, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function loadSample() {
    setFileNote("");
    setValues({ ...DEFAULTS });
    setRank("35");
    setInstName("Example Institute of Technology");
    setInstId("IR-E-U-E-X01");
  }

  function clearAll() {
    setValues({});
    setRank("");
    setReport(null);
    setError("");
    setFileNote("");
  }

  function parseFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const obj = text.trim().startsWith("[") || text.trim().startsWith("{")
          ? JSON.parse(text)
          : null;
        if (obj) {
          const fields = obj.fields ?? obj.raw ?? (Array.isArray(obj) ? obj[0]?.fields ?? obj[0]?.raw : obj);
          let filled = 0;
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(fields ?? {})) {
            const nv = typeof v === "number" ? v : (v as any)?.value;
            if (nv !== undefined && nv !== null) {
              next[k] = String(nv);
              filled += 1;
            }
          }
          setValues((s) => ({ ...s, ...next }));
          if (obj.instituteName) setInstName(obj.instituteName);
          if (obj.instituteId) setInstId(obj.instituteId);
          if (obj.rank !== undefined && obj.rank !== null) setRank(String(obj.rank));
          if (obj.year) setYear(Number(obj.year));
          setFileNote(`Loaded ${filled} field${filled === 1 ? "" : "s"} from JSON`);
        } else if (text.trim()) {
          // CSV: header row of field keys
          const lines = text.trim().split(/\r?\n/);
          const header = lines[0].split(",").map((h) => h.trim());
          const row = lines[1] ? lines[1].split(",").map((c) => c.trim()) : [];
          let filled = 0;
          const next: Record<string, string> = {};
          header.forEach((h, i) => {
            if (row[i] !== undefined && row[i] !== "") {
              next[h] = row[i];
              filled += 1;
            }
          });
          setValues((s) => ({ ...s, ...next }));
          setFileNote(`Loaded ${filled} field${filled === 1 ? "" : "s"} from CSV`);
        }
      } catch (e: any) {
        setError("Could not parse file — use JSON { fields: {…} } or CSV with field-key headers.");
      }
    };
    reader.readAsText(file);
  }

  function filledCount(): number {
    return Object.values(values).filter((v) => v !== undefined && v.trim() !== "").length;
  }

  async function predict() {
    setError("");
    setReport(null);
    const missing = FIELDS.filter((f) => !values[f.key] || values[f.key].trim() === "").map((f) => f.key);
    if (missing.length > 0) {
      setError(`Missing required inputs: ${missing.join(", ")}. Provide all 18 raw values (or press “Load sample”).`);
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, any> = {
        year,
        rank: rank.trim() !== "" ? Number(rank) : null,
        instituteName: instName.trim() !== "" ? instName : undefined,
        instituteId: instId.trim() !== "" ? instId : undefined,
        raw: {},
      };
      for (const f of FIELDS) {
        const v = Number(values[f.key]);
        if (Number.isFinite(v)) {
          body.raw[f.key] = { value: v, source: "from_dcs_pdf", basis: "user-provided DCS figures" };
        } else {
          body.raw[f.key] = { value: null, source: "missing" };
        }
      }
      const res = await api.post("/relative/predict", body);
      const data: RelativePredictResponse = res.data;
      setReport(data.report);
      setModelMeta(data.modelMeta);
    } catch (e: any) {
      setError(e.response?.data?.error || e.response?.data?.detail || "Relative prediction failed.");
    } finally {
      setLoading(false);
    }
  }

  function weightedScore(r: RelativeReport): number | null {
    const anyNull = r.params.some((p) => (p.score ?? null) === null);
    if (anyNull) return null;
    const parts: [string, number][] = [];
    for (const param of ["TLR", "RP", "GO", "PR"]) {
      const members = r.params.filter((p) => p.parameter === param);
      const sum = members.reduce((a, p) => a + (p.score ?? 0), 0);
      parts.push([param, (sum / CONTRIB_MAX[param]) * WEIGHTS[param]]);
    }
    return Math.round(parts.reduce((a, [, v]) => a + v, 0) * 100) / 100;
  }

  const finalScore = report ? weightedScore(report) : null;

  return (
    <div>
      <PageHeader
        title="Relative Parameter Predictor"
        description="Predict the 10 cohort-relative NIRF sub-parameters (SS · FRU · PU · QP · IPR · FPPP · GPH · GPHD · MS · PR) from a college's dataset — scored against that year's peer cohort, with full provenance traces."
      />

      {error && (
        <Alert tone="rose" title="Error:" className="mb-5 whitespace-pre-line">
          {error}
        </Alert>
      )}

      {!report && (
        <Reveal>
          <Card className="space-y-5">
            {/* Row: basic identity */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="rp-year">Score Year</label>
                <input id="rp-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-full" />
              </div>
              <div>
                <label className="label" htmlFor="rp-rank">NIRF Rank (optional)</label>
                <input id="rp-rank" type="number" value={rank} onChange={(e) => setRank(e.target.value)} className="input w-full" placeholder="e.g. 35" />
              </div>
              <div>
                <label className="label" htmlFor="rp-name">Institute Name</label>
                <input id="rp-name" value={instName} onChange={(e) => setInstName(e.target.value)} className="input w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="label" htmlFor="rp-id">Institute ID</label>
                <input id="rp-id" value={instId} onChange={(e) => setInstId(e.target.value)} className="input w-full" placeholder="IR-E-…" />
              </div>
            </div>

            {/* Upload / sample actions */}
            <div className="flex flex-wrap items-center gap-3 border-y border-[var(--border)] py-4">
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && parseFile(e.target.files[0])}
              />
              <button onClick={() => fileRef.current?.click()} className="btn-outline">
                <Icon path={ICON.upload} className="mr-1.5 inline h-4 w-4" />
                Upload dataset (JSON / CSV)
              </button>
              <button onClick={loadSample} className="btn-outline">Load sample</button>
              <button onClick={clearAll} className="btn-ghost text-xs text-[var(--text-faint)] hover:text-[var(--text-1)]">Clear</button>
              {fileNote && <span className="text-xs text-[var(--chip-success-text)]">{fileNote}</span>}
              <span className="ml-auto text-xs text-[var(--text-fainter)]">
                {filledCount()} / {FIELDS.length} fields filled
              </span>
            </div>

            {/* Raw inputs grid */}
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 xl:grid-cols-3">
              {FIELDS.map((f, idx) => {
                const v = values[f.key];
                const has = v !== undefined && v.trim() !== "";
                return (
                  <div
                    key={f.key}
                    className="animate-fade-up"
                    style={{ animationDelay: `${idx * 12}ms` }}
                  >
                    <label className="label" htmlFor={`rp-field-${f.key}`}>
                      {f.label} <span className="font-normal text-[var(--text-fainter)]">({f.unit})</span>
                    </label>
                    <input
                      id={`rp-field-${f.key}`}
                      type="number"
                      value={v ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.hint}
                      className={cn("input w-full", has && "border-[var(--chip-success-border)] bg-emerald-950/20 focus:border-emerald-600/50")}
                    />
                  </div>
                );
              })}
            </div>

            <button
              onClick={predict}
              disabled={loading}
              className={cn("btn-primary w-full py-3")}
            >
              {loading ? "Predicting Parameters…" : `Predict ${filledCount()} / ${FIELDS.length} relative parameters`}
            </button>
            <p className="text-[11px] leading-relaxed text-[var(--text-fainter)]">
              Upload a college dataset (CSV/JSON of the 18 raw inputs, or Step-1 NIRF field names), or fill the form.
              The server predicts every parameter against its stored cohort and returns source tags, formula, trace &
              honest confidence per card.
            </p>
          </Card>
        </Reveal>
      )}

      {loading && <Spinner label="Predicting…" />}

      {report && modelMeta && (
        <div className="space-y-5">
          <Reveal>
            <Card className="relative overflow-hidden py-10 text-center animate-scale-in">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
              <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                Predicted Relative NIRF Score {report.year}
              </p>
              <p
                className="mt-4 text-6xl font-extrabold tracking-tight text-gradient"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                {finalScore === null ? "—" : finalScore.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-[var(--text-fainter)]">/ 100 weighted (TLR 30% · RP 30% · GO 20% · PR 10%)</p>
              {report.institution?.name && (
                <p className="mt-1 text-xs text-[var(--text-faint)]">{report.institution.name}</p>
              )}
              {finalScore === null && (
                <Alert tone="amber" className="mx-auto mt-4 max-w-lg text-left">
                  Some parameters could not be computed — see the card statuses below.
                </Alert>
              )}
              <button onClick={() => setReport(null)} className="btn-outline mt-7">
                Enter Another College
              </button>
            </Card>
          </Reveal>

          <RelativeInfoPanel
            cohort={report.cohort}
            summary={report.summary}
            methodologyNote={report.methodologyNote}
            modelMeta={modelMeta}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {report.params.map((p, i) => (
              <RelativeParamCard key={p.key} param={p} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}