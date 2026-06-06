// NODE-ONLY PDF text extraction (MAIL_AI_INTEGRATION §4.2), symmetric to
// requests/xlsx.ts. Dynamic import keeps pdfjs out of the web bundle — this is
// only ever called from the worker / Node utilities. A text PDF yields text; a
// scan PDF (almost no extractable text) is flagged so the orchestrator quarantines
// it instead of feeding a blank to the extractor (no native canvas in MVP).

const MIN_TEXT_CHARS = 40; // below this we treat the PDF as a scan

export interface PdfExtractResult {
  kind: "text" | "scan";
  text: string;
}

export async function pdfToText(buf: ArrayBuffer | Buffer): Promise<PdfExtractResult> {
  // Legacy build is the Node-friendly entry point.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = buf instanceof Buffer ? new Uint8Array(buf) : new Uint8Array(buf);
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it: unknown) => (typeof it === "object" && it && "str" in it ? String((it as { str: unknown }).str) : ""))
      .join(" ");
    parts.push(pageText);
  }
  await loadingTask.destroy();

  const text = parts.join("\n").replace(/[ \t]+/g, " ").trim();
  return { kind: text.length >= MIN_TEXT_CHARS ? "text" : "scan", text };
}
