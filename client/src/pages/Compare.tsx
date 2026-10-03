import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { Badge, Card, cn, PageHeader, Reveal, Spinner } from "../components/ui";

interface InstitutionRow {
  id: number;
  name: string;
  category: string;
  year: number | null;
  final_score: number | null;
  has_insufficient: boolean | null;
}

interface CompareEntry {
  institutionId: number;
  name: string;
  category: string;
  engine: number | null;
  engineParams: { tlr: number | null; rp: number | null; go: number | null; oi: number | null; pr: number | null };
  official: number | null;
  officialParams: { tlr: number | null; rpc: number | null; go: number | null; oi: number | null; pr: number | null };
  officialRank: number | null;
  mlEstimate: number | null;
}

export default function Compare() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [results, setResults] = useState<CompareEntry[] | null>(null);
  const [mlVersion, setMlVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/institutions")
      .then((res) => setInstitutions(res.data.institutions || []))
      .catch((e) =>
        setError(e.response?.data?.error || "Failed to load institutions")
      )
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    );
  }

  async function compare() {
    if (selected.length < 2) {
      setError("Select at least 2 institutions to compare.");
      return;
    }
    setError("");
    setComparing(true);
    try {
      const res = await api.post("/comparisons", {
        institutionIds: selected,
        year: 2025,
      });
      setResults(res.data.institutions);
      setMlVersion(res.data.mlModelVersion);
    } catch (e: any) {
      setError(e.response?.data?.error || "Comparison failed");
    } finally {
      setComparing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Compare Institutions"
        description={`Engine vs Official vs ML estimate · ${user?.email ?? ""}`}
      />

      <div className="space-y-5">
        <Reveal>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-1)]">
                Select institutions (2–20)
              </h3>
              {selected.length > 0 && (
                <span className="chip bg-brand-700/15 text-[var(--text-1)]">
                  {selected.length} selected
                </span>
              )}
            </div>

            {loading ? (
              <Spinner label="Loading institutions…" />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {institutions.map((i, idx) => {
                  const on = selected.includes(i.id);
                  return (
                    <label
                      key={i.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition-all duration-150 animate-fade-up",
                        on
                          ? "border-brand-700/60 bg-[var(--surface-3)] shadow-sm"
                          : "border-[var(--border-2)] bg-[var(--surface-5)] hover:border-brand-700 hover:bg-[var(--surface-4)]"
                      )}
                      style={{ animationDelay: `${idx * 12}ms` }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(i.id)}
                        className="h-4 w-4 shrink-0 rounded border-brand-700/60 accent-brand-700"
                      />
                      <span className="truncate font-medium text-[var(--text-1)]">
                        {i.name}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] ml-auto">
                        {i.category}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={compare}
                disabled={comparing || selected.length < 2}
                className="btn-primary"
              >
                {comparing
                  ? "Comparing…"
                  : `Compare (${selected.length} selected)`}
              </button>
              {error && (
                <span className="text-sm font-medium text-rose-600">{error}</span>
              )}
            </div>
          </Card>
        </Reveal>

        {results && (
          <Reveal>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[var(--border-2)] bg-[var(--surface-3)] px-5 py-3.5">
                <h3 className="text-sm font-semibold text-[var(--text-1)]">
                  Comparison · NIRF 2025
                </h3>
                {mlVersion && (
                  <Badge tone="blue">ML model v{mlVersion}</Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-[var(--border-2)]">
                    <tr>
                      <th className="th">Institute</th>
                      <th className="th text-right">Engine</th>
                      <th className="th text-right">Official</th>
                      <th className="th text-right">Official Rank</th>
                      <th className="th text-right">ML Estimate</th>
                      <th className="th text-right">Δ Engine vs Official</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const delta =
                        r.engine != null && r.official != null
                          ? r.engine - r.official
                          : null;
                      return (
                        <tr
                          key={r.institutionId}
                          className="tr-hover border-b border-[var(--border)] last:border-0"
                        >
                          <td className="td font-medium text-[var(--text-1)]">{r.name}</td>
                          <td className="td text-right">
                            {r.engine != null ? Number(r.engine).toFixed(2) : "—"}
                          </td>
                          <td className="td text-right font-bold text-[var(--text-1)]">
                            {r.official != null ? Number(r.official).toFixed(2) : "—"}
                          </td>
                          <td className="td text-right">
                            {r.officialRank != null ? (
                              <Badge tone="green">#{r.officialRank}</Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="td text-right">
                            {r.mlEstimate != null
                              ? Number(r.mlEstimate).toFixed(2)
                              : "—"}
                          </td>
                          <td
                            className={cn(
                              "td text-right font-semibold",
                              delta == null
                                ? "text-[var(--text-faint)]"
                                : Math.abs(delta) < 1
                                ? "text-emerald-600"
                                : "text-amber-600"
                            )}
                          >
                            {delta != null
                              ? `${delta >= 0 ? "+" : ""}${Number(delta).toFixed(2)}`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </Reveal>
        )}
      </div>
    </>
  );
}