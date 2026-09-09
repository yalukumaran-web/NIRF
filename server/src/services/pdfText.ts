import fs from "fs";

let pdfjs: any = null;
let workerReady = false;

function resolveWorkerSrc(): string {
  // @ts-ignore require exists in CJS output
  return (typeof require !== "undefined" && require.resolve) 
    // @ts-ignore
    ? require.resolve("pdfjs-dist/legacy/build/pdf.worker.js")
    : "pdfjs-dist/legacy/build/pdf.worker.js";
}

async function getPdfjs() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
  }
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = resolveWorkerSrc();
    workerReady = true;
  }
  return pdfjs;
}

/** Extract all text from a PDF buffer using pdfjs-dist. */
export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  const parts: string[] = [];
  for (const page of await extractPdfPagesFromBuffer(buffer)) {
    parts.push(`[PAGE ${page.page}] ${page.text.trim()}`);
  }
  return parts.join("\n");
}

export interface PdfPageText {
  page: number;
  text: string;
}

/** Extract per-page text from a PDF buffer (page-aware extraction support). */
export async function extractPdfPagesFromBuffer(buffer: Buffer): Promise<PdfPageText[]> {
  const pdf = await getPdfjs();
  const data = new Uint8Array(buffer);
  const doc = await pdf.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages: PdfPageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: any) => (it.str !== undefined ? it.str : ""))
      .join(" ");
    pages.push({ page: p, text: line.trim() });
  }
  await doc.destroy();
  return pages;
}

/** Extract text from a PDF file path. */
export async function extractPdfText(filePath: string): Promise<string> {
  return extractPdfTextFromBuffer(fs.readFileSync(filePath));
}
