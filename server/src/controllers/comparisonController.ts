import { Request, Response } from "express";
import { z } from "zod";
import { query } from "../db/db";
import { getActiveModelArtifact } from "../services/mlService";
import { predictBatch } from "../ml/trainer";

const compareSchema = z.object({
  institutionIds: z.array(z.number().int().positive()).min(2).max(20),
  year: z.number().int().optional(),
});

export async function compareInstitutions(req: Request, res: Response) {
  const parsed = compareSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { institutionIds, year } = parsed.data;
  const calYear = year ?? 2025;

  const rows = await query(
    `SELECT i.id AS institution_id, i.name, i.category,
            s.final_score, s.year, s.tlr, s.rp, s.go, s.oi, s.pr,
            os.score AS official_score, os.tlr AS official_tlr, os.rpc AS official_rpc,
            os.go AS official_go, os.oi AS official_oi, os.pr AS official_pr,
            os.rank AS official_rank
     FROM institutions i
     LEFT JOIN scores s ON s.id = (
       SELECT id FROM scores s2 WHERE s2.institution_id = i.id
         AND s2.year = $2 ORDER BY s2.year DESC LIMIT 1
     )
     LEFT JOIN official_scores os ON os.category = i.category AND os.year = $2
       AND lower(os.institute_name) = lower(i.name)
     WHERE i.id = ANY($1::int[])`,
    [institutionIds, calYear]
  );

  const artifact = await getActiveModelArtifact();
  let mlEstimates: Record<string, number> = {};
  let mlModelVersion: string | null = null;
  if (artifact && rows.length > 0) {
    const fk = artifact.featureKeys;
    mlModelVersion = String((artifact.fitMeta as Record<string, unknown>)?.modelVersion ?? "1.0.0");
    const officialCol: Record<string, string> = {
      tlr: "official_tlr",
      rpc: "official_rpc",
      go: "official_go",
      oi: "official_oi",
      pr: "official_pr",
    };
    const engineCol: Record<string, string> = {
      tlr: "tlr",
      rpc: "rp",
      go: "go",
      oi: "oi",
      pr: "pr",
    };
    const list = rows.map((r) => ({
      id: String(r.institution_id),
      features: fk.map((k: string) => {
        const row = r as Record<string, unknown>;
        const official = row[officialCol[k]] ?? null;
        const engine = row[engineCol[k]] ?? null;
        const v = (official !== null && official !== undefined ? official : engine) ?? 0;
        return typeof v === "number" ? v : Number(v) || 0;
      }),
    }));
    const preds = predictBatch(artifact, list);
    mlEstimates = Object.fromEntries(
      preds.map((p) => [p.id, Math.max(0, Math.min(100, p.predicted))])
    );
  }

  return res.json({
    year: calYear,
    institutions: rows.map((r) => ({
      institutionId: r.institution_id,
      name: r.name,
      category: r.category,
      engine: r.final_score === null ? null : Number(r.final_score),
      engineParams: {
        tlr: r.tlr == null ? null : Number(r.tlr),
        rp: r.rp == null ? null : Number(r.rp),
        go: r.go == null ? null : Number(r.go),
        oi: r.oi == null ? null : Number(r.oi),
        pr: r.pr == null ? null : Number(r.pr),
      },
      official: r.official_score === null ? null : Number(r.official_score),
      officialParams: {
        tlr: r.official_tlr == null ? null : Number(r.official_tlr),
        rpc: r.official_rpc == null ? null : Number(r.official_rpc),
        go: r.official_go == null ? null : Number(r.official_go),
        oi: r.official_oi == null ? null : Number(r.official_oi),
        pr: r.official_pr == null ? null : Number(r.official_pr),
      },
      officialRank: r.official_rank == null ? null : Number(r.official_rank),
      mlEstimate: mlEstimates[String(r.institution_id)] ?? null,
    })),
    mlModelVersion,
  });
}