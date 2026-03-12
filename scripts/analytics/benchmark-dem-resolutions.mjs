import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const inputDemCandidates = [
  path.join(repoRoot, "data", "raw", "terrain", "ukraine-elevation.tif"),
  path.join(repoRoot, "data", "processed", "terrain", "elevation-clipped.tif"),
];
const theaterBoundaryPath = path.join(repoRoot, "data", "processed", "layers", "theater-boundary.geojson");
const outputRoot = path.join(repoRoot, "reports", "dem-resolution-benchmark");
const subsetScale = 0.55;
const baseResolution = 30;
const candidateResolutions = [30, 60, 90];

const osgeoBinDir = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const osgeoRootDir = path.dirname(osgeoBinDir);

const gdalTools = {
  warp: "gdalwarp.exe",
  dem: "gdaldem.exe",
  translate: "gdal_translate.exe",
  info: "gdalinfo.exe",
};

function resolveCommand(command) {
  const candidates = [
    path.join(osgeoBinDir, command),
    path.join(osgeoRootDir, "apps", "Python312", "Scripts", command),
    path.join(osgeoRootDir, "apps", "gdal-dev", "Scripts", command),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  if (match) {
    return match;
  }
  throw new Error(`Unable to find ${command} under ${osgeoBinDir} or known OSGeo script paths.`);
}

function runCommand(command, args, { captureOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    const stdio = captureOutput ? ["ignore", "pipe", "pipe"] : "inherit";
    const child = spawn(command, args, { cwd: repoRoot, stdio });
    let stdout = "";
    let stderr = "";

    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.basename(command)} exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

function findInputDemPath() {
  const found = inputDemCandidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "No input elevation raster found. Expected either data/raw/terrain/ukraine-elevation.tif or data/processed/terrain/elevation-clipped.tif.",
    );
  }
  return found;
}

function updateBboxWithCoord(coord, bbox) {
  const [x, y] = coord;
  bbox.minX = Math.min(bbox.minX, x);
  bbox.minY = Math.min(bbox.minY, y);
  bbox.maxX = Math.max(bbox.maxX, x);
  bbox.maxY = Math.max(bbox.maxY, y);
}

function traverseCoords(node, onCoord) {
  if (!Array.isArray(node)) {
    return;
  }
  if (typeof node[0] === "number" && typeof node[1] === "number") {
    onCoord(node);
    return;
  }
  for (const child of node) {
    traverseCoords(child, onCoord);
  }
}

function buildGeometryBbox(geometry) {
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  traverseCoords(geometry.coordinates, (coord) => updateBboxWithCoord(coord, bbox));
  return bbox;
}

function scaleCoord(coord, centerX, centerY, scale) {
  const x = centerX + (coord[0] - centerX) * scale;
  const y = centerY + (coord[1] - centerY) * scale;
  return [x, y];
}

function mapCoords(node, mapper) {
  if (!Array.isArray(node)) {
    return node;
  }
  if (typeof node[0] === "number" && typeof node[1] === "number") {
    return mapper(node);
  }
  return node.map((child) => mapCoords(child, mapper));
}

function scaledGeometry(geometry, scale) {
  const bbox = buildGeometryBbox(geometry);
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;
  return {
    type: geometry.type,
    coordinates: mapCoords(geometry.coordinates, (coord) => scaleCoord(coord, centerX, centerY, scale)),
  };
}

async function loadSubsetCutlinePath() {
  if (!existsSync(theaterBoundaryPath)) {
    throw new Error(`Missing theater boundary at ${theaterBoundaryPath}. Run data layer generation first.`);
  }

  const raw = await readFile(theaterBoundaryPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.features) || parsed.features.length === 0) {
    throw new Error("Theater boundary GeoJSON does not contain features.");
  }
  const sourceFeature = parsed.features[0];
  if (!sourceFeature.geometry) {
    throw new Error("Theater boundary feature is missing geometry.");
  }

  const subsetFeature = {
    type: "Feature",
    properties: {
      id: "theater-benchmark-subset",
      source: "theater-boundary",
      scaleFactor: subsetScale,
    },
    geometry: scaledGeometry(sourceFeature.geometry, subsetScale),
  };
  const subsetCollection = {
    type: "FeatureCollection",
    features: [subsetFeature],
  };
  const subsetPath = path.join(outputRoot, "subset-cutline.geojson");
  await writeFile(subsetPath, JSON.stringify(subsetCollection, null, 2), "utf8");
  return subsetPath;
}

async function readRasterStats(rasterPath, infoCommand) {
  const { stdout } = await runCommand(infoCommand, ["-json", "-stats", rasterPath], { captureOutput: true });
  const parsed = JSON.parse(stdout);
  const band = parsed?.bands?.[0] ?? {};
  const metadataStats = band?.metadata?.[""] ?? {};

  const mean = Number(metadataStats.STATISTICS_MEAN ?? band.mean ?? 0);
  const stdDev = Number(metadataStats.STATISTICS_STDDEV ?? band.stdDev ?? 0);
  return {
    mean,
    stdDev,
  };
}

function asMiB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

