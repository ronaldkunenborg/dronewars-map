import {
  computeDefensibilityScore,
  computeEffectiveCapacity,
  computeMobilityScore,
  scoringConfig,
} from "./scoring.mjs";
import { isPointInPolygon, readGeoJson, writeGeoJson } from "../hex/shared.mjs";

const gridCellSizeDegrees = 0.25;

function getPolygonRing(feature) {
  return feature.geometry.coordinates[0];
}

function getLineStrings(feature) {
  if (feature.geometry.type === "LineString") {
    return [feature.geometry.coordinates];
  }

  if (feature.geometry.type === "MultiLineString") {
    return feature.geometry.coordinates;
  }

  return [];
}

function getPolygonVertices(feature) {
  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates[0];
  }

  if (feature.geometry.type === "MultiPolygon") {
    return feature.geometry.coordinates.flatMap((polygon) => polygon[0]);
  }

  return [];
}

function geometryBounds(geometry) {
  const bounds = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };

  function visit(coordinates) {
    if (!Array.isArray(coordinates)) {
      return;
    }

    for (const coordinate of coordinates) {
      if (Array.isArray(coordinate) && typeof coordinate[0] === "number") {
        bounds.west = Math.min(bounds.west, coordinate[0]);
        bounds.east = Math.max(bounds.east, coordinate[0]);
        bounds.south = Math.min(bounds.south, coordinate[1]);
        bounds.north = Math.max(bounds.north, coordinate[1]);
      } else {
        visit(coordinate);
      }
    }
  }

  visit(geometry.coordinates);
  return bounds;
}

function boundsKey(x, y) {
  return `${x}:${y}`;
}

function boundsToGridRange(bounds) {
  return {
    minX: Math.floor(bounds.west / gridCellSizeDegrees),
    maxX: Math.floor(bounds.east / gridCellSizeDegrees),
    minY: Math.floor(bounds.south / gridCellSizeDegrees),
    maxY: Math.floor(bounds.north / gridCellSizeDegrees),
  };
}

function buildSpatialIndex(features) {
  const buckets = new Map();

  features.forEach((feature, index) => {
    const bounds = geometryBounds(feature.geometry);
    const range = boundsToGridRange(bounds);
    feature.__bounds = bounds;

    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        const key = boundsKey(x, y);

        if (!buckets.has(key)) {
          buckets.set(key, []);
        }

        buckets.get(key).push(index);
      }
    }
  });

  return {
    features,
    buckets,
  };
}

function boundsIntersect(left, right) {
  return !(
    left.east < right.west ||
    left.west > right.east ||
    left.north < right.south ||
    left.south > right.north
  );
}

function querySpatialIndex(index, bounds) {
  const range = boundsToGridRange(bounds);
  const featureIndexes = new Set();

  for (let x = range.minX; x <= range.maxX; x += 1) {
    for (let y = range.minY; y <= range.maxY; y += 1) {
      const bucket = index.buckets.get(boundsKey(x, y));

      if (!bucket) {
        continue;
      }

      for (const featureIndex of bucket) {
        featureIndexes.add(featureIndex);
      }
    }
  }

  return [...featureIndexes]
    .map((featureIndex) => index.features[featureIndex])
    .filter((feature) => boundsIntersect(feature.__bounds, bounds));
}

function hexContainsPoint(hexFeature, point) {
  return isPointInPolygon(point, hexFeature.geometry.coordinates);
}

function fractionOfVerticesInside(hexFeature, polygonFeature) {
  const vertices = getPolygonVertices(polygonFeature);

  if (vertices.length === 0) {
    return 0;
  }

  const insideCount = vertices.filter((vertex) => hexContainsPoint(hexFeature, vertex)).length;
  return insideCount / vertices.length;
}

function lineTouchesHex(hexFeature, lineFeature) {
  return getLineStrings(lineFeature).some((line) =>
    line.some((point) => hexContainsPoint(hexFeature, point)),
  );
}

