import { Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export async function predictModelFromPdf(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

  try {
    const pdfPath = req.file.path;
    const harnessPath = path.resolve(__dirname, "../../../harness/predict_from_pdf.py");
    
    // Execute Python script
    const pythonProcess = spawn("python", [harnessPath, pdfPath], {
      cwd: path.resolve(__dirname, "../../../"),
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      // Clean up uploaded file if needed (optional - keep for debugging)
      // fs.unlink(pdfPath, () => {});
      
      if (code !== 0) {
        return res.status(500).json({
          error: "Python script failed",
          detail: stderr || stdout,
        });
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          return res.status(500).json(result);
        }
        return res.json(result);
      } catch (e: any) {
        return res.status(500).json({
          error: "Failed to parse Python output",
          detail: String(e),
          stdout: stdout,
        });
      }
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "Prediction failed",
      detail: String(e && e.message ? e.message : e),
    });
  }
}
