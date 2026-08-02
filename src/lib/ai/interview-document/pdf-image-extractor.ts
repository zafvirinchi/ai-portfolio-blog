import { createHash } from "crypto";

export interface ExtractedPdfImage {
  pageNumber: number;
  buffer: Buffer;
  width: number;
  height: number;
}

// Below this, embedded images are almost always decorative (bullets,
// logos, icons) rather than a genuine diagram — filtered out at the
// source rather than guessed at later.
const MIN_DIAGRAM_DIMENSION = 150;

function hashImage(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Extracts embedded raster images from a PDF via pdf-parse's built-in
 * getImage() (pdfjs-dist + @napi-rs/canvas under the hood — verified to
 * return ready-to-upload PNG-encoded bytes, not raw pixels). Flat list
 * tagged with page number; index.ts associates each image to the
 * question(s) on its page.
 *
 * Excludes any image whose exact bytes repeat on more than one page — a
 * genuine diagram illustrates one specific answer and appears once; the
 * same image appearing across many pages is a watermark, logo, or other
 * page decoration, which would otherwise get wrongly picked as the
 * "largest image in range" for a run of unrelated questions.
 */
export async function extractPdfImages(buffer: Buffer): Promise<ExtractedPdfImage[]> {
  // Dynamically imported — see document-parser.ts's parsePdf() for why
  // pdf-parse must never be a top-level import in a module reachable from
  // the general chat pipeline.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getImage({
      imageThreshold: MIN_DIAGRAM_DIMENSION,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const images: (ExtractedPdfImage & { hash: string })[] = [];

    for (const page of result.pages) {
      for (const image of page.images) {
        const imageBuffer = Buffer.from(image.data);

        images.push({
          pageNumber: page.pageNumber,
          buffer: imageBuffer,
          width: image.width,
          height: image.height,
          hash: hashImage(imageBuffer),
        });
      }
    }

    const pagesPerHash = new Map<string, Set<number>>();

    for (const image of images) {
      const pages = pagesPerHash.get(image.hash) ?? new Set<number>();
      pages.add(image.pageNumber);
      pagesPerHash.set(image.hash, pages);
    }

    return images
      .filter((image) => (pagesPerHash.get(image.hash)?.size ?? 0) === 1)
      .map((image) => ({
        pageNumber: image.pageNumber,
        buffer: image.buffer,
        width: image.width,
        height: image.height,
      }));
  } finally {
    await parser.destroy();
  }
}
