import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  Alert,
  Badge,
  Card,
  cn,
  PageHeader,
  Reveal,
  Spinner,
} from "../components/ui";

interface DatasetVersionRow {
  id: number;
  version_tag: string;
  category: string;
  year: number;
  description: string | null;
  source: string;
  row_count: number;
  feature_keys: string[] | string;
  created_at: string;
}

interface CvMetrics {
  folds: number;
  mae: { mean: number; std: number };
  rmse: { mean: number; std: number };
  r2: { mean: number; std: number };
  pooled: { mae: number; rmse: number; r2: number; n: number };
}

interface TrainingRun {
  id: number;
  dataset_version: string;
  model_version: string;
  algorithm: string;
  train_size: number;
  test_size: number;
  seed: number | null;
  metrics: {
    mae: number;
    rmse: number;
    r2: number;
    n: number;
    crossValidation?: CvMetrics;
  };
  status: string;
  created_at: string;
}

interface ModelSummary {
  id: number;
  category: string;
  algorithm: string | null;
  model_version: string | null;
  dataset_version: string | null;
  feature_keys: string[] | null;
  metrics: {
    mae: number;
    rmse: number;
    r2: number;
    n: number;
    crossValidation?: CvMetrics;
  } | null;
  n_instances: number | null;
  trained_at: string;
}

