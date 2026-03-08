import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  rasterLayerDefinitions,
  vectorLayerDefinitions,
} from "./layer-definitions.mjs";
import {
  processedRoot,
  quote,
  rawRoot,
  resolveRawSourcePath,
} from "./shared.mjs";

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });

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

async function preprocessVectorLayer(definition, theaterBoundaryFile) {
  const sourcePath = await resolveRawSourcePath(definition.sourceId).catch((error) => {
    if (definition.optional) {
      console.warn(`Skipping optional layer ${definition.id}: ${error.message}`);
      return null;
    }

    throw error;
  });

  if (!sourcePath) {
    return;
  }

  const outputPath = path.join(processedRoot, definition.outputName);
  const args = [
    "-f",
    "GeoJSON",
    outputPath,
    sourcePath,
    "-t_srs",
    "EPSG:4326",
    "-makevalid",
    "-lco",
    "RFC7946=YES",
    "-skipfailures",
  ];

  if (definition.clipToTheater) {
    args.push("-clipsrc", theaterBoundaryFile);
  }

  await runCommand("ogr2ogr", args);
}

async function preprocessRasterLayer(definition, theaterBoundaryFile) {
  const sourcePath = await resolveRawSourcePath(definition.sourceId);
  const outputPath = path.join(processedRoot, definition.outputName);

  await runCommand("gdalwarp", [
    "-cutline",
    theaterBoundaryFile,
    "-crop_to_cutline",
    "-t_srs",
    "EPSG:4326",
    "-dstnodata",
    "0",
    sourcePath,
    outputPath,
  ]);
}

async function main() {
  await mkdir(processedRoot, { recursive: true });

  const theaterBoundaryFile = await resolveRawSourcePath("theater-boundary");

  console.log(`Using raw data root: ${quote(rawRoot)}`);
  console.log(`Using theater boundary: ${quote(theaterBoundaryFile)}`);
  console.log(`Writing processed outputs to: ${quote(processedRoot)}`);

  for (const definition of vectorLayerDefinitions) {
    await preprocessVectorLayer(definition, theaterBoundaryFile);
  }

  for (const definition of rasterLayerDefinitions) {
    await preprocessRasterLayer(definition, theaterBoundaryFile);
  }
}

main().catch((error) => {
  console.error(error.message);
  console.error("Preprocess requires GDAL tools (`ogr2ogr` and `gdalwarp`) on PATH.");
  process.exitCode = 1;
});

