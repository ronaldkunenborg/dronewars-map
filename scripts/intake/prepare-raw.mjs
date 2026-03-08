import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rawDataDirectories, rawSourceManifest } from "./source-manifest.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const rawRoot = path.join(repoRoot, "data", "raw");
const manifestPath = path.join(rawRoot, "source-manifest.json");

async function main() {
  await mkdir(rawRoot, { recursive: true });

  for (const directory of rawDataDirectories) {
    await mkdir(path.join(rawRoot, directory), { recursive: true });
  }

  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sources: rawSourceManifest,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Prepared raw data directories under ${rawRoot}`);
  console.log(`Wrote source manifest to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

