import { canvasImageSrc } from "@/lib/image-proxy";

/**
 * Print-ready PDF — a single-page PDF at the design's exact physical
 * size (spec px ÷ DPI = inches), carrying the print artwork as an
 * embedded image with its alpha channel as an SMask, so a press or a
 * supplier portal sees the transparent artwork at true size.
 *
 * No PDF library: the file is assembled directly (Catalog → Pages →
 * Page → content stream → two DCTDecode image XObjects). The color
 * image and the alpha mask are JPEG-encoded from the print PNG via
 * canvas — JPEG at quality 0.95 is the transport; the PNG in storage
 * remains the lossless production file, and this PDF is the portable
 * print-ready deliverable alongside it.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvasImageSrc(src);
  });
}

async function jpegBytes(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  draw(ctx, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.95));
  if (!blob) throw new Error("JPEG encode failed");
  return new Uint8Array(await blob.arrayBuffer());
}

interface PdfPageParts {
  pageWpt: number;
  pageHpt: number;
  imgW: number;
  imgH: number;
  colorJpeg: Uint8Array;
  maskJpeg: Uint8Array;
}

/**
 * Assemble a PDF of N pages. Object layout: 1 = Catalog, 2 = Pages,
 * then per page i (0-based): Page = 3+3i, Contents = 4+3i, color
 * image = 5+3i, alpha SMask = 6+3i. For N = 1 the numbering is exactly
 * what the original single-page assembler produced, so existing
 * consumers see byte-compatible structure.
 */
function assemblePdf(pages: PdfPageParts[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (u: Uint8Array) => {
    chunks.push(u);
    length += u.length;
  };
  const pushText = (s: string) => push(enc.encode(s));
  const beginObj = (n: number) => {
    offsets[n] = length;
    pushText(`${n} 0 obj\n`);
  };

  const kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ");
  pushText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  beginObj(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj(2);
  pushText(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((parts, i) => {
    const pageObj = 3 + 3 * i;
    const contentObj = 4 + 3 * i;
    const imageObj = 5 + 3 * i;
    const maskObj = 6 + 3 * i;
    beginObj(pageObj);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${parts.pageWpt.toFixed(2)} ${parts.pageHpt.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`,
    );
    const content = `q ${parts.pageWpt.toFixed(2)} 0 0 ${parts.pageHpt.toFixed(2)} 0 0 cm /Im0 Do Q`;
    beginObj(contentObj);
    pushText(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    beginObj(imageObj);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${parts.imgW} /Height ${parts.imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /SMask ${maskObj} 0 R /Length ${parts.colorJpeg.length} >>\nstream\n`,
    );
    push(parts.colorJpeg);
    pushText("\nendstream\nendobj\n");
    beginObj(maskObj);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${parts.imgW} /Height ${parts.imgH} ` +
        `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${parts.maskJpeg.length} >>\nstream\n`,
    );
    push(parts.maskJpeg);
    pushText("\nendstream\nendobj\n");
  });

  const objectCount = 2 + 3 * pages.length;
  const xrefAt = length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= objectCount; n++) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  pushText(xref);
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toDataUrl(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return `data:application/pdf;base64,${btoa(bin)}`;
}

/** Encode one page's PNG into its PDF parts (color JPEG + alpha SMask). */
async function encodePage(
  printPngDataUrl: string,
  physicalWIn: number,
  physicalHIn: number,
): Promise<PdfPageParts> {
  const img = await loadImage(printPngDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const colorJpeg = await jpegBytes((ctx) => {
    // JPEG has no alpha — flatten onto white for the color plane;
    // the true transparency rides in the SMask below.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
  }, w, h);
  const maskJpeg = await jpegBytes((ctx) => {
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sctx = src.getContext("2d");
    if (!sctx) throw new Error("canvas unavailable");
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      px[i] = a;
      px[i + 1] = a;
      px[i + 2] = a;
      px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }, w, h);
  return {
    pageWpt: physicalWIn * 72,
    pageHpt: physicalHIn * 72,
    imgW: w,
    imgH: h,
    colorJpeg,
    maskJpeg,
  };
}

/**
 * Build the print PDF from a print PNG data URL (the Rule B render).
 * physicalWIn / physicalHIn = the trim size in inches (spec ÷ DPI).
 */
export async function buildPrintPdf(
  printPngDataUrl: string,
  physicalWIn: number,
  physicalHIn: number,
): Promise<string> {
  const page = await encodePage(printPngDataUrl, physicalWIn, physicalHIn);
  return toDataUrl(assemblePdf([page]));
}

export interface BookPdfPage {
  pngDataUrl: string;
  /** Trim width/height of this page in inches — becomes its MediaBox. */
  wIn: number;
  hIn: number;
}

/**
 * Build a print-ready multi-page PDF (the book editor's export): one
 * PDF page per book page, each at its own trim size, in page order.
 */
export async function buildMultiPagePdf(pages: BookPdfPage[]): Promise<string> {
  if (!pages.length) throw new Error("A book needs at least one page.");
  const parts: PdfPageParts[] = [];
  for (const p of pages) parts.push(await encodePage(p.pngDataUrl, p.wIn, p.hIn));
  return toDataUrl(assemblePdf(parts));
}
