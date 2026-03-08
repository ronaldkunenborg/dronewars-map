import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  rasterLayerDefinitions,
  vectorLayerDefinitions,
} from "./layer-definitions.mjs";
import { processedRoot, rawRoot, repoRoot } from "./shared.mjs";

const planPath = path.join(processedRoot, "preprocess-plan.json");

async function main() {
  const plan = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    rawRoot,
    processedRoot,
    vectorLayers: vectorLayerDefinitions,
    rasterLayers: rasterLayerDefinitions,
  };

  await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
  console.log(`Wrote preprocess plan to ${planPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

