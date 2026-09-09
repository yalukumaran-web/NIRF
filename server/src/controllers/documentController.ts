import { Request, Response } from "express";
import { parsePdf } from "../services/pdfParser";
import { validateRawMetrics, acceptsExtraction } from "../services/validationService";
import { getInstitution } from "../services/authService";
import {
  saveUploadedDoc,
  listDocuments,
  getDocument,
  markDocumentStatus,
} from "../services/documentService";
import { audit } from "../services/audit";
import type { ExtractedNirf } from "../services/nirfExtractor";
import type { NIRFCategory, RawMetrics } from "../types/metrics";

export async function uploadDocument(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

  const inst = await getInstitution(req.user.userId);
  if (!inst) return res.status(404).json({ error: "No institution for user" });

  try {
    const parse = await parsePdf(req.file.path);

    const extracted = parse.extracted;
    let validation = null;
    if (parse.quality !== "invalid") {
      try {
        validation = validateRawMetrics(extracted as unknown as RawMetrics, {
          category: inst.category as NIRFCategory,
          year: new Date().getFullYear(),
        });
      } catch {
        validation = null;
      }
    }

    const id = await saveUploadedDoc({
      userId: req.user.userId,
      institutionId: inst.id,
      originalName: req.file.originalname,
      storageKey: req.file.path,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      parse,
      validation,
    });

    await audit(
      req.user,
      "document.upload",
      "uploaded_docs",
      String(id),
      { format: parse.format.format, quality: parse.quality, file: req.file.originalname }
    );

    return res.status(201).json({
      documentId: id,
      institution: inst,
      parse: {
        format: parse.format.format,
        confidence: parse.format.confidence,
        quality: parse.quality,
        pageCount: parse.pageCount,
        fieldPages: (extracted as ExtractedNirf).fieldPages ?? null,
      },
      extracted,
      missing: parse.missing,
      includesEstimates: (extracted as ExtractedNirf).includesEstimates ?? false,
      requiresExternalSources: (extracted as ExtractedNirf).requiresExternalSources ?? false,
      missingCount: (extracted as ExtractedNirf).missingCount ?? 0,
      validation,
      accepted: validation ? acceptsExtraction(validation) : false,
    });
  } catch (e) {
    return res
      .status(422)
      .json({ error: "Could not parse PDF", detail: String(e) });
  }
}

export async function listMyDocuments(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const docs = await listDocuments(req.user.userId, req.user.role);
  return res.json({ documents: docs });
}

export async function documentDetail(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid document id" });
  const doc = await getDocument(id, req.user.userId, req.user.role);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  return res.json({ document: doc });
}

export async function confirmDocument(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid document id" });
  const doc = await getDocument(id, req.user.userId, req.user.role);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const extracted = doc.extracted_json as Record<string, unknown>;
  const validation = doc.validation_report as Record<string, unknown> | null;
  const slice = (validation?.summary as Record<string, unknown>) ?? {};
  const complete = slice.complete === true;
  const insufficient = Array.isArray(slice.insufficientParameters)
    ? (slice.insufficientParameters as string[])
    : [];

  await markDocumentStatus(id, complete ? "validated" : "needs_review");
  await audit(req.user, "document.confirm", "uploaded_docs", String(id), {
    complete,
    insufficient,
  });

  return res.json({
    documentId: id,
    status: complete ? "validated" : "needs_review",
    extracted,
    complete,
    insufficient,
  });
}