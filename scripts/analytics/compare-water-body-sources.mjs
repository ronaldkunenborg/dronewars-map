import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const reportsRoot = path.join(repoRoot, "reports");

const nearSeaThresholdsMeters = [2, 5, 10];
const osgeoBin = process.env.OSGEO4W_BIN ?? "C:\\OSGeo4W\\bin";
const gdallocationinfoBin = path.join(osgeoBin, "gdallocationinfo.exe");

const layerPaths = {
  naturalEarthWaterBodies: path.join(processedRoot, "layers", "water-bodies.geojson"),
  osmWaterBodiesPrototype: path.join(processedRoot, "layers", "water-bodies-osm-prototype.geojson"),
  seas: path.join(processedRoot, "layers", "seas.geojson"),
  hexCellsAnalytics: path.join(processedRoot, "hex-cells-analytics.geojson"),
  elevation: path.join(processedRoot, "terrain", "elevation-clipped.tif"),
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

  for (let i = 1; i < polygonCoordinates.length; i += 1) {
    if (pointInRing(point, polygonCoordinates[i])) {
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

function polygonAreaKm2(polygonCoordinates) {
  const outer = polygonCoordinates?.[0];

  if (!Array.isArray(outer) || outer.length < 4) {
    return 0;
  }

  const meanLat = outer.reduce((sum, [, lat]) => sum + lat, 0) / outer.length;
  const kx = 111.32 * Math.cos((meanLat * Math.PI) / 180);
  const ky = 110.574;

  const ringArea = (ring) => {
    let area = 0;

    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      area += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky);
    }

    return Math.abs(area / 2);
  };

  let total = ringArea(outer);

  for (let holeIndex = 1; holeIndex < polygonCoordinates.length; holeIndex += 1) {
    total -= ringArea(polygonCoordinates[holeIndex]);
  }

  return Math.max(0, total);
}

function featureAreaKm2(feature) {
  const geometry = feature?.geometry;

  if (!geometry) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return polygonAreaKm2(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0);
  }

  return 0;
}

function ringCentroid(ring) {
  let areaTerm = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    areaTerm += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  if (Math.abs(areaTerm) < 1e-12) {
    return ring[0] ?? [0, 0];
  }

  const factor = 1 / (3 * areaTerm);
  return [centroidX * factor, centroidY * factor];
}

function representativePoint(feature) {
  const geometry = feature?.geometry;

  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    const centroid = ringCentroid(geometry.coordinates?.[0] ?? []);
    return pointInFeature(centroid, feature) ? centroid : geometry.coordinates?.[0]?.[0] ?? null;
  }

  if (geometry.type === "MultiPolygon") {
    const bestPolygon = geometry.coordinates
      .map((polygon) => ({ polygon, area: polygonAreaKm2(polygon) }))
      .sort((left, right) => right.area - left.area)[0]?.polygon;

    if (!bestPolygon) {
      return null;
    }

    const candidateFeature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: bestPolygon },
    };
    const centroid = ringCentroid(bestPolygon[0] ?? []);
    return pointInFeature(centroid, candidateFeature) ? centroid : bestPolygon[0]?.[0] ?? null;
  }

  return null;
}

function polygonFeatures(featureCollection) {
  return (featureCollection?.features ?? []).filter((feature) => {
    const type = feature?.geometry?.type;
    return type === "Polygon" || type === "MultiPolygon";
  });
}

function loadGeoJson(filePath) {
  return readFile(filePath, "utf8").then((raw) => JSON.parse(raw));
}

