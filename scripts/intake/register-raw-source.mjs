import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rawSourceManifest } from "./source-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const rawRoot = path.join(repoRoot, "data", "raw");

function printUsage() {
  console.log("Usage: npm run data:intake:register -- <source-id> <source-file>");
  console.log("Available source ids:");
  for (const entry of rawSourceManifest) {
    console.log(`- ${entry.id}`);
  }
}

async function main() {
  const [sourceId, inputFile] = process.argv.slice(2);

  if (!sourceId || !inputFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const manifestEntry = rawSourceManifest.find((entry) => entry.id === sourceId);

  if (!manifestEntry) {
    console.error(`Unknown source id: ${sourceId}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const extension = path.extname(inputFile).toLowerCase();

  if (!manifestEntry.acceptedExtensions.includes(extension)) {
    console.error(
      `Unsupported extension "${extension}" for ${sourceId}. Accepted: ${manifestEntry.acceptedExtensions.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const targetDirectory = path.join(rawRoot, manifestEntry.category);
  const targetPath = path.join(
    targetDirectory,
    `${manifestEntry.targetName}${extension}`,
  );

  await mkdir(targetDirectory, { recursive: true });
  await copyFile(path.resolve(inputFile), targetPath);

  console.log(`Registered ${sourceId} at ${targetPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

