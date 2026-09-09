import { pool } from "../db/db";
import type { PdfParseResult } from "./pdfParser";
import type { ValidationReport } from "./validationService";

export interface DocumentRow {
  id: number;
  user_id: number | null;
  institution_id: number | null;
  original_name: string;
  storage_key: string;
  mime_type: string | null;
  size_bytes: number | null;
  format: string;
  format_confidence: number | null;
  quality: string;
  page_count: number | null;
  section_report: unknown;
  extracted_json: unknown;
  field_sources: unknown;
  missing_fields: unknown;
  validation_report: unknown;
  status: string;
  created_at: string;
}

export interface SaveDocumentInput {
  userId: number;
  institutionId: number | null;
  originalName: string;
  storageKey: string;
  mimeType: string | null;
  sizeBytes: number | null;
  parse: PdfParseResult;
  validation: ValidationReport | null;
}

export async function saveUploadedDoc(input: SaveDocumentInput): Promise<number> {
  const row = await pool.query(
    `INSERT INTO uploaded_docs
       (user_id, institution_id, original_name, storage_key, mime_type, size_bytes,
        format, format_confidence, quality, page_count, section_report, extracted_json,
        field_sources, missing_fields, validation_report, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             CASE WHEN $16 THEN 'validated' ELSE 'extracted' END)
     RETURNING id`,
    [
      input.userId,
      input.institutionId,
      input.originalName,
      input.storageKey,
      input.mimeType,
      input.sizeBytes,
      input.parse.format.format,
      input.parse.format.confidence ?? null,
      input.parse.quality,
      input.parse.pageCount,
      JSON.stringify(input.parse.format.sections ?? null),
      JSON.stringify(input.parse.extracted),
      JSON.stringify(input.parse.extracted.fieldSources ?? null),
      JSON.stringify(input.parse.missing),
      input.validation ? JSON.stringify(input.validation) : null,
      input.validation ? input.validation.summary.complete : false,
    ]
  );
  return row.rows[0].id as number;
}

export async function listDocuments(
  userId: number,
  role: string
): Promise<DocumentRow[]> {
  const where = role === "admin" ? "TRUE" : "user_id = $1";
  const params = role === "admin" ? [] : [userId];
  const res = await pool.query(
    `SELECT id, user_id, institution_id, original_name, storage_key, mime_type,
            size_bytes, format, format_confidence, quality, page_count,
            missing_fields, status, created_at
     FROM uploaded_docs WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  return res.rows as DocumentRow[];
}

export async function getDocument(
  id: number,
  userId?: number,
  role?: string
): Promise<DocumentRow | null> {
  const rows = await pool.query(
    `SELECT * FROM uploaded_docs WHERE id = $1 AND ($2 = 'admin' OR user_id = $3)`,
    [id, role ?? "", userId ?? 0]
  );
  return (rows.rows[0] as DocumentRow) || null;
}

export async function markDocumentStatus(
  id: number,
  status: string
): Promise<void> {
  await pool.query(`UPDATE uploaded_docs SET status = $1 WHERE id = $2`, [
    status,
    id,
  ]);
}

export async function getDocumentExtracted(
  id: number
): Promise<Record<string, unknown> | null> {
  const rows = await pool.query(
    `SELECT extracted_json FROM uploaded_docs WHERE id = $1`,
    [id]
  );
  const v = rows.rows[0]?.extracted_json;
  return typeof v === "string" ? JSON.parse(v) : v;
}