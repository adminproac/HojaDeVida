/** Reads a PDF in the browser with pdfjs-dist. Image-only pages come back empty. */

interface Glyph { str?: string; transform?: number[] }

export async function extractPdfText(data: ArrayBuffer | Uint8Array, workerSrc?: string): Promise<string> {
  const legacy = typeof globalThis.DOMMatrix === 'undefined';
  const pdfjs = legacy ? await import('pdfjs-dist/legacy/build/pdf.mjs') : await import('pdfjs-dist');
  const worker = workerSrc || (legacy ? '' : defaultWorkerSrc());
  if (worker) pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0));
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      pages.push(linesFromGlyphs(content.items as Glyph[]));
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}

function defaultWorkerSrc(): string {
  if (typeof document === 'undefined') return '';
  const base = document.querySelector('base')?.href || `${location.origin}/`;
  return new URL('pdf.worker.min.mjs', base).href;
}

function linesFromGlyphs(items: Glyph[]): string {
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
  for (const item of items) {
    if (!item.str || !item.transform) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
