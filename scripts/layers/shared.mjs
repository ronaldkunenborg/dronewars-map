import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { processedLayerRecipes } from "./layer-recipes.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..");
export const rawRoot = path.join(repoRoot, "data", "raw");
export const processedRoot = path.join(repoRoot, "data", "processed");

export async function ensureProcessedDirectories() {
  await mkdir(path.join(processedRoot, "layers"), { recursive: true });
  await mkdir(path.join(processedRoot, "terrain"), { recursive: true });
}

export function getRecipeCatalog() {
  return processedLayerRecipes.map((recipe) => ({
    id: recipe.id,
    label: recipe.label,
    category: recipe.category,
    geometryKind: recipe.geometryKind,
    path: recipe.outputPath,
  }));
}

export async function writeLayerCatalog() {
  const catalogPath = path.join(processedRoot, "layers.json");
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        layers: getRecipeCatalog(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function copyProcessedFile(sourceName, outputPath) {
  const sourcePath = path.join(processedRoot, sourceName);
  const destination = path.join(processedRoot, outputPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(sourcePath, destination);
}

export function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

