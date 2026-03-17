import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const reportsRoot = path.join(repoRoot, "reports");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources");

const inputPaths = {
  hexCells: path.join(processedRoot, "hex-cells.geojson"),
  waterBodies: path.join(processedRoot, "layers", "water-bodies.geojson"),
  theaterBoundary: path.join(processedRoot, "layers", "country-boundaries.geojson"),
  renderedRivers: path.join(processedRoot, "layers", "rivers.geojson"),
  riversFromCache: path.join(cacheRoot, "osm", "rivers-lines-from-pbf.geojson"),
  riversFallback: path.join(processedRoot, "layers", "rivers.geojson"),
};

const outputPaths = {
  reportJson: path.join(reportsRoot, "river-water-gap-checklist.json"),
  reportMd: path.join(reportsRoot, "river-water-gap-checklist.md"),
};

const manuallyExcludedHexIds = new Set([
  "HX-E54-N31",
  "HX-E55-N31",
  "HX-E55-N32",
  "HX-E46-N42",
  "HX-E64-N44",
  "HX-E65-N45",
  "HX-E69-N42",
  "HX-E71-N41",
  "HX-E71-N43",
  "HX-W17-N58",
  "HX-W16-N50",
  "HX-W10-N47",
  "HX-W6-N45",
  "HX-W4-N44",
  "HX-W4-N40",
  "HX-E7-N42",
  "HX-E13-N39",
  "HX-E16-N37",
  "HX-E53-N31",
  "HX-E51-N52",
  "HX-E52-N53",
  "HX-E53-N54",
  "HX-E54-N53",
  "HX-E11-N46",
  "HX-E16-N63",
  "HX-E16-N64",
]);

const defaultConfig = {
  includeOnlyTheaterHexes: true,
  requireRenderedRiverPresence: true,
  minRenderedRiverKm: 0.12,
  requireRiverName: true,
  featureMinLengthKm: 40,
  segmentMinLengthKm: 0.05,
  coveredDistanceKm: 0.03,
  waterSearchRadiusKm: 0.35,
  hexMinRiverKm: 1.0,
  flagMinUncoveredKm: 0.18,
  flagMinUncoveredPct: 1.5,
  maxChecklistRowsInMarkdown: 250,
  hexIndexCellDegrees: 0.35,
  waterIndexCellDegrees: 0.2,
};

function parseArgs(config) {
  const parsed = { ...config };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--include-all-hexes") {
      parsed.includeOnlyTheaterHexes = false;
      continue;
    }

    if (arg === "--include-nonrendered") {
      parsed.requireRenderedRiverPresence = false;
      continue;
    }

    if (arg === "--include-unnamed") {
      parsed.requireRiverName = false;
      continue;
    }

    if (arg.startsWith("--feature-min-length-km=")) {
      const value = Number.parseFloat(arg.split("=")[1]);
      if (Number.isFinite(value) && value >= 0) {
        parsed.featureMinLengthKm = value;
      }
      continue;
    }

    if (arg.startsWith("--covered-distance-km=")) {
      const value = Number.parseFloat(arg.split("=")[1]);
      if (Number.isFinite(value) && value > 0) {
        parsed.coveredDistanceKm = value;
      }
      continue;
    }

    if (arg.startsWith("--flag-min-uncovered-km=")) {
      const value = Number.parseFloat(arg.split("=")[1]);
      if (Number.isFinite(value) && value >= 0) {
        parsed.flagMinUncoveredKm = value;
      }
      continue;
    }

    if (arg.startsWith("--flag-min-uncovered-pct=")) {
      const value = Number.parseFloat(arg.split("=")[1]);
      if (Number.isFinite(value) && value >= 0) {
        parsed.flagMinUncoveredPct = value;
      }
      continue;
    }

    if (arg.startsWith("--min-rendered-river-km=")) {
      const value = Number.parseFloat(arg.split("=")[1]);
      if (Number.isFinite(value) && value >= 0) {
        parsed.minRenderedRiverKm = value;
      }
    }
  }

  return parsed;
}

function roundN(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pct(value, total) {
  if (!total) {
    return 0;
  }

  return roundN((value / total) * 100, 2);
}

async function ensureInputFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function loadGeoJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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

function pointInPolygonGeometry(point, geometry) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;

    if (!pointInRing(point, outerRing)) {
      return false;
    }

    return !holes.some((ring) => pointInRing(point, ring));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }));
  }

  return false;
}

