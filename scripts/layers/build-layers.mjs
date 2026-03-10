import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { processedLayerRecipes } from "./layer-recipes.mjs";
import {
  copyProcessedFile,
  ensureProcessedDirectories,
  processedRoot,
  rawRoot,
  runCommand,
  writeLayerCatalog,
} from "./shared.mjs";
import { buildSettlementVoronoiLayer } from "./settlement-voronoi.mjs";

const osmExtractPath = path.join(rawRoot, "osm");

async function findOsmExtract() {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(osmExtractPath, { withFileTypes: true }).catch(() => []);
  const match = entries.find(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".pbf") || entry.name.endsWith(".osm") || entry.name.endsWith(".xml")),
  );

  if (!match) {
    throw new Error("Missing OSM extract in data/raw/osm.");
  }

  return path.join(osmExtractPath, match.name);
}

async function main() {
  await ensureProcessedDirectories();

  const osmSource = await findOsmExtract();

  for (const recipe of processedLayerRecipes) {
    if (recipe.sourceType === "preprocessed-vector" || recipe.sourceType === "preprocessed-raster") {
      await copyProcessedFile(recipe.sourcePath, recipe.outputPath);
      continue;
    }

    if (recipe.sourceType === "osm-sql") {
      const outputPath = path.join(processedRoot, recipe.outputPath);
      await runCommand("ogr2ogr", [
        "-f",
        "GeoJSON",
        outputPath,
        osmSource,
        recipe.geometryKind === "point"
          ? "points"
          : recipe.geometryKind === "line"
            ? "lines"
            : "multipolygons",
        "-sql",
        recipe.sql,
        "-t_srs",
        "EPSG:4326",
        "-skipfailures",
        "-makevalid",
        "-lco",
        "RFC7946=YES",
      ]);
    }
  }

  const oblastBoundaries = JSON.parse(
    await readFile(path.join(processedRoot, "layers", "oblast-boundaries.geojson"), "utf8"),
  );
  const settlements = JSON.parse(
    await readFile(path.join(processedRoot, "layers", "settlements.geojson"), "utf8"),
  );
  const settlementVoronoiCells = buildSettlementVoronoiLayer(oblastBoundaries, settlements);
  await writeFile(
    path.join(processedRoot, "layers", "settlement-voronoi-cells.geojson"),
    JSON.stringify(settlementVoronoiCells, null, 2),
    "utf8",
  );

  await writeLayerCatalog();
  console.log("Built processed layer outputs and wrote layers.json");
}

main().catch((error) => {
  console.error(error.message);
  console.error("Layer build requires GDAL/OGR on PATH and a registered OSM extract.");
  process.exitCode = 1;
});
