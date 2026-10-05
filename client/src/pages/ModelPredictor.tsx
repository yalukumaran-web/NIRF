import { useState } from "react";
import { Alert, Card, Icon, ICON } from "../components/ui";
import api from "../services/api";

interface ExtractedAbsolute {
  [key: string]: any;
}

interface PredictedMarks {
  ESCS?: number;
  GPHD?: number;
  GMS?: number;
  FPPP?: number;
  SS?: number;
  FRU?: number;
}

interface ModelPredictResult {
  success: boolean;
  extracted_absolute: ExtractedAbsolute;
  predicted_fractions: { [key: string]: number };
  predicted_relative_marks: PredictedMarks;
  max_marks: { [key: string]: number };
  missing?: string[];
  error?: string;
  detail?: string;
}

export default function ModelPredictor() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModelPredictResult | null>(null);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError("");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
      setError("");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/predict-model", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.response?.data?.detail || "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const renderAbsoluteParams = () => {
    if (!result?.extracted_absolute) return null;
    const extracted = result.extracted_absolute;
    
    // Extract key params - show common ones
    const params = [
      { key: "escs_pct", label: "ESCS (%)", format: (v: any) => `${typeof v === "number" ? v.toFixed(3) : v}` },
      { key: "gphd_avg", label: "GPHD Avg", format: (v: any) => `${typeof v === "number" ? v.toFixed(3) : v}` },
      { key: "gms_median_salary", label: "GMS Median Salary (₹)", format: (v: any) => `${typeof v === "number" ? Math.round(v).toLocaleString("en-IN") : v}` },
      { key: "fppp_sponsored_per_faculty", label: "FPPP Sponsored/Faculty", format: (v: any) => `${typeof v === "number" ? v.toFixed(2) : v}` },
      { key: "total_students", label: "Total Students", format: (v: any) => `${typeof v === "number" ? Math.round(v).toLocaleString("en-IN") : v}` },
      { key: "fru_capital_per_student", label: "FRU Capital/Student (₹)", format: (v: any) => `${typeof v === "number" ? Math.round(v).toLocaleString("en-IN") : v}` },
      { key: "fru_operational_per_student", label: "FRU Op/Student (₹)", format: (v: any) => `${typeof v === "number" ? Math.round(v).toLocaleString("en-IN") : v}` },
    ];

    const foundParams = params.map((p) => {
      let val = extracted[p.key];
      if (val === undefined || val === null) {
        val = extracted[p.key.replace("_per_student", "_per_faculty")];
      }
      if (val === undefined || val === null) {
        val = extracted[p.key.replace("_pct", "")];
      }
      return { ...p, val };
    }).filter(p => p.val !== undefined && p.val !== null);

    if (foundParams.length === 0) {
      return <p className="text-sm text-gray-500">No absolute parameters extracted from this PDF.</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {foundParams.map((p) => (
          <div key={p.key} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">{p.label}</div>
            <div className="text-lg font-semibold mt-1 dark:text-white">{p.format(p.val)}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderPredictedMarks = () => {
    if (!result?.predicted_relative_marks) return null;
    const marks = result.predicted_relative_marks;
    const max = result.max_marks || {};
    
    const params = ["ESCS", "GPHD", "GMS", "FPPP", "SS", "FRU"];
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {params.map((p) => {
          const m = marks[p as keyof PredictedMarks];
          const mx = max[p] || 0;
          const isNullOrMissing = m === undefined || m === null;
          
          if (isNullOrMissing) {
            return (
              <div key={p} className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">{p}</div>
                  <div className="text-xs text-gray-400">out of {mx}</div>
                </div>
                <div className="text-lg font-semibold mt-1 text-gray-400 dark:text-gray-500">
                  N/A (Missing PDF Data)
                </div>
                <div className="text-xs text-gray-400 mt-1">Could not predict</div>
              </div>
            );
          }

          const numVal = Number(m);
          return (
            <div key={p} className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex justify-between items-center">
                <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">{p}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">out of {mx}</div>
              </div>
              <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-300">
                {numVal.toFixed(3)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {mx > 0 ? `${((numVal / mx) * 100).toFixed(2)}%` : "N/A"}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-2">Model-Based Relative Parameter Prediction</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Upload an NIRF DCS PDF to extract features and predict relative marks using trained ML models.
        </p>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
          onClick={() => document.getElementById("pdf-upload")?.click()}
        >
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Icon path={ICON.upload} className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          {file ? (
            <div>
              <p className="text-lg font-medium">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium">Drop your PDF here or click to browse</p>
              <p className="text-sm text-gray-500 mt-1">Upload NIRF DCS Engineering PDF</p>
            </div>
          )}
        </div>

        {file && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <Icon path={ICON.sparkles} className="h-5 w-5" />
                  Predict Using Models
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <Alert tone="rose" className="mt-4">
            <div className="whitespace-pre-wrap">{error}</div>
          </Alert>
        )}
      </Card>

      {result && result.success && (
        <>
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Icon path={ICON.chart} className="h-5 w-5" />
              Extracted Absolute Parameters
            </h3>
            {renderAbsoluteParams()}
            {result.missing && result.missing.length > 0 && (
              <div className="mt-4 text-sm text-amber-600 dark:text-amber-400">
                Missing fields: {result.missing.join(", ")}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Icon path={ICON.calculator} className="h-5 w-5" />
              Predicted Relative Marks
            </h3>
            {renderPredictedMarks()}
          </Card>
        </>
      )}
    </div>
  );
}
