import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const reportsRoot = path.join(repoRoot, "reports");

const thresholdsMeters = [10, 50, 100];
const osgeoBin = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const gdallocationinfoBin = path.join(osgeoBin, "gdallocationinfo.exe");
const demPath = path.join(processedRoot, "terrain", "elevation-clipped.tif");
const hexAnalyticsPath = path.join(processedRoot, "hex-cells-analytics.geojson");

function percent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function round2(value) {
  return Number(value.toFixed(2));
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, quantileValue) {
  if (values.length === 0) {
    return 0;
  }

  const index = (values.length - 1) * quantileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return values[lower];
  }

  const weight = index - lower;
  return values[lower] * (1 - weight) + values[upper] * weight;
}

function buildAdjacencyMap(features) {
  const map = new Map();

  for (const feature of features) {
    const properties = feature.properties ?? {};
    map.set(properties.id, properties.adjacencyIds ?? []);
  }

  return map;
}

function connectedComponents(keptIds, adjacencyMap) {
  const keptSet = new Set(keptIds);
  const visited = new Set();
  const components = [];

  for (const id of keptSet) {
    if (visited.has(id)) {
      continue;
    }

    const queue = [id];
    visited.add(id);
    const nodes = [];

    while (queue.length > 0) {
      const current = queue.shift();
      nodes.push(current);
      const neighbors = adjacencyMap.get(current) ?? [];

      for (const neighborId of neighbors) {
        if (!keptSet.has(neighborId) || visited.has(neighborId)) {
          continue;
        }

        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(nodes);
  }

  components.sort((left, right) => right.length - left.length);
  return components;
}

async function sampleElevations(features) {
  const inputLines = features
    .map((feature) => {
      const properties = feature.properties ?? {};
      const center = properties.centerLngLat ?? properties.centroid;

      if (!Array.isArray(center) || center.length < 2) {
        throw new Error(`Feature ${properties.id ?? "(unknown)"} has no centerLngLat/centroid.`);
      }

      return `${center[0]} ${center[1]}`;
    })
    .join("\n");

  const args = [
    "-valonly",
    "-E",
    "-field_sep",
    ",",
    "-ignore_extra_input",
    "-wgs84",
    demPath,
  ];

  const output = await new Promise((resolve, reject) => {
    const child = spawn(gdallocationinfoBin, args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`gdallocationinfo exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.write(`${inputLines}\n`);
    child.stdin.end();
  });

  const lines = output
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length !== features.length) {
    throw new Error(
      `Elevation sample count mismatch. Expected ${features.length}, got ${lines.length}.`,
    );
  }

  return lines.map((line, index) => {
    const valueText = line.split(",").pop()?.trim() ?? "";
    const value = Number.parseFloat(valueText);

    if (!Number.isFinite(value)) {
      const properties = features[index].properties ?? {};
      throw new Error(`Invalid elevation value for ${properties.id ?? "(unknown)"}: ${valueText}`);
    }

    return value;
  });
}

function scenarioMetrics({ threshold, features, elevations, adjacencyMap, baseline }) {
  const byId = new Map();

  for (const feature of features) {
    const properties = feature.properties ?? {};
    byId.set(properties.id, feature);
  }

  const keptIds = [];
  const removedIds = [];

  for (let index = 0; index < features.length; index += 1) {
    const elevationMeters = elevations[index];
    const id = features[index].properties.id;

    if (elevationMeters < threshold) {
      removedIds.push(id);
    } else {
      keptIds.push(id);
    }
  }

  const components = connectedComponents(keptIds, adjacencyMap);
  const largestComponent = components[0] ?? [];
  const largestComponentSet = new Set(largestComponent);
  const keptSet = new Set(keptIds);

  const removedCells = removedIds.map((id) => byId.get(id)).filter(Boolean);
  const keptCells = keptIds.map((id) => byId.get(id)).filter(Boolean);

  const removedAreaKm2 = removedCells.reduce((sum, feature) => sum + (feature.properties.areaKm2 ?? 0), 0);
  const keptAreaKm2 = keptCells.reduce((sum, feature) => sum + (feature.properties.areaKm2 ?? 0), 0);

  const removedSettlementCells = removedCells.filter(
    (feature) => (feature.properties.settlementScore ?? 0) > 0,
  ).length;
  const removedCityLikeCells = removedCells.filter(
    (feature) => (feature.properties.strongestPlaceScore ?? 0) >= 3,
  ).length;
  const removedSeaDominantCells = removedCells.filter(
    (feature) => (feature.properties.seaCoverage ?? 0) >= 0.5,
  ).length;

  const isolatedKeptCells = keptCells.filter((feature) => {
    const id = feature.properties.id;
    const neighbors = adjacencyMap.get(id) ?? [];
    return neighbors.every((neighborId) => !keptSet.has(neighborId));
  }).length;

  const keptMobilityMean = round2(mean(keptCells.map((feature) => feature.properties.mobilityScore ?? 0)));
  const keptDefensibilityMean = round2(
    mean(keptCells.map((feature) => feature.properties.defensibilityScore ?? 0)),
  );
  const keptEffectiveCapacityMean = round2(
    mean(keptCells.map((feature) => feature.properties.effectiveCapacity ?? 0)),
  );

  const nonLargestSettlementCells = keptCells.filter(
    (feature) =>
      (feature.properties.settlementScore ?? 0) > 0 &&
      !largestComponentSet.has(feature.properties.id),
  ).length;

  return {
    thresholdMeters: threshold,
    removedCellCount: removedIds.length,
    removedCellPct: percent(removedIds.length, baseline.totalCells),
    keptCellCount: keptIds.length,
    keptCellPct: percent(keptIds.length, baseline.totalCells),
    removedAreaKm2: round2(removedAreaKm2),
    removedAreaPct: percent(removedAreaKm2, baseline.totalAreaKm2),
    keptAreaKm2: round2(keptAreaKm2),
    removedSeaDominantCellCount: removedSeaDominantCells,
    removedSettlementCellCount: removedSettlementCells,
    removedCityLikeCellCount: removedCityLikeCells,
    connectedComponents: components.length,
    largestComponentCells: largestComponent.length,
    largestComponentPctOfKept: percent(largestComponent.length, keptIds.length),
    isolatedKeptCells,
    isolatedKeptPct: percent(isolatedKeptCells, keptIds.length),
    nonLargestSettlementCells,
    baselineMeans: baseline.means,
    keptMeans: {
      effectiveCapacity: keptEffectiveCapacityMean,
      mobilityScore: keptMobilityMean,
      defensibilityScore: keptDefensibilityMean,
    },
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Elevation Threshold Investigation");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`DEM: \`${report.demPath}\``);
  lines.push(`Sample strategy: centroid WGS84 point sampling via \`gdallocationinfo\``);
  lines.push("");
  lines.push("## Baseline");
  lines.push("");
  lines.push(`- Cells: ${report.baseline.totalCells}`);
  lines.push(`- Area: ${report.baseline.totalAreaKm2} km2`);
  lines.push(
    `- Elevation sample (m): min ${report.baseline.elevation.min}, p25 ${report.baseline.elevation.p25}, median ${report.baseline.elevation.p50}, p75 ${report.baseline.elevation.p75}, max ${report.baseline.elevation.max}`,
  );
  lines.push("");
  lines.push("## Threshold Scenarios");
  lines.push("");
  lines.push(
    "| Threshold | Removed cells | Removed area | Largest component of kept | Components | Removed settlement cells | Removed city/town cells |",
  );
  lines.push("|---:|---:|---:|---:|---:|---:|---:|");

  for (const scenario of report.scenarios) {
    lines.push(
      `| < ${scenario.thresholdMeters}m | ${scenario.removedCellCount} (${scenario.removedCellPct}%) | ${scenario.removedAreaKm2} km2 (${scenario.removedAreaPct}%) | ${scenario.largestComponentCells} (${scenario.largestComponentPctOfKept}% of kept) | ${scenario.connectedComponents} | ${scenario.removedSettlementCellCount} | ${scenario.removedCityLikeCellCount} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `city/town` cells are approximated as `strongestPlaceScore >= 3`.");
  lines.push("- Connectivity is computed from `adjacencyIds` after threshold filtering.");
  lines.push("- This analysis does not rewrite the dataset; it reports impact only.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const raw = await readFile(hexAnalyticsPath, "utf8");
  const hexCells = JSON.parse(raw);
  const features = hexCells.features ?? [];

  if (features.length === 0) {
    throw new Error("No features found in hex-cells-analytics.geojson.");
  }

  const elevations = await sampleElevations(features);
  const sortedElevations = [...elevations].sort((left, right) => left - right);
  const adjacencyMap = buildAdjacencyMap(features);

  const totalAreaKm2 = round2(
    features.reduce((sum, feature) => sum + (feature.properties.areaKm2 ?? 0), 0),
  );
  const baselineMeans = {
    effectiveCapacity: round2(mean(features.map((feature) => feature.properties.effectiveCapacity ?? 0))),
    mobilityScore: round2(mean(features.map((feature) => feature.properties.mobilityScore ?? 0))),
    defensibilityScore: round2(mean(features.map((feature) => feature.properties.defensibilityScore ?? 0))),
  };

  const baseline = {
    totalCells: features.length,
    totalAreaKm2,
    means: baselineMeans,
    elevation: {
      min: round2(sortedElevations[0]),
      p25: round2(quantile(sortedElevations, 0.25)),
      p50: round2(quantile(sortedElevations, 0.5)),
      p75: round2(quantile(sortedElevations, 0.75)),
      max: round2(sortedElevations[sortedElevations.length - 1]),
    },
  };

  const scenarios = thresholdsMeters.map((threshold) =>
    scenarioMetrics({
      threshold,
      features,
      elevations,
      adjacencyMap,
      baseline,
    }),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    demPath,
    source: "data/processed/hex-cells-analytics.geojson",
    sampleMethod: "centroid-point-sampling-wgs84-gdallocationinfo",
    baseline,
    scenarios,
  };

  await mkdir(reportsRoot, { recursive: true });
  const jsonPath = path.join(reportsRoot, "elevation-threshold-investigation.json");
  const markdownPath = path.join(reportsRoot, "elevation-threshold-investigation.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(markdownPath, buildMarkdownReport(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
