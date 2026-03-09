import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Public fallback layer builder and cache utility.
 *
 * What this script does:
 * - Downloads a minimal public-source layer set for the map when the full local GIS pipeline is unavailable.
 * - Caches upstream JSON responses under `data/cache/public-sources` so reruns reuse them for up to one year.
 * - Builds processed layer outputs under `data/processed/layers` and rewrites `data/processed/layers.json`.
 *
 * Main remote inputs:
 * - GeoBoundaries metadata and geometry for Ukraine ADM0 and ADM1 boundaries.
 * - Natural Earth GeoJSON for rivers, lakes, seas, roads, and railways.
 * - Natural Earth GeoJSON for rivers, lakes, seas, roads, railways, and urban areas.
 * - Overpass API results for settlements and tiled polygon pulls for forests and wetlands.
 *
 * Main outputs:
 * - `data/processed/layers/theater-boundary.geojson`
 * - `data/processed/layers/oblast-boundaries.geojson`
 * - `data/processed/layers/rivers.geojson`
 * - `data/processed/layers/water-bodies.geojson`
 * - `data/processed/layers/seas.geojson`
 * - `data/processed/layers/wetlands.geojson`
 * - `data/processed/layers/forests.geojson`
 * - `data/processed/layers/roads.geojson`
 * - `data/processed/layers/railways.geojson`
 * - `data/processed/layers/major-city-urban-areas.geojson`
 * - `data/processed/layers/settlements.geojson`
 * - `data/processed/layers.json`
 *
 * Default invocation:
 * - `node scripts/layers/fetch-public-layers.mjs`
 *   Builds all public fallback layers, using cache entries when available and valid.
 *
 * Cache control:
 * - `--refresh`
 *   Ignores all cache entries for this run and rewrites them from remote sources.
 * - `--refresh=<target[,target...]>`
 *   Refreshes only selected cache groups or keys.
 *   Examples:
 *   - `--refresh=natural-earth`
 *   - `--refresh=geoboundaries,overpass/settlements`
 *   - `--refresh=forests`
 *
 * Inspection and smoke tests:
 * - `--cache-report`
 *   Prints every known cache key with status, schema version, cached date, and remaining TTL.
 * - `--smoke-test=static`
 *   Fetches only the static GeoBoundaries and Natural Earth sources, mainly to validate cache behavior quickly.
 * - `--smoke-test=settlements`
 *   Fetches only the Overpass settlements payload, mainly to validate cached POST requests and Overpass fallback.
 * - `--smoke-test=wetlands`
 *   Fetches only the tiled Overpass wetland payloads, mainly to populate or validate that cache slice.
 * - `--smoke-test=forests`
 *   Fetches only the tiled Overpass forest payloads, mainly to populate or validate that cache slice.
 *
 * Cache invalidation rules:
 * - Entries expire after `cacheTtlMs`.
 * - Entries are also ignored when `cacheSchemaVersion` changes.
 * - Cache entries are wrapped as `{ version, cachedAt, data }`.
 *
 * Internal structure:
 * - Path and cache constants define repository locations and source endpoints.
 * - Cache helpers decide whether to use, read, write, or report cached payloads.
 * - Geometry helpers filter and simplify source data into map-ready GeoJSON.
 * - `main()` dispatches into report mode, smoke-test mode, or the full layer build.
 */

// Resolve repository-relative paths once so the script can be run from any cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(repoRoot, "data", "cache", "public-sources");
const processedRoot = path.join(repoRoot, "data", "processed");
const layersRoot = path.join(processedRoot, "layers");
// Cached source responses stay reusable for up to one year unless explicitly refreshed.
const cacheTtlMs = 365 * 24 * 60 * 60 * 1000;
// Bump this when the cache file wrapper or payload assumptions change to invalidate old entries.
const cacheSchemaVersion = 1;

// The public fallback build is clipped to a fixed Ukraine theater envelope.
const theaterBbox = {
  west: 22.0,
  south: 44.0,
  east: 40.5,
  north: 52.5,
};

