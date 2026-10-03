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

interface DocumentRow {
  id: number;
  original_name: string;
  format: string;
  format_confidence: number | null;
  quality: string;
  page_count: number | null;
  size_bytes: number | null;
  status: string;
  created_at: string;
}

const STATUS_TONES: Record<string, string> = {
  uploaded: "slate",
  extracted: "blue",
  validated: "green",
  needs_review: "amber",
  confirmed: "green",
};

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/documents")
      .then((res) => setDocs(res.data.documents || []))
      .catch((e) =>
        setError(e.response?.data?.error || "Failed to load documents")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Uploaded Documents"
        description={`Traceability for PDF uploads & extraction · ${user?.email ?? ""}`}
      />

      {error && (
        <Alert tone="rose" title="Error:" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <Spinner label="Loading documents…" />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          description="Upload a NIRF credentials PDF to record it here."
          action={{ label: "Go to Upload", to: "/upload" }}
        />
      ) : (
        <RevealCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left border-b border-[var(--border-2)]">
                <tr>
                  <th className="th">ID</th>
                  <th className="th">File</th>
                  <th className="th">Format</th>
                  <th className="th">Quality</th>
                  <th className="th text-right">Pages</th>
                  <th className="th">Status</th>
                  <th className="th">Date</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    className="tr-hover border-b border-[var(--border)] last:border-0"
                  >
                    <td className="td font-mono text-xs">#{d.id}</td>
                    <td className="td truncate max-w-[220px]">{d.original_name}</td>
                    <td className="td">
                      {d.format}
                      {d.format_confidence != null ? (
                        <span className="text-[var(--text-faint)] text-xs">
                          {" "}
                          ({(d.format_confidence * 100).toFixed(0)}%)
                        </span>
                      ) : null}
                    </td>
                    <td className="td text-[var(--text-2)]">{d.quality}</td>
                    <td className="td text-right">{d.page_count ?? "—"}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONES[d.status] || "slate"}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="td">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RevealCard>
      )}
    </>
  );
}

function RevealCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="animate-fade-up p-0">
      {children}
    </Card>
  );
}