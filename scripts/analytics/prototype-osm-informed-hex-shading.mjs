import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const reportsRoot = path.join(repoRoot, "reports");

const inputPaths = {
  hexAnalytics: path.join(processedRoot, "hex-cells-analytics.geojson"),
  osmWater: path.join(processedRoot, "layers", "water-bodies-osm-prototype.geojson"),
};

const outputPaths = {
  hexPrototype: path.join(processedRoot, "hex-cells-osm-shading-prototype.geojson"),
  reportJson: path.join(reportsRoot, "osm-informed-hex-shading-comparison.json"),
  reportMd: path.join(reportsRoot, "osm-informed-hex-shading-comparison.md"),
};

function round2(value) {
  return Number(value.toFixed(2));
}

function pct(count, total) {
  if (!total) {
    return 0;
  }
  return round2((count / total) * 100);
}

function pointInRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return false;
  }

  if (!pointInRing(point, polygonCoordinates[0])) {
    return false;
  }

  for (let holeIndex = 1; holeIndex < polygonCoordinates.length; holeIndex += 1) {
    if (pointInRing(point, polygonCoordinates[holeIndex])) {
      return false;
    }
  }

  return true;
}

function pointInFeature(point, feature) {
  const geometry = feature?.geometry;

  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function geometryExtent(geometry) {
  const bounds = {
    west: Number.POSITIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };

  const stack = [geometry?.coordinates];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!Array.isArray(node)) {
      continue;
    }

    if (node.length > 0 && typeof node[0] === "number") {
      const [lng, lat] = node;
      bounds.west = Math.min(bounds.west, lng);
      bounds.east = Math.max(bounds.east, lng);
      bounds.south = Math.min(bounds.south, lat);
      bounds.north = Math.max(bounds.north, lat);
      continue;
    }

    for (const child of node) {
      stack.push(child);
    }
  }

  if (!Number.isFinite(bounds.west)) {
    return null;
  }

  return bounds;
}

function pointInExtent(point, extent) {
  return (
    point[0] >= extent.west &&
    point[0] <= extent.east &&
    point[1] >= extent.south &&
    point[1] <= extent.north
  );
}

function buildIndexedFeatureSet(featureCollection) {
  return (featureCollection.features ?? [])
    .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
    .map((feature) => ({
      feature,
      extent: geometryExtent(feature.geometry),
    }))
    .filter((entry) => entry.extent);
}

function pointInFeatureSet(point, featureSet) {
  for (const entry of featureSet) {
    if (!pointInExtent(point, entry.extent)) {
      continue;
    }
    if (pointInFeature(point, entry.feature)) {
      return true;
    }
  }
  return false;
}

function currentDisplayClass(properties) {
  if ((properties.dominantTerrain ?? "open") === "sea") {
    return "sea";
  }
  if ((properties.strongestPlaceScore ?? 0) >= 4) {
    return "urban";
  }
  if ((properties.dominantTerrain ?? "open") === "wetland") {
    return "wetland";
  }
  if ((properties.dominantTerrain ?? "open") === "forest") {
    return "forest";
  }
  return "open";
}

function prototypeDisplayClass(properties, centroidInOsmWater) {
  if ((properties.seaCoverage ?? 0) >= 0.5) {
    return "sea";
  }
  if (centroidInOsmWater) {
    return "inland-water";
  }
  if ((properties.strongestPlaceScore ?? 0) >= 4) {
    return "urban";
  }
  if ((properties.wetlandCoverage ?? 0) >= 0.28) {
    return "wetland";
  }
  if ((properties.forestCoverage ?? 0) >= 0.33) {
    return "forest";
  }
  if ((properties.openTerrainCoverage ?? 0) >= 0.6) {
    return "open";
  }
  return "mixed";
}

function sortObjectEntriesDescending(record) {
  return Object.fromEntries(
    Object.entries(record).sort((left, right) => right[1] - left[1]),
  );
}