// Stable remote sources used to assemble a visible fallback map without local GIS inputs.
const sources = {
  adm0Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM0/",
  adm1Api: "https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/",
  overpassApi: "https://overpass-api.de/api/interpreter",
  terrainOverpassApi: "https://overpass.kumi.systems/api/interpreter",
  overpassFallbackApi: "https://lz4.overpass-api.de/api/interpreter",
  rivers:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
  lakes:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
  seas:
    "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_geography_marine_polys.geojson",
  roads:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson",
  railways:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson",
  urbanAreas:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas_landscan.geojson",
};

// Optional CLI refresh targets let callers invalidate part of the cache or all of it.
const refreshTargets = new Set(
  process.argv
    .flatMap((argument) => {
      if (argument === "--refresh") {
        return ["all"];
      }

      if (argument.startsWith("--refresh=")) {
        return argument
          .slice("--refresh=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
      }

      return [];
    }),
);

// Smoke tests limit execution to a small subset of fetches so cache behavior can be verified quickly.
const smokeTestMode =
  process.argv.find((argument) => argument.startsWith("--smoke-test="))
    ?.slice("--smoke-test=".length) ?? null;
const cacheReportMode = process.argv.includes("--cache-report");

// Shared empty fallback for layers that may intentionally produce no features.
function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

// Decide whether a cache entry should be bypassed for the current run.
function shouldRefresh(cacheKey) {
  if (refreshTargets.has("all")) {
    return true;
  }

  const segments = cacheKey.split("/");
  return segments.some((segment) => refreshTargets.has(segment)) || refreshTargets.has(cacheKey);
}

// Map logical cache keys to on-disk JSON files inside the public cache tree.
function cachePathForKey(cacheKey) {
  return path.join(cacheRoot, `${cacheKey}.json`);
}

// Define the full set of cache keys this script may populate for reporting and refresh targeting.
function getKnownCacheKeys() {
  const tiledLayerKeys = ["forests", "wetlands"].flatMap((layerId) =>
    buildBboxGrid(theaterBbox, 3, 3).map((_, tileIndex) => `overpass/${layerId}/tile-${tileIndex}`),
  );

  return [
    "geoboundaries/adm0-metadata",
    "geoboundaries/adm1-metadata",
    "geoboundaries/adm0-geometry",
    "geoboundaries/adm1-geometry",
    "natural-earth/rivers",
    "natural-earth/lakes",
    "natural-earth/seas",
    "natural-earth/roads",
    "natural-earth/railways",
    "natural-earth/urban-areas",
    "overpass/settlements",
    ...tiledLayerKeys,
  ];
}

// Format a millisecond duration into a compact day/hour string for cache reports.
function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "n/a";
  }

  if (ms <= 0) {
    return "expired";
  }

  const totalHours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${hours}h`;
}

// Inspect a cache file without applying read-time cache-hit logging side effects.
async function describeCacheEntry(cacheKey) {
  try {
    const contents = await readFile(cachePathForKey(cacheKey), "utf8");
    const parsed = JSON.parse(contents);
    const cachedAt = typeof parsed?.cachedAt === "string" ? Date.parse(parsed.cachedAt) : Number.NaN;
    const ageMs = Number.isFinite(cachedAt) ? Date.now() - cachedAt : Number.NaN;
    const ttlRemainingMs = Number.isFinite(ageMs) ? cacheTtlMs - ageMs : Number.NaN;
    const schemaMatches = parsed?.version === cacheSchemaVersion;
    const expired = !Number.isFinite(cachedAt) || ttlRemainingMs <= 0;

    return {
      cacheKey,
      exists: true,
      version: parsed?.version ?? "n/a",
      cachedAt: typeof parsed?.cachedAt === "string" ? parsed.cachedAt : "n/a",
      ttlRemaining: formatDuration(ttlRemainingMs),
      status: schemaMatches ? (expired ? "expired" : "ready") : "schema-mismatch",
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        cacheKey,
        exists: false,
        version: "n/a",
        cachedAt: "n/a",
        ttlRemaining: "n/a",
        status: "missing",
      };
    }

    throw error;
  }
}

// Read a cached response wrapper, enforcing schema compatibility and TTL.
async function readCachedJson(cacheKey) {
  try {
    const contents = await readFile(cachePathForKey(cacheKey), "utf8");
    const parsed = JSON.parse(contents);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== cacheSchemaVersion ||
      typeof parsed.cachedAt !== "string" ||
      !("data" in parsed)
    ) {
      console.log(`cache skip ${cacheKey} (schema mismatch)`);
      return null;
    }

    const cachedAt = Date.parse(parsed.cachedAt);

    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > cacheTtlMs) {
      console.log(`cache skip ${cacheKey} (expired)`);
      return null;
    }

    console.log(`cache hit  ${cacheKey}`);
    return parsed.data;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

// Persist a response using a small wrapper so TTL and schema checks can be enforced later.
async function writeCachedJson(cacheKey, data) {
  const cachePath = cachePathForKey(cacheKey);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({
    version: cacheSchemaVersion,
    cachedAt: new Date().toISOString(),
    data,
  }, null, 2), "utf8");
}

// Fetch JSON from a remote source, using the local cache unless this key was refreshed.
async function fetchJsonWithCache(cacheKey, url, init) {
  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedJson(cacheKey);

    if (cached !== null) {
      return cached;
    }
  }

  console.log(`fetch      ${cacheKey}`);
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const data = await response.json();
  await writeCachedJson(cacheKey, data);
  return data;
}

// Convenience wrapper for cache-backed GET requests.
async function fetchJson(url, cacheKey) {
  return fetchJsonWithCache(cacheKey, url);
}

// Fetch the settlement query through the shared Overpass fallback and cache path.
async function fetchOverpassJson(query) {
  return fetchOverpassJsonWithFallback(
    [sources.overpassApi, sources.overpassFallbackApi, sources.terrainOverpassApi],
    query,
    "overpass/settlements",
  );
}

// Try multiple Overpass endpoints until one succeeds, then cache the successful payload.
async function fetchOverpassJsonWithFallback(urls, query, cacheKey) {
  if (!shouldRefresh(cacheKey)) {
    const cached = await readCachedJson(cacheKey);

    if (cached !== null) {
      return cached;
    }
  }

  let lastError = null;

  for (const url of urls) {
    try {
      return await fetchJsonWithCache(cacheKey, url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: query,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch Overpass data.");
}

// Query named populated places within the theater bounds for map labels and point analytics.
function overpassPlaceQuery(bbox) {
  return `
