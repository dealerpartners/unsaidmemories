/**
 * Streaming PNG encoder for very large rasters.
 *
 * A 22"×60" gang sheet at 300 DPI is 6600×18000 px — taller than any
 * browser canvas allows (Chrome caps a side at 16384 px), so the sheet
 * cannot be drawn to one canvas and toBlob()'d. This encoder renders
 * the picture in horizontal bands and streams the scanlines through a
 * DEFLATE compressor, assembling a valid PNG (IHDR / IDAT / IEND)
 * without ever holding the full raster.
 *
 * The caller supplies `renderBand(bandY, bandHeightPx)` returning the
 * band's pixels (e.g. drawn on a small offscreen canvas). Bands are
 * requested top to bottom, each at most `bandRows` tall.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

export interface PngBand {
  /** RGBA pixels, exactly widthPx * rows * 4 bytes. */
  data: Uint8ClampedArray;
  rows: number;
}

/**
 * Build a PNG Blob of widthPx × heightPx from band renders.
 * `renderBand` is called with increasing Y offsets until the height
 * is covered; it may return fewer rows than requested at the end.
 */
export async function buildPngBlob(
  widthPx: number,
  heightPx: number,
  renderBand: (bandY: number, bandHeightPx: number) => Promise<PngBand>,
  bandRows = 1024,
): Promise<Blob> {
  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  const compressed: Uint8Array[] = [];
  const drain = (async () => {
    const reader = compressor.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) compressed.push(value);
    }
  })();

  let y = 0;
  while (y < heightPx) {
    const want = Math.min(bandRows, heightPx - y);
    const band = await renderBand(y, want);
    const rows = Math.min(band.rows, want);
    if (rows <= 0) break;
    // Prefix every scanline with filter byte 0 (None).
    const stride = widthPx * 4;
    const raw = new Uint8Array(rows * (stride + 1));
    for (let r = 0; r < rows; r++) {
      raw[r * (stride + 1)] = 0;
      raw.set(band.data.subarray(r * stride, (r + 1) * stride), r * (stride + 1) + 1);
    }
    await writer.write(raw);
    y += rows;
  }
  await writer.close();
  await drain;

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, widthPx);
  hv.setUint32(4, heightPx);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const parts: BlobPart[] = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) as BlobPart,
    chunk("IHDR", ihdr) as BlobPart,
    ...compressed.map((c) => chunk("IDAT", c) as BlobPart),
    chunk("IEND", new Uint8Array(0)) as BlobPart,
  ];
  return new Blob(parts, { type: "image/png" });
}