function markdownReport(report) {
  const lines = [];

  lines.push("# OSM-Informed Hex Shading Prototype Comparison");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push(`- Hexes changed by prototype class: ${report.changedHexes} / ${report.totalHexes} (${report.changedPct}%).`);
  lines.push(`- New inland-water class count: ${report.prototypeClassCounts["inland-water"] ?? 0}.`);
  lines.push("");
  lines.push("## Current vs Prototype Class Counts");
  lines.push("");
  lines.push("| Class | Current | Prototype | Delta |");
  lines.push("|---|---:|---:|---:|");

  for (const className of report.classOrder) {
    const current = report.currentClassCounts[className] ?? 0;
    const next = report.prototypeClassCounts[className] ?? 0;
    lines.push(`| ${className} | ${current} | ${next} | ${next - current} |`);
  }

  lines.push("");
  lines.push("## Top Changed Regions");
  lines.push("");
  lines.push("| Region | Changed hexes |");
  lines.push("|---|---:|");

  for (const [region, count] of Object.entries(report.changedByRegion).slice(0, 10)) {
    lines.push(`| ${region} | ${count} |`);
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Current class mirrors active map logic (`sea` then `urban` override, then `wetland/forest/open`).");
  lines.push("- Prototype adds explicit inland OSM-water signal (`inland-water`) using centroid-in-OSM-water polygons.");
  lines.push("- This is a prototype output/report and does not auto-switch runtime styling.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const [hexRaw, osmWaterRaw] = await Promise.all([
    readFile(inputPaths.hexAnalytics, "utf8"),
    readFile(inputPaths.osmWater, "utf8"),
  ]);

  const hex = JSON.parse(hexRaw);
  const osmWater = JSON.parse(osmWaterRaw);
  const waterSet = buildIndexedFeatureSet(osmWater);

  const currentCounts = {};
  const prototypeCounts = {};
  const changedByRegion = {};
  const changedSamples = [];
  const outputFeatures = [];
  let changedHexes = 0;

  for (const feature of hex.features ?? []) {
    const properties = feature.properties ?? {};
    const center = properties.centerLngLat ?? properties.centroid ?? null;

    if (!Array.isArray(center) || center.length < 2) {
      continue;
    }

    const inOsmWater = pointInFeatureSet(center, waterSet);
    const currentClass = currentDisplayClass(properties);
    const prototypeClass = prototypeDisplayClass(properties, inOsmWater);
    const changed = currentClass !== prototypeClass;

    currentCounts[currentClass] = (currentCounts[currentClass] ?? 0) + 1;
    prototypeCounts[prototypeClass] = (prototypeCounts[prototypeClass] ?? 0) + 1;

    if (changed) {
      changedHexes += 1;
      const region = properties.parentRegionName ?? "Unknown";
      changedByRegion[region] = (changedByRegion[region] ?? 0) + 1;
      if (changedSamples.length < 40) {
        changedSamples.push({
          id: properties.id ?? null,
          region,
          currentClass,
          prototypeClass,
          seaCoverage: properties.seaCoverage ?? null,
          strongestPlaceScore: properties.strongestPlaceScore ?? null,
        });
      }
    }

    outputFeatures.push({
      ...feature,
      properties: {
        ...properties,
        currentDisplayClass: currentClass,
        prototypeDisplayClass: prototypeClass,
        prototypeChanged: changed,
        prototypeCentroidInOsmWater: inOsmWater,
      },
    });
  }

  const classOrder = ["sea", "inland-water", "urban", "wetland", "forest", "open", "mixed"];
  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      hexAnalytics: path.relative(repoRoot, inputPaths.hexAnalytics),
      osmWater: path.relative(repoRoot, inputPaths.osmWater),
    },
    outputs: {
      prototypeHexLayer: path.relative(repoRoot, outputPaths.hexPrototype),
    },
    totalHexes: outputFeatures.length,
    changedHexes,
    changedPct: pct(changedHexes, outputFeatures.length),
    classOrder,
    currentClassCounts: currentCounts,
    prototypeClassCounts: prototypeCounts,
    changedByRegion: sortObjectEntriesDescending(changedByRegion),
    sampleChangedHexes: changedSamples,
  };

  await mkdir(path.dirname(outputPaths.hexPrototype), { recursive: true });
  await mkdir(reportsRoot, { recursive: true });

  await writeFile(
    outputPaths.hexPrototype,
    JSON.stringify({ type: "FeatureCollection", features: outputFeatures }, null, 2),
    "utf8",
  );
  await writeFile(outputPaths.reportJson, JSON.stringify(report, null, 2), "utf8");
  await writeFile(outputPaths.reportMd, markdownReport(report), "utf8");

  console.log(`Wrote ${outputPaths.hexPrototype}`);
  console.log(`Wrote ${outputPaths.reportJson}`);
  console.log(`Wrote ${outputPaths.reportMd}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
