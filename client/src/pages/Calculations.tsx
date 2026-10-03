import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "../components/ui";

interface CalcRun {
  id: number;
  institution_id: number;
  institution_name: string | null;
  category: string;
  year: number;
  kind: string;
  metrics_source: string;
  methodology_version: string | null;
  model_version: string | null;
  algorithm: string | null;
  final_score: number | null;
  weighted_score: number | null;
  confidence: number | null;
  predicted_rank: number | null;
  created_at: string;
}

export default function Calculations() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<CalcRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/calculations")
      .then((res) => setRuns(res.data.runs || []))
      .catch((e) =>
        setError(e.response?.data?.error || "Failed to load calculations")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Calculation History"
        description={`Traceable engine / ML runs · ${user?.email ?? ""}`}
      />

      {error && (
        <Alert tone="rose" title="Error:" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <Spinner label="Loading calculations…" />
      ) : runs.length === 0 ? (
        <EmptyState
          title="No calculation runs recorded"
          description="Compute a score to start building your traceability history."
          action={{ label: "Go to Upload", to: "/upload" }}
        />
      ) : (
        <Card className="animate-fade-up overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-[var(--border-2)] bg-[var(--surface-3)]">
                <tr>
                  <th className="th">Run</th>
                  <th className="th">Date</th>
                  <th className="th">Institution</th>
                  <th className="th">Kind</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Final</th>
                  <th className="th text-right">Pred. Rank</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="tr-hover border-b border-[var(--border)] last:border-0"
                  >
                    <td className="td font-mono text-xs">#{r.id}</td>
                    <td className="td">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="td font-medium text-[var(--text-1)]">
                      {r.institution_name || "—"}
                    </td>
                    <td className="td">
                      <Badge tone={r.kind === "engine" ? "blue" : "violet"}>
                        {r.kind}
                      </Badge>
                    </td>
                    <td className="td text-[var(--text-2)]">{r.metrics_source}</td>
                    <td className="td text-right font-bold text-[var(--text-1)]">
                      {r.final_score != null ? Number(r.final_score).toFixed(2) : "—"}
                    </td>
                    <td className="td text-right">
                      {r.predicted_rank != null ? (
                        <Badge tone="green">#{r.predicted_rank}</Badge>
                      ) : (
                        "—"
                      )}
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