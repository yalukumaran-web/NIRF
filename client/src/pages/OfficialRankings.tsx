import { useEffect, useState } from "react";
import api from "../services/api";
import {
  Alert,
  Card,
  cn,
  PageHeader,
  Reveal,
  Spinner,
} from "../components/ui";

interface OfficialScore {
  rank: number;
  institute_id: string | null;
  institute_name: string;
  score: number;
  tlr: number | null;
  rpc: number | null;
  go: number | null;
  oi: number | null;
  pr: number | null;
}

const CATEGORY_OPTIONS = [
  "engineering",
  "overall",
  "university",
  "management",
  "medical",
  "law",
  "pharmacy",
  "architecture",
  "dental",
  "agriculture",
];

export default function OfficialRankings() {
  const [category, setCategory] = useState("engineering");
  const [year, setYear] = useState(2025);
  const [scores, setScores] = useState<OfficialScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/rankings/official", { params: { category, year } })
      .then((res) => setScores(res.data.scores || []))
      .catch((e) =>
        setError(e.response?.data?.error || "Failed to load rankings")
      )
      .finally(() => setLoading(false));
  }, [category, year]);

  return (
    <>
      <PageHeader
        title="Official NIRF Rankings"
        description="Published ground truth for model calibration and comparison"
      />

      <Reveal>
        <Card className="mb-5 flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="cat">
              Category
            </label>
            <select
              id="cat"
              className="input w-52"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="yr">
              Year
            </label>
            <input
              id="yr"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input w-24"
            />
          </div>
        </Card>
      </Reveal>

      {error && (
        <Alert tone="rose" title="Error:" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <Spinner label="Loading rankings…" />
      ) : scores.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-2)]">
            No official scores published for {category} {year}.
          </p>
        </Card>
      ) : (
        <Card className="animate-fade-up overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-[var(--border-2)] bg-[var(--surface-3)]">
                <tr>
                  <th className="th">Rank</th>
                  <th className="th">Institute</th>
                  <th className="th text-right">Score</th>
                  <th className="th text-right">TLR</th>
                  <th className="th text-right">RPC</th>
                  <th className="th text-right">GO</th>
                  <th className="th text-right">OI</th>
                  <th className="th text-right">PR</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr
                    key={s.rank}
                    className="tr-hover border-b border-[var(--border)] last:border-0"
                  >
                    <td className="td">
                      <span
                        className={cn(
                          "inline-grid h-7 w-8 place-items-center rounded-lg font-bold",
                          s.rank <= 3
                            ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-glow"
                            : "text-[var(--text-1)]"
                        )}
                      >
                        {s.rank}
                      </span>
                    </td>
                    <td className="td font-medium text-[var(--text-1)]">
                      {s.institute_name}
                    </td>
                    <td className="td text-right font-bold text-[var(--text-1)]">
                      {Number(s.score).toFixed(2)}
                    </td>
                    <td className="td text-right">
                      {s.tlr != null ? Number(s.tlr).toFixed(2) : "—"}
                    </td>
                    <td className="td text-right">
                      {s.rpc != null ? Number(s.rpc).toFixed(2) : "—"}
                    </td>
                    <td className="td text-right">
                      {s.go != null ? Number(s.go).toFixed(2) : "—"}
                    </td>
                    <td className="td text-right">
                      {s.oi != null ? Number(s.oi).toFixed(2) : "—"}
                    </td>
                    <td className="td text-right">
                      {s.pr != null ? Number(s.pr).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}