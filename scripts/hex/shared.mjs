import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..");
export const processedRoot = path.join(repoRoot, "data", "processed");

export const hexConfig = {
  radiusKm: 24,
  extent: {
    west: 22.0,
    south: 44.0,
    east: 40.5,
    north: 52.5,
  },
};

export function kmPerDegreeLatitude() {
  return 110.574;
}

export function kmPerDegreeLongitude(latitude) {
  return 111.32 * Math.cos((latitude * Math.PI) / 180);
}

export function axialDirections() {
  return [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
}

export function pointyHexCenter(q, r, radiusKm) {
  const xKm = radiusKm * Math.sqrt(3) * (q + r / 2);
  const yKm = radiusKm * 1.5 * r;
  return { xKm, yKm };
}

const EARTH_RADIUS_METERS = 6378137;

export function lngLatToMercator([longitude, latitude]) {
  const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const x = EARTH_RADIUS_METERS * (longitude * Math.PI / 180);
  const y =
    EARTH_RADIUS_METERS *
    Math.log(Math.tan(Math.PI / 4 + (clampedLatitude * Math.PI) / 360));

  return [x, y];
}

export function mercatorToLngLat([x, y]) {
  const longitude = (x / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const latitude =
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) *
    (180 / Math.PI);

  return [longitude, latitude];
}

export function projectKmToLngLat(originMercator, xKm, yKm) {
  return mercatorToLngLat([
    originMercator[0] + xKm * 1000,
    originMercator[1] + yKm * 1000,
  ]);
}

export function buildHexPolygon(originMercator, centerKm, radiusKm) {
  const coordinates = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    const dxKm = radiusKm * Math.cos(angle);
    const dyKm = radiusKm * Math.sin(angle);
    coordinates.push(
      projectKmToLngLat(originMercator, centerKm.xKm + dxKm, centerKm.yKm + dyKm),
    );
  }

  coordinates.push(coordinates[0]);
  return coordinates;
}

export async function readGeoJson(relativePath) {
  const content = await readFile(path.join(processedRoot, relativePath), "utf8");
  return JSON.parse(content);
}

export async function writeGeoJson(relativePath, geojson) {
  await writeFile(
    path.join(processedRoot, relativePath),
    JSON.stringify(geojson, null, 2),
    "utf8",
  );
}

export function isPointInRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] <
        ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function isPointInPolygon(point, polygonCoordinates) {
  if (!isPointInRing(point, polygonCoordinates[0])) {
    return false;
  }

  for (let index = 1; index < polygonCoordinates.length; index += 1) {
    if (isPointInRing(point, polygonCoordinates[index])) {
      return false;
    }
  }

  return true;
}

export function isPointInFeature(point, feature) {
  if (feature.geometry.type === "Polygon") {
    return isPointInPolygon(point, feature.geometry.coordinates);
  }

  if (feature.geometry.type === "MultiPolygon") {
    return feature.geometry.coordinates.some((polygon) =>
      isPointInPolygon(point, polygon),
    );
  }

  return false;
}

export function estimateHexAreaKm2(radiusKm) {
  return (3 * Math.sqrt(3) * radiusKm * radiusKm) / 2;
}