async function benchmarkResolution(resolutionMeters, commands, cutlinePath, inputDemPath) {
  const demPath = path.join(outputRoot, `elevation-subset-${resolutionMeters}m.tif`);
  const hillshadeTifPath = path.join(outputRoot, `hillshade-subset-${resolutionMeters}m.tif`);
  const hillshadePngPath = path.join(outputRoot, `hillshade-subset-${resolutionMeters}m.png`);
  const startedAt = Date.now();

  const demStart = Date.now();
  await runCommand(commands.warp, [
    inputDemPath,
    demPath,
    "-overwrite",
    "-multi",
    "-r",
    "bilinear",
    "-t_srs",
    "EPSG:3857",
    "-cutline",
    cutlinePath,
    "-cutline_srs",
    "EPSG:4326",
    "-crop_to_cutline",
    "-dstnodata",
    "0",
    "-tr",
    String(resolutionMeters),
    String(resolutionMeters),
  ]);
  const demMs = Date.now() - demStart;

  const hillshadeStart = Date.now();
  await runCommand(commands.dem, [
    "hillshade",
    demPath,
    hillshadeTifPath,
    "-z",
    "1.0",
    "-s",
    "1",
    "-alt",
    "45",
    "-az",
    "315",
    "-compute_edges",
  ]);
  const hillshadeMs = Date.now() - hillshadeStart;

  const pngStart = Date.now();
  await runCommand(commands.translate, [
    "-of",
    "PNG",
    "-outsize",
    "2048",
    "0",
    hillshadeTifPath,
    hillshadePngPath,
  ]);
  const pngMs = Date.now() - pngStart;

  const demSize = (await stat(demPath)).size;
  const hillshadeTifSize = (await stat(hillshadeTifPath)).size;
  const hillshadePngSize = (await stat(hillshadePngPath)).size;
  const demStats = await readRasterStats(demPath, commands.info);
  const hillshadeStats = await readRasterStats(hillshadeTifPath, commands.info);
  const totalMs = Date.now() - startedAt;

  return {
    resolutionMeters,
    elapsedMs: {
      demWarp: demMs,
      hillshade: hillshadeMs,
      hillshadePng: pngMs,
      total: totalMs,
    },
    fileSizeBytes: {
      dem: demSize,
      hillshadeTif: hillshadeTifSize,
      hillshadePng: hillshadePngSize,
      combined: demSize + hillshadeTifSize + hillshadePngSize,
    },
    stats: {
      dem: demStats,
      hillshade: hillshadeStats,
    },
    outputs: {
      demPath: path.relative(repoRoot, demPath),
      hillshadeTifPath: path.relative(repoRoot, hillshadeTifPath),
      hillshadePngPath: path.relative(repoRoot, hillshadePngPath),
    },
  };
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(1);
}

function qualitySummary(entry, baseline) {
  if (entry.resolutionMeters === baseline.resolutionMeters) {
    return "baseline";
  }
  const hillshadeStdRatio = baseline.stats.hillshade.stdDev > 0
    ? entry.stats.hillshade.stdDev / baseline.stats.hillshade.stdDev
    : 0;
  const demStdRatio = baseline.stats.dem.stdDev > 0 ? entry.stats.dem.stdDev / baseline.stats.dem.stdDev : 0;
  if (hillshadeStdRatio >= 0.95 && demStdRatio >= 0.95) {
    return "high";
  }
  if (hillshadeStdRatio >= 0.9 && demStdRatio >= 0.9) {
    return "medium-high";
  }
  if (hillshadeStdRatio >= 0.8 && demStdRatio >= 0.8) {
    return "medium";
  }
  return "low-medium";
}

function buildMarkdownReport(inputDemPath, cutlinePath, results) {
  const baseline = results.find((entry) => entry.resolutionMeters === baseResolution) ?? results[0];
  const lines = [
    "# DEM Resolution Benchmark (Subset Geometry)",
    "",
    `Date: ${new Date().toISOString()}`,
    `Input DEM: \`${path.relative(repoRoot, inputDemPath)}\``,
    `Cutline subset: \`${path.relative(repoRoot, cutlinePath)}\``,
    `Subset scale factor: \`${subsetScale}\` (approx area ratio \`${(subsetScale * subsetScale).toFixed(4)}\`)`,
    "",
    "## Results",
    "",
    "| Resolution | Total runtime (s) | DEM size (MiB) | Hillshade TIFF (MiB) | Hillshade PNG (MiB) | Combined (MiB) | Detail proxy |",
    "|---|---:|---:|---:|---:|---:|---|",
  ];

  for (const entry of results) {
    lines.push(
      `| ${entry.resolutionMeters}m | ${formatSeconds(entry.elapsedMs.total)} | ${asMiB(entry.fileSizeBytes.dem)} | ${asMiB(entry.fileSizeBytes.hillshadeTif)} | ${asMiB(entry.fileSizeBytes.hillshadePng)} | ${asMiB(entry.fileSizeBytes.combined)} | ${qualitySummary(entry, baseline)} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Runtime covers clipped DEM build + hillshade TIFF + hillshade PNG quicklook.");
  lines.push("- Detail proxy uses hillshade and DEM standard-deviation retention versus the 30m baseline.");
  lines.push("- Inspect generated `hillshade-subset-*.png` files for direct visual comparison.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });

  const commands = {
    warp: resolveCommand(gdalTools.warp),
    dem: resolveCommand(gdalTools.dem),
    translate: resolveCommand(gdalTools.translate),
    info: resolveCommand(gdalTools.info),
  };
  const inputDemPath = findInputDemPath();
  const cutlinePath = await loadSubsetCutlinePath();

  const results = [];
  for (const resolution of candidateResolutions) {
    const result = await benchmarkResolution(resolution, commands, cutlinePath, inputDemPath);
    results.push(result);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    inputDemPath: path.relative(repoRoot, inputDemPath),
    cutlinePath: path.relative(repoRoot, cutlinePath),
    subsetScale,
    candidateResolutions,
    results,
  };
  const jsonPath = path.join(outputRoot, "dem-resolution-benchmark.json");
  const mdPath = path.join(outputRoot, "dem-resolution-benchmark.md");

  await writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(mdPath, buildMarkdownReport(inputDemPath, cutlinePath, results), "utf8");

  console.log(`Wrote benchmark report: ${path.relative(repoRoot, jsonPath)}`);
  console.log(`Wrote benchmark report: ${path.relative(repoRoot, mdPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
