import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { processedRoot } from "./shared.mjs";
import {
  buildSettlementVoronoiLayer,
  settlementVoronoiCatalogEntry,
} from "./settlement-voronoi.mjs";

async function updateLayerCatalog() {
  const catalogPath = path.join(processedRoot, "layers.json");
  const existingCatalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const existingLayers = Array.isArray(existingCatalog.layers) ? existingCatalog.layers : [];
  const nextLayers = [
    ...existingLayers.filter((layer) => layer?.id !== settlementVoronoiCatalogEntry.id),
    settlementVoronoiCatalogEntry,
  ].sort((left, right) => String(left.id).localeCompare(String(right.id)));

  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        ...existingCatalog,
        generatedAt: new Date().toISOString(),
        layers: nextLayers,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const oblastBoundaries = JSON.parse(
    await readFile(path.join(processedRoot, "layers", "oblast-boundaries.geojson"), "utf8"),
  );
  const settlements = JSON.parse(
    await readFile(path.join(processedRoot, "layers", "settlements.geojson"), "utf8"),
  );
  const voronoi = buildSettlementVoronoiLayer(oblastBoundaries, settlements);

  await writeFile(
    path.join(processedRoot, "layers", "settlement-voronoi-cells.geojson"),
    JSON.stringify(voronoi, null, 2),
    "utf8",
  );
  await updateLayerCatalog();
  console.log("Built settlement Voronoi cells and updated layers.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