function accumulateCoordinates(coordinates, bounds) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  for (const coordinate of coordinates) {
    if (Array.isArray(coordinate) && typeof coordinate[0] === "number") {
      bounds.west = Math.min(bounds.west, coordinate[0]);
      bounds.east = Math.max(bounds.east, coordinate[0]);
      bounds.south = Math.min(bounds.south, coordinate[1]);
      bounds.north = Math.max(bounds.north, coordinate[1]);
      continue;
    }

    accumulateCoordinates(coordinate, bounds);
  }
}

function geometryBounds(geometry) {
  if (geometry?.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return {
      west: longitude,
      east: longitude,
      south: latitude,
      north: latitude,
    };
  }

  const bounds = {
    west: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  };

  accumulateCoordinates(geometry?.coordinates, bounds);

  return bounds;
}

function bboxIntersects(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

function toKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);
  return [
    point[0] * kmPerDegreeLongitude,
    point[1] * kmPerDegreeLatitude,
  ];
}

function pointDistanceKm(a, b) {
  const referenceLatitude = (a[1] + b[1]) / 2;
  const [ax, ay] = toKilometers(a, referenceLatitude);
  const [bx, by] = toKilometers(b, referenceLatitude);
  return Math.hypot(bx - ax, by - ay);
}

function pointToSegmentDistanceKm(point, segmentStart, segmentEnd) {
  const referenceLatitude = (point[1] + segmentStart[1] + segmentEnd[1]) / 3;
  const [px, py] = toKilometers(point, referenceLatitude);
  const [ax, ay] = toKilometers(segmentStart, referenceLatitude);
  const [bx, by] = toKilometers(segmentEnd, referenceLatitude);
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abSquared = abx * abx + aby * aby;

  if (abSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abSquared));
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.hypot(px - closestX, py - closestY);
}

function minDistanceToRingKm(point, ring) {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < ring.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistanceKm(point, ring[index - 1], ring[index]),
    );
  }

  return minDistance;
}

function pointDistanceToGeometryKm(point, geometry) {
  if (pointInPolygonGeometry(point, geometry)) {
    return 0;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.reduce(
      (best, ring) => Math.min(best, minDistanceToRingKm(point, ring)),
      Number.POSITIVE_INFINITY,
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (best, polygon) =>
        Math.min(best, pointDistanceToGeometryKm(point, { type: "Polygon", coordinates: polygon })),
      Number.POSITIVE_INFINITY,
    );
  }

  return Number.POSITIVE_INFINITY;
}

function extractLineSegments(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    const segments = [];

    for (let index = 1; index < geometry.coordinates.length; index += 1) {
      segments.push([geometry.coordinates[index - 1], geometry.coordinates[index]]);
    }

    return segments;
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flatMap((line) =>
      extractLineSegments({ type: "LineString", coordinates: line }));
  }

  return [];
}

function segmentMidpoint(segmentStart, segmentEnd) {
  return [
    (segmentStart[0] + segmentEnd[0]) / 2,
    (segmentStart[1] + segmentEnd[1]) / 2,
  ];
}

function kilometersToLatitudeDegrees(km) {
  return km / 111.32;
}

function kilometersToLongitudeDegrees(km, latitude) {
  const kmPerDegreeLongitude = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const safeKmPerDegreeLongitude = Math.max(0.000001, Math.abs(kmPerDegreeLongitude));
  return km / safeKmPerDegreeLongitude;
}

function bboxAroundPointKm(point, radiusKm) {
  return {
    west: point[0] - kilometersToLongitudeDegrees(radiusKm, point[1]),
    east: point[0] + kilometersToLongitudeDegrees(radiusKm, point[1]),
    south: point[1] - kilometersToLatitudeDegrees(radiusKm),
    north: point[1] + kilometersToLatitudeDegrees(radiusKm),
  };
}

