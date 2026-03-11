import { randomUUID } from "crypto";
import { existsSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { join } from "path";
import { serverLog } from "./serverLogger.js";

/**
 * Copy images from temporary paths to a stable directory.
 * Returns an array of persisted file paths.
 */
export function persistImages(sourcePaths: string[], imageDir: string): string[] {
  if (!existsSync(imageDir)) {
    mkdirSync(imageDir, { recursive: true });
  }
  const persisted: string[] = [];
  for (const src of sourcePaths) {
    try {
      if (!existsSync(src)) {
        serverLog(`Image file not found, skipping: ${src}`, "error");
        continue;
      }
      const ext = src.split(".").pop() || "png";
      const dest = join(imageDir, `${randomUUID()}.${ext}`);
      copyFileSync(src, dest);
      persisted.push(dest);
    } catch (error) {
      serverLog(`Failed to persist image ${src}: ${error}`, "error");
    }
  }
  return persisted;
}

/**
 * Remove the temporary image directory and all its contents.
 */
export function cleanupTempImages(imageDir: string): void {
  if (existsSync(imageDir)) {
    try {
      rmSync(imageDir, { recursive: true, force: true });
      serverLog("Cleaned up temp images", "info");
    } catch (error) {
      serverLog(`Failed to clean temp images: ${error}`, "error");
    }
  }
}
