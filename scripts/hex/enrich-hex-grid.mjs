import {
  axialDirections,
  estimateHexAreaKm2,
  isPointInFeature,
  readGeoJson,
  writeGeoJson,
} from "./shared.mjs";

function buildHexId(q, r) {
  const qTag = q >= 0 ? `E${q}` : `W${Math.abs(q)}`;
  const rTag = r >= 0 ? `N${r}` : `S${Math.abs(r)}`;
  return `HX-${qTag}-${rTag}`;
}

function computeCentroid(coordinates) {
  const ring = coordinates[0];
  const points = ring.slice(0, -1);
  const longitude =
    points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude =
    points.reduce((sum, point) => sum + point[1], 0) / points.length;

  return [longitude, latitude];
}

async function loadOblastFeatures() {
  try {
    const geojson = await readGeoJson("layers/oblast-boundaries.geojson");
    return geojson.features ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const hexGrid = await readGeoJson("hex-grid.geojson");
  const oblasts = await loadOblastFeatures();
  const featureLookup = new Map();

  for (const feature of hexGrid.features) {
    const q = feature.properties.q;
    const r = feature.properties.r;
    const id = buildHexId(q, r);
    const centroid = computeCentroid(feature.geometry.coordinates);

    const parentRegion = oblasts.find((oblast) => isPointInFeature(centroid, oblast));
    const parentName =
      parentRegion?.properties?.name ??
      parentRegion?.properties?.NAME_1 ??
      "unassigned";
    const parentId =
      parentRegion?.properties?.id ??
      parentRegion?.properties?.osm_id ??
      parentName;

    featureLookup.set(`${q}:${r}`, id);

    feature.properties = {
      id,
      q,
      r,
      centroid,
      centerLngLat: feature.properties.centerLngLat,
      areaKm2: estimateHexAreaKm2(feature.properties.radiusKm),
      parentRegionId: parentId,
      parentRegionName: parentName,
    };
  }

  for (const feature of hexGrid.features) {
    const { q, r } = feature.properties;
    feature.properties.adjacencyIds = axialDirections()
      .map(([dq, dr]) => featureLookup.get(`${q + dq}:${r + dr}`))
      .filter(Boolean);
  }

  await writeGeoJson("hex-cells.geojson", hexGrid);
  console.log("Wrote enriched hex cells to data/processed/hex-cells.geojson");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
