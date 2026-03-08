import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");

async function main() {
  const sourcePath = path.join(processedRoot, "hex-cells-analytics.geojson");
  const targetPath = path.join(processedRoot, "hex-cells.geojson");
  const manifestPath = path.join(processedRoot, "hex-cells.dataset.json");

  await copyFile(sourcePath, targetPath);
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "hex-cells-analytics.geojson",
        published: "hex-cells.geojson",
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Published ${targetPath}`);
  console.log(`Wrote dataset manifest ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