export default function Mldashboard() {
  const { user } = useAuth();

  const [datasets, setDatasets] = useState<DatasetVersionRow[]>([]);
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [model, setModel] = useState<ModelSummary | null>(null);
  const [selectedDs, setSelectedDs] = useState("");
  const [algorithm, setAlgorithm] = useState("auto");
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trainMsg, setTrainMsg] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dsRes, runsRes, modelRes] = await Promise.all([
        api.get("/ml/datasets"),
        api.get("/ml/training-runs"),
        api.get("/ml/model"),
      ]);
      setDatasets(dsRes.data.datasets || []);
      setRuns(runsRes.data.runs || []);
      setModel(modelRes.data.model || null);
      if ((dsRes.data.datasets || []).length > 0) {
        setSelectedDs(dsRes.data.datasets[0].version_tag);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || "Failed to load ML state");
    } finally {
      setLoading(false);
    }
  }

  async function train() {
    if (!selectedDs) {
      setError("Select a dataset version to train on.");
      return;
    }
    setError("");
    setTrainMsg("");
    setTraining(true);
    try {
      const res = await api.post("/ml/train", {
        datasetVersion: selectedDs,
        algorithm,
      });
      setTrainMsg(
        `Trained ${res.data.algorithm} v${res.data.modelVersion} — MAE ${res.data.metrics.mae.toFixed(
          3
        )}, RMSE ${res.data.metrics.rmse.toFixed(3)}, R² ${res.data.metrics.r2.toFixed(
          3
        )}`
      );
      await loadAll();
    } catch (e: any) {
      setError(e.response?.data?.error || "Training failed");
    } finally {
      setTraining(false);
    }
  }

  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader
        title="ML Training"
        description="Admin · model lifecycle & traceability"
        actions={<Badge tone="amber">Admin</Badge>}
      />

      {loading ? (
        <Spinner label="Loading ML state…" />
      ) : (
        <div className="space-y-5">
          {error && (
            <Alert tone="rose" title="Error:">
              {error}
            </Alert>
          )}
          {trainMsg && (
            <Alert tone="green" title="Success:">
              {trainMsg}
            </Alert>
          )}

          <Reveal>
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">
                Train new model
              </h3>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="label" htmlFor="ds">
                    Dataset version
                  </label>
                  <select
                    id="ds"
                    className="input w-72"
                    value={selectedDs}
                    onChange={(e) => setSelectedDs(e.target.value)}
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.version_tag}>
                        {d.version_tag} · {d.category} {d.year} ({d.row_count}{" "}
                        rows)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="algo">
                    Algorithm
                  </label>
                  <select
                    id="algo"
                    className="input w-36"
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                  >
                    <option value="auto">auto</option>
                    <option value="linear">linear</option>
                    <option value="cart">cart</option>
                    <option value="forest">forest</option>
                    <option value="gbm">gbm</option>
                  </select>
                </div>
                <button
                  onClick={train}
                  disabled={training || datasets.length === 0}
                  className="btn-primary"
                >
                  {training ? "Training…" : "Train"}
                </button>
              </div>
              {datasets.length === 0 && (
                <p className="mt-3 text-xs text-[var(--text-2)]">
                  No dataset versions available. Seed official data or import a
                  dataset first.
                </p>
              )}
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-1)]">
                Active model
              </h3>
              {model ? (
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <Metric label="Algorithm" value={model.algorithm ?? "—"} />
                  <Metric label="Version" value={model.model_version ?? "—"} />
                  <Metric label="Dataset" value={model.dataset_version ?? "—"} />
                  <Metric
                    label="Instances"
                    value={String(model.n_instances ?? "—")}
                  />
                  <Metric
                    label="MAE"
                    value={model.metrics ? model.metrics.mae.toFixed(3) : "—"}
                  />
                  <Metric
                    label="RMSE"
                    value={model.metrics ? model.metrics.rmse.toFixed(3) : "—"}
                  />
                  <Metric
                    label="R²"
                    value={model.metrics ? model.metrics.r2.toFixed(3) : "—"}
                  />
                  <Metric
                    label="Trained"
                    value={new Date(model.trained_at).toLocaleString()}
                  />
                </div>
              ) : (
                <p className="text-sm text-[var(--text-2)]">No model trained yet.</p>
              )}
              {model?.metrics?.crossValidation && (
                <CvBlock cv={model.metrics.crossValidation} />
              )}
            </Card>
          </Reveal>

          <Reveal delay={140}>
            <Card className="overflow-hidden p-0">
              <div className="border-b border-[var(--border-2)] bg-[var(--surface-3)] px-5 py-3.5">
                <h3 className="text-sm font-semibold text-[var(--text-1)]">
                  Training runs
                </h3>
              </div>
              {runs.length === 0 ? (
                <p className="px-5 py-6 text-sm text-[var(--text-2)]">
                  No training runs recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left border-b border-brand-200">
                      <tr>
                        <th className="th">Run</th>
                        <th className="th">Dataset</th>
                        <th className="th">Algo</th>
                        <th className="th">Version</th>
                        <th className="th text-right">Train</th>
                        <th className="th text-right">Test</th>
                        <th className="th text-right">CV MAE (μ±σ)</th>
                        <th className="th text-right">MAE</th>
                        <th className="th text-right">RMSE</th>
                        <th className="th text-right">R²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr
                          key={r.id}
                          className="tr-hover border-b border-[var(--border)] last:border-0"
                        >
                          <td className="td font-mono text-xs">#{r.id}</td>
                          <td className="td font-medium text-[var(--text-1)]">
                            {r.dataset_version}
                          </td>
                          <td className="td">{r.algorithm}</td>
                          <td className="td">{r.model_version}</td>
                          <td className="td text-right">{r.train_size}</td>
                          <td className="td text-right">{r.test_size}</td>
                          <td className="td text-right font-semibold text-brand-700">
                            {r.metrics.crossValidation
                              ? `${r.metrics.crossValidation.mae.mean.toFixed(2)} ± ${r.metrics.crossValidation.mae.std.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="td text-right">{r.metrics.mae.toFixed(3)}</td>
                          <td className="td text-right">{r.metrics.rmse.toFixed(3)}</td>
                          <td className="td text-right">{r.metrics.r2.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </Reveal>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-2)] bg-[var(--surface-3)] p-3 transition-colors hover:bg-[var(--surface-4)]">
      <p className="text-xs text-[var(--text-2)]">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function CvBlock({ cv }: { cv: CvMetrics }) {
  return (
    <div className="mt-4 rounded-xl border-l-4 border-mint-400 bg-mint-100/50 p-4 text-sm">
      <p className="mb-2 text-xs font-semibold text-mint-800">
        {cv.folds}-fold cross-validation (mean ± std, pooled in brackets)
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniMetric
          label="CV MAE (μ±σ)"
          value={`${cv.mae.mean.toFixed(2)} ± ${cv.mae.std.toFixed(2)} [${cv.pooled.mae.toFixed(2)}]`}
        />
        <MiniMetric
          label="CV RMSE (μ±σ)"
          value={`${cv.rmse.mean.toFixed(2)} ± ${cv.rmse.std.toFixed(2)} [${cv.pooled.rmse.toFixed(2)}]`}
        />
        <MiniMetric
          label="CV R² (μ±σ)"
          value={`${cv.r2.mean.toFixed(3)} ± ${cv.r2.std.toFixed(3)} [${cv.pooled.r2.toFixed(3)}]`}
        />
        <MiniMetric label="Pooled n" value={String(cv.pooled.n)} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-2)] bg-[var(--surface-5)] p-2.5">
      <p className="text-[11px] text-mint-800/60">{label}</p>
      <p className={cn("mt-0.5 font-bold text-mint-800")}>{value}</p>
    </div>
  );
}