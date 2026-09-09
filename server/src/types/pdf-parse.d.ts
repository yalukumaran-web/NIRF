declare module "pdf-parse" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
    text: string;
  }
  interface PdfParseOptions {
    pagerender?: (pageData: any) => Promise<string>;
    max?: number;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: PdfParseOptions
  ): Promise<PdfParseResult>;
  export = pdfParse;
}
