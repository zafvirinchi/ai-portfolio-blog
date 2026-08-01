import { PDFParse } from "pdf-parse";

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

/**
 * Extracts embedded raster images from a PDF via pdf-parse's built-in
 * getImage() (pdfjs-dist + @napi-rs/canvas under the hood — verified to
 * return ready-to-upload PNG-encoded bytes, not raw pixels). Flat list
 * tagged with page number; index.ts associates each image to the
 * question(s) on its page.
 */
export async function extractPdfImages(buffer: Buffer): Promise<ExtractedPdfImage[]> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getImage({
      imageThreshold: MIN_DIAGRAM_DIMENSION,
      imageBuffer: true,
      imageDataUrl: false,
    });

    const images: ExtractedPdfImage[] = [];

    for (const page of result.pages) {
      for (const image of page.images) {
        images.push({
          pageNumber: page.pageNumber,
          buffer: Buffer.from(image.data),
          width: image.width,
          height: image.height,
        });
      }
    }

    return images;
  } finally {
    await parser.destroy();
  }
}
