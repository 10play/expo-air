import { randomUUID } from "crypto";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Parse a multipart/form-data body and save uploaded files to the image directory.
 * Returns an array of saved file paths.
 */
export function parseMultipartAndSave(body: Buffer, boundary: string, imageDir: string): string[] {
  if (!existsSync(imageDir)) {
    mkdirSync(imageDir, { recursive: true });
  }

  const paths: string[] = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, boundaryBuffer);

  for (const part of parts) {
    // Skip empty parts and the closing boundary
    const partStr = part.toString("utf-8", 0, Math.min(part.length, 500));
    if (partStr.trim() === "" || partStr.trim() === "--") continue;

    // Find the double CRLF that separates headers from body
    const headerEnd = findDoubleCRLF(part);
    if (headerEnd === -1) continue;

    const headers = part.toString("utf-8", 0, headerEnd);
    const fileData = part.subarray(headerEnd + 4); // Skip \r\n\r\n

    // Extract filename from Content-Disposition
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) continue;

    // Determine extension from content-type or filename
    const ctMatch = headers.match(/Content-Type:\s*image\/(\w+)/i);
    const ext = ctMatch ? ctMatch[1].replace("jpeg", "jpg") : "png";
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(imageDir, filename);

    // Strip trailing \r\n if present
    let endOffset = fileData.length;
    if (endOffset >= 2 && fileData[endOffset - 2] === 0x0d && fileData[endOffset - 1] === 0x0a) {
      endOffset -= 2;
    }

    writeFileSync(filePath, fileData.subarray(0, endOffset));
    paths.push(filePath);
  }

  return paths;
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;

  while (start < buffer.length) {
    const idx = buffer.indexOf(delimiter, start);
    if (idx === -1) {
      parts.push(buffer.subarray(start));
      break;
    }
    if (idx > start) {
      parts.push(buffer.subarray(start, idx));
    }
    start = idx + delimiter.length;
  }

  return parts;
}

function findDoubleCRLF(buffer: Buffer): number {
  for (let i = 0; i < buffer.length - 3; i++) {
    if (
      buffer[i] === 0x0d &&
      buffer[i + 1] === 0x0a &&
      buffer[i + 2] === 0x0d &&
      buffer[i + 3] === 0x0a
    ) {
      return i;
    }
  }
  return -1;
}