function normalizeRiverName(name) {
  if (typeof name !== "string") {
    return null;
  }

  const normalized = name.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildSpatialIndex(entries, cellSizeDegrees) {
  const buckets = new Map();

  for (const [entryIndex, entry] of entries.entries()) {
    const bounds = entry.bounds;

    if (
      !Number.isFinite(bounds.west) ||
      !Number.isFinite(bounds.east) ||
      !Number.isFinite(bounds.south) ||
      !Number.isFinite(bounds.north)
    ) {
      continue;
    }

    const westCell = Math.floor(bounds.west / cellSizeDegrees);
    const eastCell = Math.floor(bounds.east / cellSizeDegrees);
    const southCell = Math.floor(bounds.south / cellSizeDegrees);
    const northCell = Math.floor(bounds.north / cellSizeDegrees);

    for (let x = westCell; x <= eastCell; x += 1) {
      for (let y = southCell; y <= northCell; y += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key);

        if (bucket) {
          bucket.push(entryIndex);
        } else {
          buckets.set(key, [entryIndex]);
        }
      }
    }
  }

  return {
    entries,
    buckets,
    cellSizeDegrees,
  };
}

function querySpatialIndex(index, bounds) {
  const {
    entries,
    buckets,
    cellSizeDegrees,
  } = index;
  const westCell = Math.floor(bounds.west / cellSizeDegrees);
  const eastCell = Math.floor(bounds.east / cellSizeDegrees);
  const southCell = Math.floor(bounds.south / cellSizeDegrees);
  const northCell = Math.floor(bounds.north / cellSizeDegrees);
  const candidateIndexes = new Set();

  for (let x = westCell; x <= eastCell; x += 1) {
    for (let y = southCell; y <= northCell; y += 1) {
      const bucket = buckets.get(`${x}:${y}`);

      if (!bucket) {
        continue;
      }

      for (const candidateIndex of bucket) {
        candidateIndexes.add(candidateIndex);
      }
    }
  }

  return [...candidateIndexes].map((candidateIndex) => entries[candidateIndex]);
}

function findContainingHex(point, hexIndex) {
  const candidateHexes = querySpatialIndex(hexIndex, {
    west: point[0],
    east: point[0],
    south: point[1],
    north: point[1],
  });

  for (const entry of candidateHexes) {
    if (
      point[0] < entry.bounds.west ||
      point[0] > entry.bounds.east ||
      point[1] < entry.bounds.south ||
      point[1] > entry.bounds.north
    ) {
      continue;
    }

    if (pointInPolygonGeometry(point, entry.feature.geometry)) {
      return entry;
    }
  }

  return null;
}

function distanceToNearestWaterKm(point, waterIndex, searchRadiusKm) {
  const searchBounds = bboxAroundPointKm(point, searchRadiusKm);
  const nearbyWaterEntries = querySpatialIndex(waterIndex, searchBounds);
  let minDistance = Number.POSITIVE_INFINITY;

  for (const entry of nearbyWaterEntries) {
    if (!bboxIntersects(entry.bounds, searchBounds)) {
      continue;
    }

    minDistance = Math.min(
      minDistance,
      pointDistanceToGeometryKm(point, entry.feature.geometry),
    );

    if (minDistance === 0) {
      return 0;
    }
  }

  return minDistance;
}

function addHexStat(hexStatsById, hexEntry, segmentLengthKm, isCovered, riverName) {
  const hexId = hexEntry.hexId;
  const stats = hexStatsById.get(hexId) ?? {
    hexId,
    centerLngLat: hexEntry.centerLngLat,
    totalRiverKm: 0,
    uncoveredRiverKm: 0,
    segmentCount: 0,
    uncoveredSegmentCount: 0,
    riverNames: new Map(),
  };

  stats.totalRiverKm += segmentLengthKm;
  stats.segmentCount += 1;

  if (!isCovered) {
    stats.uncoveredRiverKm += segmentLengthKm;
    stats.uncoveredSegmentCount += 1;
  }

  if (riverName) {
    stats.riverNames.set(riverName, (stats.riverNames.get(riverName) ?? 0) + segmentLengthKm);
  }

  hexStatsById.set(hexId, stats);
}

function pointInFeatureCollection(point, featureCollection) {
  for (const feature of featureCollection?.features ?? []) {
    if (pointInPolygonGeometry(point, feature.geometry)) {
      return true;
    }
  }

  return false;
}

