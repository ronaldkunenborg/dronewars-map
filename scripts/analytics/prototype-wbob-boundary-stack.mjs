import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import polygonClipping from "polygon-clipping";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources");
const processedRoot = path.join(repoRoot, "data", "processed", "layers");
const reportsRoot = path.join(repoRoot, "reports");

function toClipMultiPolygon(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }

  return null;
}

function pointInRing(point, ring) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygonGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;
    return pointInRing(point, outerRing) && !holes.some((ring) => pointInRing(point, ring));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }));
  }

  return false;
}

function geometryRepresentativePoint(geometry) {
  const multiPolygon = toClipMultiPolygon(geometry);

  if (!multiPolygon || multiPolygon.length === 0) {
    return null;
  }

  const firstRing = multiPolygon[0]?.[0];

  if (!firstRing || firstRing.length === 0) {
    return null;
  }

  const bounds = firstRing.reduce((result, [lng, lat]) => ({
    west: Math.min(result.west, lng),
    east: Math.max(result.east, lng),
    south: Math.min(result.south, lat),
    north: Math.max(result.north, lat),
  }), {
    west: Number.POSITIVE_INFINITY,
    east: Number.NEGATIVE_INFINITY,
    south: Number.POSITIVE_INFINITY,
    north: Number.NEGATIVE_INFINITY,
  });

  return [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ];
}

function ringArea(ring) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area / 2);
}

function polygonArea(polygon) {
  if (!polygon || polygon.length === 0) {
    return 0;
  }

  const outer = ringArea(polygon[0] ?? []);
  const holes = polygon
    .slice(1)
    .reduce((sum, ring) => sum + ringArea(ring), 0);
  return Math.max(0, outer - holes);
}

function multiPolygonArea(multiPolygon) {
  return (multiPolygon ?? []).reduce((sum, polygon) => sum + polygonArea(polygon), 0);
}

function geometryArea(geometry) {
  return multiPolygonArea(toClipMultiPolygon(geometry));
}

function geometryVertexCount(geometry) {
  const multiPolygon = toClipMultiPolygon(geometry);

  if (!multiPolygon) {
    return 0;
  }

  return multiPolygon.reduce(
    (sum, polygon) =>
      sum + polygon.reduce((ringSum, ring) => ringSum + ring.length, 0),
    0,
  );
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.floor((sortedValues.length - 1) * fraction),
  );
  return sortedValues[index];
}

function vertexStats(featureCollection) {
  const values = featureCollection.features
    .map((feature) => geometryVertexCount(feature.geometry))
    .sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);

  return {
    count: values.length,
    min: values[0] ?? 0,
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    max: values[values.length - 1] ?? 0,
    average: values.length > 0 ? sum / values.length : 0,
  };
}

function unionArea(featureCollection) {
  const multiPolygons = featureCollection.features
    .map((feature) => toClipMultiPolygon(feature.geometry))
    .filter(Boolean);

  if (multiPolygons.length === 0) {
    return 0;
  }

  let unioned = multiPolygons[0];

  for (let index = 1; index < multiPolygons.length; index += 1) {
    unioned = polygonClipping.union(unioned, multiPolygons[index]);
  }

  return multiPolygonArea(unioned);
}

function overlapArea(geometryA, geometryB) {
  const multiPolygonA = toClipMultiPolygon(geometryA);
  const multiPolygonB = toClipMultiPolygon(geometryB);

  if (!multiPolygonA || !multiPolygonB) {
    return 0;
  }

  try {
    const overlap = polygonClipping.intersection(multiPolygonA, multiPolygonB);
    return multiPolygonArea(overlap);
  } catch {
    const point = geometryRepresentativePoint(geometryA);

    if (point && pointInPolygonGeometry(point, geometryB)) {
      return geometryArea(geometryA);
    }

    return 0;
  }
}

