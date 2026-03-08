import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rawSourceManifest } from "../intake/source-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..");
export const rawRoot = path.join(repoRoot, "data", "raw");
export const processedRoot = path.join(repoRoot, "data", "processed");

export async function resolveRawSourcePath(sourceId) {
  const manifestEntry = rawSourceManifest.find((entry) => entry.id === sourceId);

  if (!manifestEntry) {
    throw new Error(`Unknown raw source id: ${sourceId}`);
  }

  const categoryDir = path.join(rawRoot, manifestEntry.category);
  const files = await readdir(categoryDir, { withFileTypes: true }).catch(() => []);
  const match = files.find(
    (entry) =>
      entry.isFile() &&
      entry.name.startsWith(manifestEntry.targetName),
  );

  if (!match) {
    if (manifestEntry.optional) {
      return null;
    }

    throw new Error(
      `Missing raw source for ${sourceId}. Register it under ${categoryDir} first.`,
    );
  }

  return path.join(categoryDir, match.name);
}

export function theaterBoundaryPath() {
  return path.join(rawRoot, "boundary");
}

export function quote(value) {
  return `"${value}"`;
}