function selectUkraineBoundary(countryBoundaryCollection) {
  return {
    type: "FeatureCollection",
    features: (countryBoundaryCollection?.features ?? []).filter((feature) => {
      const properties = feature?.properties ?? {};
      const idCandidates = [
        properties.id,
        properties.ADM0_A3,
        properties.ADM0_ISO,
        properties.ISO_A3,
        properties.SU_A3,
        properties.GU_A3,
      ];
      return idCandidates.some((value) => String(value ?? "").toUpperCase() === "UKR");
    }),
  };
}

function sortObjectDescending(record) {
  return Object.fromEntries(
    Object.entries(record).sort((left, right) => right[1] - left[1]),
  );
}

function riverNamesByContribution(riverNamesMap, maxNames = 6) {
  return [...riverNamesMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maxNames)
    .map(([name, lengthKm]) => ({
      name,
      km: roundN(lengthKm, 3),
    }));
}

function buildMarkdown(report) {
  const lines = [];

  lines.push("# River-Water Gap Checklist");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  lines.push(`- Hex layer: \`${report.inputs.hexCells}\``);
  lines.push(`- Water layer: \`${report.inputs.waterBodies}\``);
  lines.push(`- Theater boundary: \`${report.inputs.theaterBoundary}\``);
  lines.push(`- River layer: \`${report.inputs.rivers}\``);
  lines.push("");
  lines.push("## Scan Settings");
  lines.push("");
  lines.push(`- Require river name: \`${report.config.requireRiverName}\``);
  lines.push(`- Only theater hexes: \`${report.config.includeOnlyTheaterHexes}\``);
  lines.push(`- Require rendered rivers in hex: \`${report.config.requireRenderedRiverPresence}\``);
  lines.push(`- Rendered river minimum: \`${report.config.minRenderedRiverKm} km\``);
  lines.push(`- Feature minimum length: \`${report.config.featureMinLengthKm} km\``);
  lines.push(`- Segment minimum length: \`${report.config.segmentMinLengthKm} km\``);
  lines.push(`- Covered-distance threshold: \`${report.config.coveredDistanceKm} km\``);
  lines.push(`- Water search radius: \`${report.config.waterSearchRadiusKm} km\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Candidate river features scanned: ${report.summary.scannedRiverFeatureCount}`);
  lines.push(`- Candidate river segments scanned: ${report.summary.scannedRiverSegmentCount}`);
  lines.push(`- Hexes with at least ${report.config.hexMinRiverKm} km river: ${report.summary.hexesWithEnoughRiver}`);
  lines.push(`- Hexes passing rendered-river gate: ${report.summary.hexesWithRenderedRiver}`);
  lines.push(`- Manually excluded hexes removed: ${report.summary.manuallyExcludedHexMatchCount}`);
  lines.push(`- Theater filter applied: ${report.summary.theaterFilterApplied}`);
  lines.push(`- Flagged hexes to check: ${report.summary.flaggedHexCount}`);
  lines.push("");
  lines.push("## Hex Checklist");
  lines.push("");
  lines.push("| Hex | River km | Rendered river km | Uncovered km | Uncovered % | Main rivers | Center |");
  lines.push("|---|---:|---:|---:|---:|---|---|");

  for (const row of report.flaggedHexes.slice(0, report.config.maxChecklistRowsInMarkdown)) {
    const riverNames = row.riverNames.map((entry) => `${entry.name} (${entry.km})`).join(", ");
    const center = Array.isArray(row.centerLngLat)
      ? `${roundN(row.centerLngLat[0], 6)}, ${roundN(row.centerLngLat[1], 6)}`
      : "n/a";
    lines.push(
      `| ${row.hexId} | ${row.totalRiverKm} | ${row.renderedRiverKm} | ${row.uncoveredRiverKm} | ${row.uncoveredPct} | ${riverNames} | ${center} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `Uncovered` means the segment midpoint is farther than the covered-distance threshold from water polygons.");
  lines.push("- This report is a review checklist. It does not modify map layers.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const config = parseArgs(defaultConfig);
  const riversPath = existsSync(inputPaths.riversFromCache)
    ? inputPaths.riversFromCache
    : inputPaths.riversFallback;

  await ensureInputFile(inputPaths.hexCells, "hex-cells layer");
  await ensureInputFile(inputPaths.waterBodies, "water-bodies layer");
  await ensureInputFile(inputPaths.theaterBoundary, "theater-boundary layer");
  await ensureInputFile(inputPaths.renderedRivers, "rendered rivers layer");
  await ensureInputFile(riversPath, "rivers layer");

  const [hexRaw, waterRaw, countryBoundariesRaw, renderedRiversRaw, riversRaw] = await Promise.all([
    loadGeoJson(inputPaths.hexCells),
    loadGeoJson(inputPaths.waterBodies),
    loadGeoJson(inputPaths.theaterBoundary),
    loadGeoJson(inputPaths.renderedRivers),
    loadGeoJson(riversPath),
  ]);
  const ukraineBoundary = selectUkraineBoundary(countryBoundariesRaw);
  const theaterFilterApplied =
    config.includeOnlyTheaterHexes &&
    (ukraineBoundary.features ?? []).length > 0;

  const hexEntries = (hexRaw.features ?? [])
    .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
    .map((feature) => ({
      feature,
      bounds: geometryBounds(feature.geometry),
      hexId: feature.properties?.id ?? null,
      centerLngLat: feature.properties?.centerLngLat ?? feature.properties?.centroid ?? null,
      inTheater: Array.isArray(feature.properties?.centerLngLat ?? feature.properties?.centroid)
        ? pointInFeatureCollection(
            feature.properties?.centerLngLat ?? feature.properties?.centroid,
            ukraineBoundary,
          )
        : false,
    }))
    .filter(
      (entry) =>
        typeof entry.hexId === "string" &&
        (!theaterFilterApplied || entry.inTheater),
    );
  const waterEntries = (waterRaw.features ?? [])
    .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
    .map((feature) => ({
      feature,
      bounds: geometryBounds(feature.geometry),
    }));
  const hexIndex = buildSpatialIndex(hexEntries, config.hexIndexCellDegrees);
  const waterIndex = buildSpatialIndex(waterEntries, config.waterIndexCellDegrees);
  const renderedRiverKmByHexId = new Map();
  const hexStatsById = new Map();
  let scannedRiverFeatureCount = 0;
  let scannedRiverSegmentCount = 0;
  const skippedCounts = {
    nonRiver: 0,
    unnamed: 0,
    shortFeature: 0,
  };

  for (const feature of renderedRiversRaw.features ?? []) {
    const geometryType = feature?.geometry?.type;

    if (geometryType !== "LineString" && geometryType !== "MultiLineString") {
      continue;
    }

    for (const [segmentStart, segmentEnd] of extractLineSegments(feature.geometry)) {
      const segmentLengthKm = pointDistanceKm(segmentStart, segmentEnd);

      if (segmentLengthKm < config.segmentMinLengthKm) {
        continue;
      }

      const midpoint = segmentMidpoint(segmentStart, segmentEnd);
      const containingHex = findContainingHex(midpoint, hexIndex);

      if (!containingHex) {
        continue;
      }

      const current = renderedRiverKmByHexId.get(containingHex.hexId) ?? 0;
      renderedRiverKmByHexId.set(containingHex.hexId, current + segmentLengthKm);
    }
  }

  for (const feature of riversRaw.features ?? []) {
    const geometryType = feature?.geometry?.type;
    if (geometryType !== "LineString" && geometryType !== "MultiLineString") {
      continue;
    }

    const waterway = String(feature.properties?.waterway ?? "").toLowerCase();
    if (waterway && waterway !== "river") {
      skippedCounts.nonRiver += 1;
      continue;
    }

    const riverName = normalizeRiverName(feature.properties?.name ?? null);
    if (config.requireRiverName && !riverName) {
      skippedCounts.unnamed += 1;
      continue;
    }

    const segments = extractLineSegments(feature.geometry);
    const featureLengthKm = segments.reduce(
      (sum, [segmentStart, segmentEnd]) => sum + pointDistanceKm(segmentStart, segmentEnd),
      0,
    );

    if (featureLengthKm < config.featureMinLengthKm) {
      skippedCounts.shortFeature += 1;
      continue;
    }

    scannedRiverFeatureCount += 1;

    for (const [segmentStart, segmentEnd] of segments) {
      const segmentLengthKm = pointDistanceKm(segmentStart, segmentEnd);

      if (segmentLengthKm < config.segmentMinLengthKm) {
        continue;
      }

      const midpoint = segmentMidpoint(segmentStart, segmentEnd);
      const containingHex = findContainingHex(midpoint, hexIndex);

      if (!containingHex) {
        continue;
      }

      scannedRiverSegmentCount += 1;
      const nearestWaterDistanceKm = distanceToNearestWaterKm(
        midpoint,
        waterIndex,
        config.waterSearchRadiusKm,
      );
      const isCovered = Number.isFinite(nearestWaterDistanceKm) &&
        nearestWaterDistanceKm <= config.coveredDistanceKm;
      addHexStat(
        hexStatsById,
        containingHex,
        segmentLengthKm,
        isCovered,
        riverName,
      );
    }
  }

  const hexRows = [...hexStatsById.values()]
    .map((stats) => {
      const uncoveredPct = pct(stats.uncoveredRiverKm, stats.totalRiverKm);
      const severityScore =
        stats.uncoveredRiverKm * 1.8 +
        uncoveredPct * 0.045 +
        Math.min(2, stats.uncoveredSegmentCount * 0.003);

      return {
        hexId: stats.hexId,
        centerLngLat: stats.centerLngLat,
        totalRiverKm: roundN(stats.totalRiverKm, 3),
        uncoveredRiverKm: roundN(stats.uncoveredRiverKm, 3),
        uncoveredPct,
        renderedRiverKm: roundN(renderedRiverKmByHexId.get(stats.hexId) ?? 0, 3),
        segmentCount: stats.segmentCount,
        uncoveredSegmentCount: stats.uncoveredSegmentCount,
        severityScore: roundN(severityScore, 4),
        riverNames: riverNamesByContribution(stats.riverNames),
      };
    })
    .filter((row) => row.totalRiverKm >= config.hexMinRiverKm);
  const manuallyExcludedHexMatchCount = hexRows.filter(
    (row) => manuallyExcludedHexIds.has(row.hexId),
  ).length;
  const filteredHexRows = hexRows.filter(
    (row) => !manuallyExcludedHexIds.has(row.hexId),
  );
  const gatedHexRows = filteredHexRows.filter(
    (row) =>
      !config.requireRenderedRiverPresence ||
      row.renderedRiverKm >= config.minRenderedRiverKm,
  );
  const gatedHexIdSet = new Set(gatedHexRows.map((row) => row.hexId));
  const flaggedHexes = filteredHexRows
    .filter((row) => gatedHexIdSet.has(row.hexId))
    .filter(
      (row) =>
        row.uncoveredRiverKm >= config.flagMinUncoveredKm &&
        row.uncoveredPct >= config.flagMinUncoveredPct,
    )
    .sort((left, right) => right.severityScore - left.severityScore);
  const flaggedByPrefix = sortObjectDescending(
    flaggedHexes.reduce((accumulator, row) => {
      const prefix = row.hexId.split("-").slice(0, 2).join("-");
      accumulator[prefix] = (accumulator[prefix] ?? 0) + 1;
      return accumulator;
    }, {}),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    inputs: {
      hexCells: path.relative(repoRoot, inputPaths.hexCells),
      waterBodies: path.relative(repoRoot, inputPaths.waterBodies),
      theaterBoundary: path.relative(repoRoot, inputPaths.theaterBoundary),
      rivers: path.relative(repoRoot, riversPath),
    },
    summary: {
      scannedRiverFeatureCount,
      scannedRiverSegmentCount,
      skippedCounts,
      theaterFilterApplied,
      hexesWithEnoughRiver: filteredHexRows.length,
      hexesWithRenderedRiver: gatedHexRows.length,
      manuallyExcludedHexMatchCount,
      flaggedHexCount: flaggedHexes.length,
      flaggedByPrefix,
    },
    flaggedHexes,
    allHexStats: filteredHexRows.sort((left, right) => right.severityScore - left.severityScore),
    manuallyExcludedHexIds: [...manuallyExcludedHexIds],
  };

  await mkdir(reportsRoot, { recursive: true });
  await writeFile(outputPaths.reportJson, JSON.stringify(report, null, 2), "utf8");
  await writeFile(outputPaths.reportMd, buildMarkdown(report), "utf8");

  console.log(`Wrote ${outputPaths.reportJson}`);
  console.log(`Wrote ${outputPaths.reportMd}`);
  console.log(
    `Flagged ${report.summary.flaggedHexCount} hexes ` +
    `(${report.summary.scannedRiverSegmentCount} segments scanned).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