async function sampleHexElevations(hexFeatures) {
  const input = hexFeatures
    .map((feature) => {
      const properties = feature.properties ?? {};
      const center = properties.centerLngLat ?? properties.centroid;

      if (!Array.isArray(center) || center.length < 2) {
        throw new Error(`Hex ${properties.id ?? "(unknown)"} has no centerLngLat/centroid.`);
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
    layerPaths.elevation,
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

    child.stdin.write(`${input}\n`);
    child.stdin.end();
  });

  const lines = output.trim().split(/\r?\n/).filter(Boolean);

  if (lines.length !== hexFeatures.length) {
    throw new Error(`Elevation sample mismatch: expected ${hexFeatures.length}, got ${lines.length}.`);
  }

  return lines.map((line, index) => {
    const valueText = line.split(",").pop()?.trim() ?? "";
    const value = Number.parseFloat(valueText);

    if (!Number.isFinite(value)) {
      const id = hexFeatures[index]?.properties?.id ?? "(unknown)";
      throw new Error(`Invalid elevation for ${id}: ${valueText}`);
    }

    return value;
  });
}

function buildSeaConnectedNearLevelCorridors(hexFeatures, elevations, thresholds) {
  const byId = new Map();
  const adjacency = new Map();
  const seaSeedIds = [];

  for (let i = 0; i < hexFeatures.length; i += 1) {
    const feature = hexFeatures[i];
    const properties = feature.properties ?? {};
    const id = properties.id;

    if (!id) {
      continue;
    }

    byId.set(id, feature);
    adjacency.set(id, Array.isArray(properties.adjacencyIds) ? properties.adjacencyIds : []);

    if ((properties.seaCoverage ?? 0) >= 0.5) {
      seaSeedIds.push(id);
    }
  }

  const elevationById = new Map();
  for (let i = 0; i < hexFeatures.length; i += 1) {
    const id = hexFeatures[i]?.properties?.id;
    if (id) {
      elevationById.set(id, elevations[i]);
    }
  }

  const corridors = {};

  for (const threshold of thresholds) {
    const visited = new Set();
    const queue = [];

    for (const seedId of seaSeedIds) {
      visited.add(seedId);
      queue.push(seedId);
    }

    while (queue.length > 0) {
      const currentId = queue.shift();
      const neighbors = adjacency.get(currentId) ?? [];

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }

        const neighborElevation = elevationById.get(neighborId);
        if (!Number.isFinite(neighborElevation) || neighborElevation > threshold) {
          continue;
        }

        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    corridors[threshold] = {
      ids: visited,
      features: [...visited].map((id) => byId.get(id)).filter(Boolean),
    };
  }

  return {
    seaSeedCount: seaSeedIds.length,
    corridors,
  };
}

function buildFeatureSet(features) {
  return features.map((feature) => ({
    feature,
    extent: geometryExtent(feature.geometry),
  }));
}

function pointInFeatureSet(point, featureSet) {
  for (const entry of featureSet) {
    if (!entry.extent || !pointInExtent(point, entry.extent)) {
      continue;
    }

    if (pointInFeature(point, entry.feature)) {
      return true;
    }
  }

  return false;
}

function layerMetrics(layerName, features, seaSet, corridorSets, peerSet) {
  const metrics = {
    layer: layerName,
    featureCount: features.length,
    totalAreaKm2: 0,
    inlandFeatureCount: 0,
    inlandAreaKm2: 0,
    representativePointsInPeerCount: 0,
    representativePointsInPeerPct: 0,
    inlandNearSeaCorridor: {},
  };

  const inlandRepresentatives = [];

  for (const feature of features) {
    const point = representativePoint(feature);
    const areaKm2 = featureAreaKm2(feature);
    metrics.totalAreaKm2 += areaKm2;

    if (!point) {
      continue;
    }

    if (pointInFeatureSet(point, peerSet)) {
      metrics.representativePointsInPeerCount += 1;
    }

    if (!pointInFeatureSet(point, seaSet)) {
      metrics.inlandFeatureCount += 1;
      metrics.inlandAreaKm2 += areaKm2;
      inlandRepresentatives.push(point);
    }
  }

  metrics.representativePointsInPeerPct = pct(metrics.representativePointsInPeerCount, features.length);
  metrics.totalAreaKm2 = round2(metrics.totalAreaKm2);
  metrics.inlandAreaKm2 = round2(metrics.inlandAreaKm2);

  for (const threshold of nearSeaThresholdsMeters) {
    const corridorSet = corridorSets[threshold];
    let insideCount = 0;

    for (const point of inlandRepresentatives) {
      if (pointInFeatureSet(point, corridorSet)) {
        insideCount += 1;
      }
    }

    metrics.inlandNearSeaCorridor[threshold] = {
      count: insideCount,
      pct: pct(insideCount, inlandRepresentatives.length),
    };
  }

  return metrics;
}

function buildMarkdown(report) {
  const ne = report.layers.naturalEarth;
  const osm = report.layers.osmPrototype;
  const lines = [];

  lines.push("# Water-Body Source Prototype Comparison");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Corridor thresholds (m): ${report.nearSeaThresholdsMeters.join(", ")}`);
  lines.push(`Sea-seed hexes: ${report.corridorModel.seaSeedHexCount}`);
  lines.push("");
  lines.push("## Source Summary");
  lines.push("");
  lines.push("| Layer | Features | Area (km2) | Inland features | Inland area (km2) |");
  lines.push("|---|---:|---:|---:|---:|");
  lines.push(`| Natural Earth lakes | ${ne.featureCount} | ${ne.totalAreaKm2} | ${ne.inlandFeatureCount} | ${ne.inlandAreaKm2} |`);
  lines.push(`| OSM water prototype | ${osm.featureCount} | ${osm.totalAreaKm2} | ${osm.inlandFeatureCount} | ${osm.inlandAreaKm2} |`);
  lines.push("");
  lines.push("## Cross-Layer Representative Overlap");
  lines.push("");
  lines.push(`- Natural Earth representatives found in OSM polygons: ${ne.representativePointsInPeerCount}/${ne.featureCount} (${ne.representativePointsInPeerPct}%).`);
  lines.push(`- OSM representatives found in Natural Earth polygons: ${osm.representativePointsInPeerCount}/${osm.featureCount} (${osm.representativePointsInPeerPct}%).`);
  lines.push("");
  lines.push("## Inland Water vs Sea-Connected Near-Sea Corridors");
  lines.push("");
  lines.push("| Threshold | NE inland in corridor | OSM inland in corridor |");
  lines.push("|---:|---:|---:|");

  for (const threshold of report.nearSeaThresholdsMeters) {
    const neThreshold = ne.inlandNearSeaCorridor[threshold];
    const osmThreshold = osm.inlandNearSeaCorridor[threshold];
    lines.push(
      `| <= ${threshold}m | ${neThreshold.count}/${ne.inlandFeatureCount} (${neThreshold.pct}%) | ${osmThreshold.count}/${osm.inlandFeatureCount} (${osmThreshold.pct}%) |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- OSM prototype uses Overpass ways from tags: `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`.");
  lines.push("- Corridor model starts from sea-dominant hexes (`seaCoverage >= 0.5`) and floods through adjacent hexes with sampled DEM elevation below threshold.");
  lines.push("- This is a prototype comparison report; it does not replace the default rendered `water-bodies` layer.");
  lines.push("");

  return lines.join("\n");
}

async function ensureInputFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function main() {
  await ensureInputFile(layerPaths.naturalEarthWaterBodies, "Natural Earth water-bodies layer");
  await ensureInputFile(layerPaths.osmWaterBodiesPrototype, "OSM water-bodies prototype layer");
  await ensureInputFile(layerPaths.seas, "seas layer");
  await ensureInputFile(layerPaths.hexCellsAnalytics, "hex-cells-analytics layer");
  await ensureInputFile(layerPaths.elevation, "clipped elevation raster");
  await ensureInputFile(gdallocationinfoBin, "gdallocationinfo binary");

  const [neRaw, osmRaw, seasRaw, hexRaw] = await Promise.all([
    loadGeoJson(layerPaths.naturalEarthWaterBodies),
    loadGeoJson(layerPaths.osmWaterBodiesPrototype),
    loadGeoJson(layerPaths.seas),
    loadGeoJson(layerPaths.hexCellsAnalytics),
  ]);

  const neFeatures = polygonFeatures(neRaw);
  const osmFeatures = polygonFeatures(osmRaw);
  const seaFeatures = polygonFeatures(seasRaw);
  const hexFeatures = polygonFeatures(hexRaw);

  const elevations = await sampleHexElevations(hexFeatures);
  const corridorModel = buildSeaConnectedNearLevelCorridors(
    hexFeatures,
    elevations,
    nearSeaThresholdsMeters,
  );

  const seaSet = buildFeatureSet(seaFeatures);
  const neSet = buildFeatureSet(neFeatures);
  const osmSet = buildFeatureSet(osmFeatures);
  const corridorSets = {};

  for (const threshold of nearSeaThresholdsMeters) {
    corridorSets[threshold] = buildFeatureSet(corridorModel.corridors[threshold].features);
  }

  const naturalEarthMetrics = layerMetrics(
    "natural-earth-lakes",
    neFeatures,
    seaSet,
    corridorSets,
    osmSet,
  );
  const osmMetrics = layerMetrics(
    "osm-water-prototype",
    osmFeatures,
    seaSet,
    corridorSets,
    neSet,
  );

  const corridorSummary = {};
  for (const threshold of nearSeaThresholdsMeters) {
    const count = corridorModel.corridors[threshold].ids.size;
    corridorSummary[threshold] = {
      hexCount: count,
      pctOfAllHexes: pct(count, hexFeatures.length),
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    nearSeaThresholdsMeters,
    inputs: {
      naturalEarthWaterBodies: path.relative(repoRoot, layerPaths.naturalEarthWaterBodies),
      osmWaterBodiesPrototype: path.relative(repoRoot, layerPaths.osmWaterBodiesPrototype),
      seas: path.relative(repoRoot, layerPaths.seas),
      hexCellsAnalytics: path.relative(repoRoot, layerPaths.hexCellsAnalytics),
      elevationRaster: path.relative(repoRoot, layerPaths.elevation),
      gdallocationinfo: gdallocationinfoBin,
    },
    corridorModel: {
      seaSeedHexCount: corridorModel.seaSeedCount,
      corridorHexCoverage: corridorSummary,
    },
    layers: {
      naturalEarth: naturalEarthMetrics,
      osmPrototype: osmMetrics,
    },
  };

  await mkdir(reportsRoot, { recursive: true });
  const jsonPath = path.join(reportsRoot, "water-bodies-prototype-comparison.json");
  const markdownPath = path.join(reportsRoot, "water-bodies-prototype-comparison.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
