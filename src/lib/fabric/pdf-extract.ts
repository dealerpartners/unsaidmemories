/**
 * PDF page-image extraction — the annotator's render path.
 *
 * There is no PDF renderer in this bundle (no pdfjs), so the
 * annotator takes the honest route available: PDFs produced by this
 * studio's own assembler (lib/fabric/pdf.ts) embed each page as a
 * full-page JPEG image XObject with a /DeviceRGB color space. This
 * extractor finds the largest such embedded JPEG stream, slices it
 * out byte-exactly using the dictionary's /Length, and reads the
 * page's /MediaBox for its physical size. Many supplier-portal PDFs
 * are built the same way (a scanned or rendered page image), so they
 * open too; a truly vector-only PDF returns null and the caller says
 * so plainly, offering the page's PNG instead.
 */

export interface ExtractedPdfPage {
  /** The embedded page image, JPEG bytes. */
  jpegBytes: Uint8Array;
  /** Pixel dimensions of the embedded image. */
  pxW: number;
  pxH: number;
  /** Physical page size in inches, from the MediaBox. */
  wIn: number;
  hIn: number;
}

export function extractPdfPageImage(pdf: Uint8Array): ExtractedPdfPage | null {
  // latin1 keeps a 1:1 char<->byte index mapping for slicing.
  const text = new TextDecoder("latin1").decode(pdf);

  const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!box) return null;
  const wIn = parseFloat(box[1]) / 72;
  const hIn = parseFloat(box[2]) / 72;

  let best: ExtractedPdfPage | null = null;
  let searchFrom = 0;
  for (;;) {
    const streamAt = text.indexOf("stream", searchFrom);
    if (streamAt < 0) break;
    searchFrom = streamAt + 6;
    // The object dictionary sits just before the stream keyword.
    const dict = text.slice(Math.max(0, streamAt - 600), streamAt);
    if (!dict.includes("/DCTDecode") || !dict.includes("/DeviceRGB")) continue;
    // The window can reach back into the PREVIOUS object's dictionary —
    // the values that belong to this stream are the LAST ones before it.
    const last = (re: RegExp) => {
      const all = [...dict.matchAll(re)];
      return all.length ? all[all.length - 1] : null;
    };
    const lenMatch = last(/\/Length\s+(\d+)/g);
    const wMatch = last(/\/Width\s+(\d+)/g);
    const hMatch = last(/\/Height\s+(\d+)/g);
    if (!lenMatch || !wMatch || !hMatch) continue;
    let dataStart = streamAt + "stream".length;
    if (text[dataStart] === "\r") dataStart++;
    if (text[dataStart] === "\n") dataStart++;
    const length = parseInt(lenMatch[1], 10);
    if (dataStart + length > pdf.length) continue;
    const jpegBytes = pdf.slice(dataStart, dataStart + length);
    // Sanity: JPEG SOI marker.
    if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) continue;
    const candidate: ExtractedPdfPage = {
      jpegBytes,
      pxW: parseInt(wMatch[1], 10),
      pxH: parseInt(hMatch[1], 10),
      wIn,
      hIn,
    };
    if (!best || candidate.jpegBytes.length > best.jpegBytes.length) best = candidate;
  }
  return best;
}
