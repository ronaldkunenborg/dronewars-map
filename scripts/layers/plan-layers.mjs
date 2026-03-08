import { writeFile } from "node:fs/promises";
import path from "node:path";
import { processedLayerRecipes } from "./layer-recipes.mjs";
import { processedRoot, repoRoot, rawRoot } from "./shared.mjs";

async function main() {
  const planPath = path.join(processedRoot, "layer-build-plan.json");
  await writeFile(
    planPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        repoRoot,
        rawRoot,
        processedRoot,
        recipes: processedLayerRecipes,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Wrote layer build plan to ${planPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