[out:json][timeout:180];
(
  node["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["place"~"city|town|village"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center tags;
`.trim();
}

// Query polygonal Overpass ways for thematic terrain layers over a tile bbox.
function overpassAreaQuery(selectors, bbox) {
  return `
[out:json][timeout:90];
(
${selectors.map((selector) => `  way${selector}(${bbox.south},${bbox.west},${bbox.north},${bbox.east});`).join("\n")}
);
out tags geom;
`.trim();
}

// Keep only larger urban extents so the fill layer emphasizes major cities rather than every settlement patch.
function filterMajorCityUrbanAreas(featureCollection) {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature) => {
      const maxPopulation = Number(feature.properties?.max_pop_al ?? 0);
      return Number.isFinite(maxPopulation) && maxPopulation >= 200000;
    }),
  };
}

// Normalize inconsistent population tag formats into a numeric value when possible.
function normalizePopulation(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(value.replaceAll(" ", "").replaceAll(",", ""));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

// Sort place classes into a stable label and symbol priority order.
function placeRank(place) {
  switch (place) {
    case "city":
      return 1;
    case "town":
      return 2;
    case "village":
      return 3;
    case "hamlet":
      return 4;
    case "isolated_dwelling":
      return 5;
    default:
      return 6;
  }
}

// Order settlements by importance so downstream labeling uses the strongest candidates first.
function sortSettlements(features) {
  return [...features].sort((left, right) => {
    const leftRank = placeRank(left.properties.place);
    const rightRank = placeRank(right.properties.place);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return (right.properties.population ?? 0) - (left.properties.population ?? 0);
  });
}

// Standard point-in-ring test used by the polygon containment helpers below.
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

// Determine whether a point falls inside a Polygon or MultiPolygon geometry.
function pointInPolygonGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;
    return pointInRing(point, outerRing) && !holes.some((ring) => pointInRing(point, ring));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }),
    );
  }

  return false;
}

// Convert lon/lat deltas near a reference latitude into approximate kilometer coordinates.
function toKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);

  return [
    point[0] * kmPerDegreeLongitude,
    point[1] * kmPerDegreeLatitude,
  ];
}

// Approximate the shortest kilometer distance from a point to a line segment.
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

// Find the nearest distance from a point to any segment in a polygon ring.
function minDistanceToRingKm(point, ring) {
  let minDistance = Infinity;

  for (let index = 1; index < ring.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistanceKm(point, ring[index - 1], ring[index]),
    );
  }

  return minDistance;
}

// Allow near-border settlement features to survive even when their center falls just outside the polygon.
function pointWithinBorderBuffer(point, geometry, bufferKm) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.some((ring) => minDistanceToRingKm(point, ring) <= bufferKm);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      pointWithinBorderBuffer(point, { type: "Polygon", coordinates: polygon }, bufferKm),
    );
  }

  return false;
}

// Prefer richer OSM object types when deduplicating overlapping settlement records.
function settlementTypePreference(id) {
  if (id.startsWith("relation/")) {
    return 1;
  }

  if (id.startsWith("way/")) {
    return 2;
  }

  return 3;
}

// Approximate point-to-point distance in kilometers for settlement deduplication.
function pointToPointDistanceKm(left, right) {
  const referenceLatitude = (left[1] + right[1]) / 2;
  const [lx, ly] = toKilometers(left, referenceLatitude);
  const [rx, ry] = toKilometers(right, referenceLatitude);
  return Math.hypot(lx - rx, ly - ry);
}

// Collapse duplicate settlement records that represent the same named place nearby.
function dedupeSettlements(features) {
  const grouped = new Map();

  for (const feature of features) {
    const key = `${feature.properties.nameUk}|${feature.properties.place}`;
    const group = grouped.get(key) ?? [];
    const existingIndex = group.findIndex((candidate) =>
      pointToPointDistanceKm(candidate.geometry.coordinates, feature.geometry.coordinates) <= 10,
    );

    if (existingIndex === -1) {
      group.push(feature);
      grouped.set(key, group);
      continue;
    }

    const existing = group[existingIndex];
    const currentPreference = settlementTypePreference(feature.properties.id);
    const existingPreference = settlementTypePreference(existing.properties.id);

    if (currentPreference < existingPreference) {
      group[existingIndex] = feature;
      continue;
    }

    if (
      currentPreference === existingPreference &&
      (feature.properties.population ?? 0) > (existing.properties.population ?? 0)
    ) {
      group[existingIndex] = feature;
    }
  }

  return [...grouped.values()].flat();
}

// Split the theater bbox into tiles so heavy Overpass polygon queries stay manageable.
function buildBboxGrid(bbox, columns, rows) {
  const boxes = [];
  const width = (bbox.east - bbox.west) / columns;
  const height = (bbox.north - bbox.south) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      boxes.push({
        west: bbox.west + width * column,
        east: bbox.west + width * (column + 1),
        south: bbox.south + height * row,
        north: bbox.south + height * (row + 1),
      });
    }
  }

  return boxes;
}

// Ensure polygon rings are explicitly closed before writing GeoJSON features.
function closeRing(coordinates) {
  if (coordinates.length === 0) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates;
  }

  return [...coordinates, first];
}

// Use bounding-box area as a cheap filter for tiny polygons that add size but little value.
function approximateBoundsAreaKm2(coordinates) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  const centerLatitude = (south + north) / 2;
  const widthKm = (east - west) * 111.32 * Math.cos((centerLatitude * Math.PI) / 180);
  const heightKm = (north - south) * 111.32;

  return Math.max(0, widthKm * heightKm);
}

// Thin large polygon rings by sampling vertices at a fixed interval.
function simplifyRing(coordinates, maxVertices) {
  if (coordinates.length <= maxVertices) {
    return coordinates;
  }

  const targetInteriorVertices = Math.max(2, maxVertices - 1);
  const step = Math.ceil((coordinates.length - 1) / targetInteriorVertices);
  const simplified = [coordinates[0]];

  for (let index = step; index < coordinates.length - 1; index += step) {
    simplified.push(coordinates[index]);
  }

  simplified.push(coordinates[coordinates.length - 1]);
  return simplified;
}

// Convert Overpass way geometries into simplified GeoJSON polygons with layer-specific properties.
function addOverpassWayFeatures(featuresById, elements, propertiesBuilder, options = {}) {
  const {
    minApproxAreaKm2 = 0,
    maxVertices = 160,
  } = options;

  for (const element of elements) {
    if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 3) {
      continue;
    }

    const coordinates = simplifyRing(closeRing(
      element.geometry.map((point) => [point.lon, point.lat]),
    ), maxVertices);

    if (coordinates.length < 4) {
      continue;
    }

    if (approximateBoundsAreaKm2(coordinates) < minApproxAreaKm2) {
      continue;
    }

    featuresById.set(String(element.id), {
      type: "Feature",
      properties: {
        id: `way/${element.id}`,
        ...propertiesBuilder(element.tags ?? {}),
      },
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    });
  }
}

// Fetch a tiled polygon layer from Overpass and merge deduplicated way features across tiles.
async function fetchTiledAreaLayer(layerId, selectors, propertiesBuilder, options) {
  const tiles = buildBboxGrid(theaterBbox, 3, 3);
  const featuresById = new Map();

  for (const [tileIndex, tile] of tiles.entries()) {
    const response = await fetchOverpassJsonWithFallback(
      [sources.terrainOverpassApi, sources.overpassFallbackApi, sources.overpassApi],
      overpassAreaQuery(selectors, tile),
      `overpass/${layerId}/tile-${tileIndex}`,
    );

    addOverpassWayFeatures(featuresById, response.elements ?? [], propertiesBuilder, options);
  }

  return {
    type: "FeatureCollection",
    features: [...featuresById.values()],
  };
}

// Convert raw Overpass settlement elements into filtered, deduplicated point GeoJSON.
function overpassElementsToGeoJson(elements, theaterBoundary) {
  const features = elements
    .map((element) => {
      const tags = element.tags ?? {};
      const longitude =
        typeof element.lon === "number"
          ? element.lon
          : typeof element.center?.lon === "number"
            ? element.center.lon
            : null;
      const latitude =
        typeof element.lat === "number"
          ? element.lat
          : typeof element.center?.lat === "number"
            ? element.center.lat
            : null;

      if (longitude === null || latitude === null) {
        return null;
      }

      const place = tags.place ?? "locality";
      const population = normalizePopulation(tags.population);
      const nameUk = tags["name:uk"] ?? tags.name ?? null;
      const nameEn = tags["name:en"] ?? null;

      if (!nameUk) {
        return null;
      }

      return {
        type: "Feature",
        properties: {
          id: `${element.type}/${element.id}`,
          name: tags.name ?? nameUk,
          nameUk,
          nameEn,
          place,
          population,
          labelRank: placeRank(place),
        },
        geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      };
    })
    .filter(Boolean)
    .filter((feature) =>
      theaterBoundary.features.some((boundaryFeature) =>
        pointInPolygonGeometry(feature.geometry.coordinates, boundaryFeature.geometry) ||
        pointWithinBorderBuffer(feature.geometry.coordinates, boundaryFeature.geometry, 200),
      ),
    );

  return {
    type: "FeatureCollection",
    features: sortSettlements(dedupeSettlements(features)),
  };
}

// Basic bbox intersection used for clipping public datasets to the theater extent.
function bboxIntersects(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

// Recursively accumulate geometry coordinates into an overall bounds object.
function accumulateCoordinates(coordinates, bounds) {
  if (!coordinates) {
    return;
  }

  if (!Array.isArray(coordinates)) {
    return;
  }

  for (const coordinate of coordinates) {
    if (Array.isArray(coordinate) && typeof coordinate[0] === "number") {
      const [longitude, latitude] = coordinate;
      bounds.west = Math.min(bounds.west, longitude);
      bounds.east = Math.max(bounds.east, longitude);
      bounds.south = Math.min(bounds.south, latitude);
      bounds.north = Math.max(bounds.north, latitude);
      continue;
    }

    accumulateCoordinates(coordinate, bounds);
  }
}

// Compute a simple bounding box for supported GeoJSON geometries.
function geometryBounds(geometry) {
  if (geometry.type === "Point") {
    const [longitude, latitude] = geometry.coordinates;
    return {
      west: longitude,
      south: latitude,
      east: longitude,
      north: latitude,
    };
  }

  const bounds = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };

  accumulateCoordinates(geometry.coordinates, bounds);
  return bounds;
}

// Remove public-source features that fall completely outside the theater bbox.
function filterFeatureCollectionToBbox(featureCollection, bbox) {
  return {
    type: "FeatureCollection",
    features: featureCollection.features.filter((feature) => {
      if (!feature.geometry) {
        return false;
      }

      return bboxIntersects(geometryBounds(feature.geometry), bbox);
    }),
  };
}

// Write processed GeoJSON outputs into the application-facing data directory.
async function writeGeoJson(relativePath, data) {
  const targetPath = path.join(processedRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
}

// Resolve the actual GeoBoundaries GeoJSON download URL from the metadata endpoint.
async function resolveGeoBoundariesDownload(apiUrl) {
  const metadata = await fetchJson(
    apiUrl,
    apiUrl.includes("/ADM0/") ? "geoboundaries/adm0-metadata" : "geoboundaries/adm1-metadata",
  );
  return metadata.simplifiedGeometryGeoJSON ?? metadata.gjDownloadURL;
}

// Print a read-only report of every known cache entry and its freshness metadata.
async function printCacheReport() {
  const entries = await Promise.all(getKnownCacheKeys().map((cacheKey) => describeCacheEntry(cacheKey)));

  console.log(`Cache schema version: ${cacheSchemaVersion}`);
  console.log(`Cache TTL: ${formatDuration(cacheTtlMs)}`);

  for (const entry of entries) {
    console.log(
      [
        entry.status.padEnd(15, " "),
        entry.cacheKey,
        `schema=${entry.version}`,
        `cachedAt=${entry.cachedAt}`,
        `ttlRemaining=${entry.ttlRemaining}`,
      ].join(" | "),
    );
  }
}

// Build all fallback public layers, or run a limited smoke test when requested.
async function main() {
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(layersRoot, { recursive: true });

  if (cacheReportMode) {
    await printCacheReport();
    return;
  }

  if (smokeTestMode === "static") {
    const [adm0Url, adm1Url] = await Promise.all([
      resolveGeoBoundariesDownload(sources.adm0Api),
      resolveGeoBoundariesDownload(sources.adm1Api),
    ]);

    await Promise.all([
      fetchJson(adm0Url, "geoboundaries/adm0-geometry"),
      fetchJson(adm1Url, "geoboundaries/adm1-geometry"),
      fetchJson(sources.rivers, "natural-earth/rivers"),
      fetchJson(sources.lakes, "natural-earth/lakes"),
      fetchJson(sources.seas, "natural-earth/seas"),
      fetchJson(sources.roads, "natural-earth/roads"),
      fetchJson(sources.railways, "natural-earth/railways"),
      fetchJson(sources.urbanAreas, "natural-earth/urban-areas"),
    ]);
    console.log("Smoke test completed for static public sources.");
    return;
  }

  if (smokeTestMode === "settlements") {
    await fetchOverpassJson(overpassPlaceQuery(theaterBbox));
    console.log("Smoke test completed for Overpass settlements.");
    return;
  }

  if (smokeTestMode === "wetlands") {
    await fetchTiledAreaLayer(
      "wetlands",
      ['["natural"="wetland"]', "[wetland]"],
      (tags) => ({
        type: tags.wetland ?? tags.natural ?? "wetland",
      }),
      {
        minApproxAreaKm2: 2,
        maxVertices: 32,
      },
    );
    console.log("Smoke test completed for Overpass wetlands.");
    return;
  }

  if (smokeTestMode === "forests") {
    await fetchTiledAreaLayer(
      "forests",
      ['["landuse"="forest"]', '["natural"="wood"]'],
      (tags) => ({
        type: tags.landuse === "forest" ? "forest" : "wood",
      }),
      {
        minApproxAreaKm2: 8,
        maxVertices: 36,
      },
    );
    console.log("Smoke test completed for Overpass forests.");
    return;
  }

  const [
    adm0Url,
    adm1Url,
  ] = await Promise.all([
    resolveGeoBoundariesDownload(sources.adm0Api),
    resolveGeoBoundariesDownload(sources.adm1Api),
  ]);

  const [
    theaterBoundary,
    oblastBoundaries,
    rivers,
    lakes,
    seas,
    roads,
    railways,
    urbanAreas,
  ] = await Promise.all([
    fetchJson(adm0Url, "geoboundaries/adm0-geometry"),
    fetchJson(adm1Url, "geoboundaries/adm1-geometry"),
    fetchJson(sources.rivers, "natural-earth/rivers"),
    fetchJson(sources.lakes, "natural-earth/lakes"),
    fetchJson(sources.seas, "natural-earth/seas"),
    fetchJson(sources.roads, "natural-earth/roads"),
    fetchJson(sources.railways, "natural-earth/railways"),
    fetchJson(sources.urbanAreas, "natural-earth/urban-areas"),
  ]);

  const settlements = await fetchOverpassJson(overpassPlaceQuery(theaterBbox));
  const forests = await fetchTiledAreaLayer(
    "forests",
    ['["landuse"="forest"]', '["natural"="wood"]'],
    (tags) => ({
      type: tags.landuse === "forest" ? "forest" : "wood",
    }),
    {
      minApproxAreaKm2: 8,
      maxVertices: 36,
    },
  );
  const wetlands = await fetchTiledAreaLayer(
    "wetlands",
    ['["natural"="wetland"]', "[wetland]"],
    (tags) => ({
      type: tags.wetland ?? tags.natural ?? "wetland",
    }),
    {
      minApproxAreaKm2: 2,
      maxVertices: 32,
    },
  );

  const filteredLayers = {
    "layers/theater-boundary.geojson": theaterBoundary,
    "layers/oblast-boundaries.geojson": oblastBoundaries,
    "layers/rivers.geojson": filterFeatureCollectionToBbox(rivers, theaterBbox),
    "layers/water-bodies.geojson": filterFeatureCollectionToBbox(lakes, theaterBbox),
    "layers/seas.geojson": filterFeatureCollectionToBbox(seas, theaterBbox),
    "layers/wetlands.geojson": wetlands,
    "layers/forests.geojson": forests,
    "layers/roads.geojson": filterFeatureCollectionToBbox(roads, theaterBbox),
    "layers/railways.geojson": filterFeatureCollectionToBbox(railways, theaterBbox),
    "layers/major-city-urban-areas.geojson": filterMajorCityUrbanAreas(
      filterFeatureCollectionToBbox(urbanAreas, theaterBbox),
    ),
    "layers/settlements.geojson": overpassElementsToGeoJson(
      settlements.elements ?? [],
      theaterBoundary,
    ),
  };

  for (const [relativePath, data] of Object.entries(filteredLayers)) {
    await writeGeoJson(relativePath, data);
  }

  await writeGeoJson("layers.json", {
    generatedAt: new Date().toISOString(),
    layers: [
      {
        id: "theater-boundary",
        label: "Theater Boundary",
        category: "reference",
        geometryKind: "polygon",
        path: "layers/theater-boundary.geojson",
      },
      {
        id: "oblast-boundaries",
        label: "Oblast Boundaries",
        category: "reference",
        geometryKind: "polygon",
        path: "layers/oblast-boundaries.geojson",
      },
      {
        id: "rivers",
        label: "Rivers",
        category: "hydrology",
        geometryKind: "line",
        path: "layers/rivers.geojson",
      },
      {
        id: "water-bodies",
        label: "Water Bodies",
        category: "hydrology",
        geometryKind: "polygon",
        path: "layers/water-bodies.geojson",
      },
      {
        id: "seas",
        label: "Seas",
        category: "hydrology",
        geometryKind: "polygon",
        path: "layers/seas.geojson",
      },
      {
        id: "wetlands",
        label: "Wetlands",
        category: "hydrology",
        geometryKind: "polygon",
        path: "layers/wetlands.geojson",
      },
      {
        id: "forests",
        label: "Forests",
        category: "terrain",
        geometryKind: "polygon",
        path: "layers/forests.geojson",
      },
      {
        id: "roads",
        label: "Roads",
        category: "transport",
        geometryKind: "line",
        path: "layers/roads.geojson",
      },
      {
        id: "railways",
        label: "Railways",
        category: "transport",
        geometryKind: "line",
        path: "layers/railways.geojson",
      },
      {
        id: "major-city-urban-areas",
        label: "Major City Urban Areas",
        category: "settlements",
        geometryKind: "polygon",
        path: "layers/major-city-urban-areas.geojson",
      },
      {
        id: "settlements",
        label: "Settlements",
        category: "settlements",
        geometryKind: "point",
        path: "layers/settlements.geojson",
      },
    ],
  });

  console.log("Wrote processed public fallback layers and layers.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
