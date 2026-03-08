import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  buildHexPolygon,
  hexConfig,
  isPointInFeature,
  lngLatToMercator,
  pointyHexCenter,
  projectKmToLngLat,
  processedRoot,
  readGeoJson,
  writeGeoJson,
} from "./shared.mjs";

async function loadTheaterFeatures() {
  try {
    const theater = await readGeoJson("layers/theater-boundary.geojson");
    return theater.features ?? [];
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(processedRoot, { recursive: true });

  const theaterFeatures = await loadTheaterFeatures();
  const originLngLat = [hexConfig.extent.west, hexConfig.extent.south];
  const originMercator = lngLatToMercator(originLngLat);
  const features = [];
  const seen = new Set();

  const qLimit = 220;
  const rLimit = 220;

  for (let q = -qLimit; q <= qLimit; q += 1) {
    for (let r = -rLimit; r <= rLimit; r += 1) {
      const centerKm = pointyHexCenter(q, r, hexConfig.radiusKm);
      const center = projectKmToLngLat(originMercator, centerKm.xKm, centerKm.yKm);

      if (
        center[0] < hexConfig.extent.west ||
        center[0] > hexConfig.extent.east ||
        center[1] < hexConfig.extent.south ||
        center[1] > hexConfig.extent.north
      ) {
        continue;
      }

      if (
        theaterFeatures.length > 0 &&
        !theaterFeatures.some((feature) => isPointInFeature(center, feature))
      ) {
        continue;
      }

      const key = `${q}:${r}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      features.push({
        type: "Feature",
        properties: {
          q,
          r,
          radiusKm: hexConfig.radiusKm,
          xKm: centerKm.xKm,
          yKm: centerKm.yKm,
          centerLngLat: center,
        },
        geometry: {
          type: "Polygon",
          coordinates: [buildHexPolygon(originMercator, centerKm, hexConfig.radiusKm)],
        },
      });
    }
  }

  await writeGeoJson("hex-grid.geojson", {
    type: "FeatureCollection",
    features,
  });

  console.log(`Generated ${features.length} hexes at data/processed/hex-grid.geojson`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