function approximateLineLengthKmInHex(hexFeature, lineFeature) {
  const kmPerDegree = 111.32;
  let total = 0;

  for (const line of getLineStrings(lineFeature)) {
    for (let index = 1; index < line.length; index += 1) {
      const from = line[index - 1];
      const to = line[index];
      const midpoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

      if (!hexContainsPoint(hexFeature, midpoint)) {
        continue;
      }

      const dx = (to[0] - from[0]) * kmPerDegree * Math.cos((midpoint[1] * Math.PI) / 180);
      const dy = (to[1] - from[1]) * kmPerDegree;
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return total;
}

function pointScore(pointFeature) {
  const place = pointFeature.properties?.place;

  switch (place) {
    case "city":
      return 4;
    case "town":
      return 3;
    case "village":
      return 2;
    case "hamlet":
      return 1;
    default:
      return 1;
  }
}

function settlementScoreForHex(hexFeature, settlements) {
  return settlements.reduce((total, feature) => {
    if (!hexContainsPoint(hexFeature, feature.geometry.coordinates)) {
      return total;
    }

    return total + pointScore(feature);
  }, 0);
}

function dominantTerrain(summary) {
  const candidates = [
    ["wetland", summary.wetlandCoverage],
    ["forest", summary.forestCoverage],
    ["open", summary.openTerrainCoverage],
  ];

  candidates.sort((left, right) => right[1] - left[1]);
  return candidates[0][0];
}

async function loadOptionalLayer(relativePath) {
  try {
    const geojson = await readGeoJson(relativePath);
    return geojson.features ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const hexCells = await readGeoJson("hex-cells.geojson");
  const forests = buildSpatialIndex(await loadOptionalLayer("layers/forests.geojson"));
  const wetlands = buildSpatialIndex(await loadOptionalLayer("layers/wetlands.geojson"));
  const rivers = buildSpatialIndex(await loadOptionalLayer("layers/rivers.geojson"));
  const roads = buildSpatialIndex(await loadOptionalLayer("layers/roads.geojson"));
  const railways = buildSpatialIndex(await loadOptionalLayer("layers/railways.geojson"));
  const settlements = buildSpatialIndex(await loadOptionalLayer("layers/settlements.geojson"));

  for (const hexFeature of hexCells.features) {
    const hexBounds = geometryBounds(hexFeature.geometry);
    const forestCandidates = querySpatialIndex(forests, hexBounds);
    const wetlandCandidates = querySpatialIndex(wetlands, hexBounds);
    const riverCandidates = querySpatialIndex(rivers, hexBounds);
    const roadCandidates = querySpatialIndex(roads, hexBounds);
    const railwayCandidates = querySpatialIndex(railways, hexBounds);
    const settlementCandidates = querySpatialIndex(settlements, hexBounds);

    const forestCoverage = Math.min(
      1,
      forestCandidates.reduce(
        (sum, feature) => sum + fractionOfVerticesInside(hexFeature, feature),
        0,
      ),
    );
    const wetlandCoverage = Math.min(
      1,
      wetlandCandidates.reduce(
        (sum, feature) => sum + fractionOfVerticesInside(hexFeature, feature),
        0,
      ),
    );
    const openTerrainCoverage = Math.max(0, 1 - forestCoverage - wetlandCoverage);
    const waterBarrierPresence = riverCandidates.some((feature) => lineTouchesHex(hexFeature, feature));
    const roadKm = roadCandidates.reduce(
      (sum, feature) => sum + approximateLineLengthKmInHex(hexFeature, feature),
      0,
    );
    const areaKm2 = hexFeature.properties.areaKm2;
    const roadDensity = areaKm2 > 0 ? roadKm / areaKm2 : 0;
    const railPresence = railwayCandidates.some((feature) => lineTouchesHex(hexFeature, feature));
    const settlementScore = settlementScoreForHex(hexFeature, settlementCandidates);
    const elevationRoughness = Number(
      Math.min(1, 0.12 + wetlandCoverage * 0.08 + forestCoverage * 0.15).toFixed(3),
    );

    const terrainSummary = {
      dominantTerrain: dominantTerrain({
        forestCoverage,
        wetlandCoverage,
        openTerrainCoverage,
      }),
      forestCoverage: Number(forestCoverage.toFixed(3)),
      wetlandCoverage: Number(wetlandCoverage.toFixed(3)),
      openTerrainCoverage: Number(openTerrainCoverage.toFixed(3)),
      waterBarrierPresence,
      elevationRoughness,
    };

    const infrastructureSummary = {
      roadDensity: Number(roadDensity.toFixed(3)),
      railPresence,
      settlementScore,
    };

    const effectiveCapacity = Math.round(
      computeEffectiveCapacity({
        ...terrainSummary,
        ...infrastructureSummary,
      }),
    );

    hexFeature.properties = {
      ...hexFeature.properties,
      terrainSummary,
      infrastructureSummary,
      baseCapacity: scoringConfig.baseCapacity,
      effectiveCapacity,
      assignedForceCount: 0,
      mobilityScore: computeMobilityScore({
        ...terrainSummary,
        ...infrastructureSummary,
      }),
      defensibilityScore: computeDefensibilityScore({
        ...terrainSummary,
        ...infrastructureSummary,
      }),
    };
  }

  await writeGeoJson("hex-cells-analytics.geojson", hexCells);
  console.log("Wrote analytics-enriched hex cells to data/processed/hex-cells-analytics.geojson");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
