import {
  computeDefensibilityScore,
  computeEffectiveCapacity,
  computeMobilityScore,
  scoringConfig,
} from "./scoring.mjs";
import { isPointInPolygon, readGeoJson, writeGeoJson } from "../hex/shared.mjs";

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

function hexContainsPoint(hexFeature, point) {
  return isPointInPolygon(point, getPolygonRing(hexFeature));
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
  const forests = await loadOptionalLayer("layers/forests.geojson");
  const wetlands = await loadOptionalLayer("layers/wetlands.geojson");
  const rivers = await loadOptionalLayer("layers/rivers.geojson");
  const roads = await loadOptionalLayer("layers/roads.geojson");
  const railways = await loadOptionalLayer("layers/railways.geojson");
  const settlements = await loadOptionalLayer("layers/settlements.geojson");

  for (const hexFeature of hexCells.features) {
    const forestCoverage = Math.min(
      1,
      forests.reduce((sum, feature) => sum + fractionOfVerticesInside(hexFeature, feature), 0),
    );
    const wetlandCoverage = Math.min(
      1,
      wetlands.reduce((sum, feature) => sum + fractionOfVerticesInside(hexFeature, feature), 0),
    );
    const openTerrainCoverage = Math.max(0, 1 - forestCoverage - wetlandCoverage);
    const waterBarrierPresence = rivers.some((feature) => lineTouchesHex(hexFeature, feature));
    const roadKm = roads.reduce(
      (sum, feature) => sum + approximateLineLengthKmInHex(hexFeature, feature),
      0,
    );
    const areaKm2 = hexFeature.properties.areaKm2;
    const roadDensity = areaKm2 > 0 ? roadKm / areaKm2 : 0;
    const railPresence = railways.some((feature) => lineTouchesHex(hexFeature, feature));
    const settlementScore = settlementScoreForHex(hexFeature, settlements);
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