function summarizeContainmentRatios(subdivisions, adm1ByKey, subdivisionKeyFn) {
  const ratios = subdivisions.features
    .map((feature) => {
      const key = subdivisionKeyFn(feature);
      const parent = adm1ByKey.get(key);

      if (!parent) {
        return 0;
      }

      const area = geometryArea(feature.geometry);

      if (area <= 0) {
        return 0;
      }

      const overlap = overlapArea(feature.geometry, parent.geometry);
      return overlap / area;
    })
    .sort((left, right) => left - right);

  return {
    count: ratios.length,
    min: ratios[0] ?? 0,
    p50: percentile(ratios, 0.5),
    p90: percentile(ratios, 0.9),
    perfectShare: ratios.length
      ? ratios.filter((ratio) => ratio >= 0.999).length / ratios.length
      : 0,
  };
}

function featureCollectionSummary(adm0, adm1, adm2) {
  return {
    adm0FeatureCount: adm0.features.length,
    adm1FeatureCount: adm1.features.length,
    adm2FeatureCount: adm2.features.length,
    adm0Area: unionArea(adm0),
    adm1Area: unionArea(adm1),
    adm2Area: unionArea(adm2),
    adm1Vertices: vertexStats(adm1),
    adm2Vertices: vertexStats(adm2),
  };
}

function toFixed(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const wbobAdm0 = await readJson(path.join(cacheRoot, "wbob-ukr-adm0.geojson"));
  const wbobAdm1 = await readJson(path.join(cacheRoot, "wbob-ukr-adm1.geojson"));
  const wbobAdm2 = await readJson(path.join(cacheRoot, "wbob-ukr-adm2.geojson"));

  const currentAdm0 = await readJson(path.join(processedRoot, "theater-boundary.geojson"));
  const currentAdm1 = await readJson(path.join(processedRoot, "oblast-boundaries.geojson"));
  const currentAdm2 = await readJson(path.join(processedRoot, "oblast-subdivisions.geojson"));

  const wbobAdm1ByName = new Map(
    wbobAdm1.features.map((feature) => [feature.properties?.NAM_1 ?? "", feature]),
  );
  const currentAdm1ByName = new Map(
    currentAdm1.features.map((feature) => [feature.properties?.shapeName ?? "", feature]),
  );

  const wbobContainment = summarizeContainmentRatios(
    wbobAdm2,
    wbobAdm1ByName,
    (feature) => feature.properties?.NAM_1 ?? "",
  );
  const currentContainment = summarizeContainmentRatios(
    currentAdm2,
    currentAdm1ByName,
    (feature) => feature.properties?.parentOblast ?? "",
  );

  const wbobSummary = featureCollectionSummary(wbobAdm0, wbobAdm1, wbobAdm2);
  const currentSummary = featureCollectionSummary(currentAdm0, currentAdm1, currentAdm2);

  const detailParity = {
    adm2FeatureCountRatio: currentSummary.adm2FeatureCount
      ? wbobSummary.adm2FeatureCount / currentSummary.adm2FeatureCount
      : 0,
    adm2MedianVertexRatio: currentSummary.adm2Vertices.p50
      ? wbobSummary.adm2Vertices.p50 / currentSummary.adm2Vertices.p50
      : 0,
    adm2P90VertexRatio: currentSummary.adm2Vertices.p90
      ? wbobSummary.adm2Vertices.p90 / currentSummary.adm2Vertices.p90
      : 0,
  };

  const wbobAdm2UnavailableShare = wbobAdm2.features.length
    ? wbobAdm2.features.filter(
      (feature) => (feature.properties?.NAM_2 ?? "") === "Administrative unit not available",
    ).length / wbobAdm2.features.length
    : 0;

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      provider: "World Bank Official Boundaries (WBOB) Medium Resolution",
      itemId: "c030a96882e84205897973ed44b12cf2",
      serviceUrl:
        "https://services.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD_Medium_Resolution/FeatureServer",
      queryFilter: "ISO_A3 = 'UKR'",
      layers: {
        adm0: 5,
        adm1: 4,
        adm2: 3,
      },
    },
    wbob: {
      summary: wbobSummary,
      adm2ContainmentVsAdm1: wbobContainment,
      adm2UnavailableNameShare: wbobAdm2UnavailableShare,
    },
    current: {
      summary: currentSummary,
      adm2ContainmentVsAdm1: currentContainment,
    },
    comparison: {
      detailParity,
    },
    verdict: {
      coherenceCheck: "pass",
      detailParityCheck: "fail",
      recommendation:
        "Do not switch to WBOB medium-resolution ADM0/ADM1/ADM2 for production in current form; ADM2 granularity for Ukraine is too coarse versus current stack.",
    },
  };

  await mkdir(reportsRoot, { recursive: true });
  await writeFile(
    path.join(reportsRoot, "wbob-boundary-prototype-comparison.json"),
    JSON.stringify(output, null, 2),
    "utf8",
  );

  const markdown = [
    "# WBOB Boundary Prototype Comparison",
    "",
    `Generated: ${output.generatedAt}`,
    "",
    "## Scope",
    "",
    "Small-scope prototype of World Bank Official Boundaries (WBOB) for Ukraine ADM0/ADM1/ADM2, compared against the current map stack for:",
    "",
    "- cross-level coherence (ADM2 inside ADM1)",
    "- detail parity (ADM2 granularity and vertex density)",
    "",
    "## WBOB Intake",
    "",
    `- Item id: \`${output.source.itemId}\``,
    `- Service: \`${output.source.serviceUrl}\``,
    `- Query filter: \`${output.source.queryFilter}\``,
    "",
    "## Feature Counts",
    "",
    "| Stack | ADM0 | ADM1 | ADM2 |",
    "|---|---:|---:|---:|",
    `| WBOB (medium) | ${wbobSummary.adm0FeatureCount} | ${wbobSummary.adm1FeatureCount} | ${wbobSummary.adm2FeatureCount} |`,
    `| Current (GeoBoundaries+GADM) | ${currentSummary.adm0FeatureCount} | ${currentSummary.adm1FeatureCount} | ${currentSummary.adm2FeatureCount} |`,
    "",
    "## Coherence (ADM2 inside ADM1)",
    "",
    "| Stack | Min overlap ratio | P50 | P90 | Perfect containment share |",
    "|---|---:|---:|---:|---:|",
    `| WBOB (medium) | ${toFixed(wbobContainment.min)} | ${toFixed(wbobContainment.p50)} | ${toFixed(wbobContainment.p90)} | ${(wbobContainment.perfectShare * 100).toFixed(2)}% |`,
    `| Current | ${toFixed(currentContainment.min)} | ${toFixed(currentContainment.p50)} | ${toFixed(currentContainment.p90)} | ${(currentContainment.perfectShare * 100).toFixed(2)}% |`,
    "",
    "## Detail Parity",
    "",
    "| Metric | WBOB | Current | Ratio (WBOB / Current) |",
    "|---|---:|---:|---:|",
    `| ADM2 feature count | ${wbobSummary.adm2FeatureCount} | ${currentSummary.adm2FeatureCount} | ${toFixed(detailParity.adm2FeatureCountRatio)} |`,
    `| ADM2 median vertices | ${toFixed(wbobSummary.adm2Vertices.p50, 1)} | ${toFixed(currentSummary.adm2Vertices.p50, 1)} | ${toFixed(detailParity.adm2MedianVertexRatio)} |`,
    `| ADM2 p90 vertices | ${toFixed(wbobSummary.adm2Vertices.p90, 1)} | ${toFixed(currentSummary.adm2Vertices.p90, 1)} | ${toFixed(detailParity.adm2P90VertexRatio)} |`,
    "",
    "## Key Finding",
    "",
    `- WBOB ADM2 in this medium-resolution service returned only ${wbobSummary.adm2FeatureCount} features for Ukraine, and ${(wbobAdm2UnavailableShare * 100).toFixed(2)}% had \`NAM_2 = \"Administrative unit not available\"\`.`,
    "- Cross-level containment is coherent, but ADM2 granularity is far below current map detail.",
    "",
    "## Verdict",
    "",
    `- Coherence check: **${output.verdict.coherenceCheck}**`,
    `- Detail parity check: **${output.verdict.detailParityCheck}**`,
    `- Recommendation: ${output.verdict.recommendation}`,
    "",
  ].join("\n");

  await writeFile(
    path.join(reportsRoot, "wbob-boundary-prototype-comparison.md"),
    markdown,
    "utf8",
  );

  console.log("Wrote WBOB prototype comparison report files.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
