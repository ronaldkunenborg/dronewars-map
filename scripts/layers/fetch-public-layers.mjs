import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const processedRoot = path.join(repoRoot, "data", "processed");
const layersRoot = path.join(processedRoot, "layers");

const theaterBbox = {
  west: 22.0,
  south: 44.0,
  east: 40.5,
  north: 52.5,
};

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
};

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchOverpassJson(query) {
  return fetchOverpassJsonWithFallback(
    [sources.overpassApi, sources.overpassFallbackApi, sources.terrainOverpassApi],
    query,
  );
}

async function fetchOverpassJsonFrom(url, query) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Overpass data from ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchOverpassJsonWithFallback(urls, query) {
  let lastError = null;

  for (const url of urls) {
    try {
      return await fetchOverpassJsonFrom(url, query);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to fetch Overpass data.");
}

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

function overpassAreaQuery(selectors, bbox) {
  return `
[out:json][timeout:90];
(
${selectors.map((selector) => `  way${selector}(${bbox.south},${bbox.west},${bbox.north},${bbox.east});`).join("\n")}
);
out tags geom;
`.trim();
}

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
      pointInPolygonGeometry(point, { type: "Polygon", coordinates: polygon }),
    );
  }

  return false;
}

function toKilometers(point, referenceLatitude) {
  const kmPerDegreeLatitude = 111.32;
  const kmPerDegreeLongitude = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180);

  return [
    point[0] * kmPerDegreeLongitude,
    point[1] * kmPerDegreeLatitude,
  ];
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
  let minDistance = Infinity;

  for (let index = 1; index < ring.length; index += 1) {
    minDistance = Math.min(
      minDistance,
      pointToSegmentDistanceKm(point, ring[index - 1], ring[index]),
    );
  }

  return minDistance;
}

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

function settlementTypePreference(id) {
  if (id.startsWith("relation/")) {
    return 1;
  }

  if (id.startsWith("way/")) {
    return 2;
  }

  return 3;
}

function pointToPointDistanceKm(left, right) {
  const referenceLatitude = (left[1] + right[1]) / 2;
  const [lx, ly] = toKilometers(left, referenceLatitude);
  const [rx, ry] = toKilometers(right, referenceLatitude);
  return Math.hypot(lx - rx, ly - ry);
}

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

async function fetchTiledAreaLayer(selectors, propertiesBuilder, options) {
  const tiles = buildBboxGrid(theaterBbox, 3, 3);
  const featuresById = new Map();

  for (const tile of tiles) {
    const response = await fetchOverpassJsonWithFallback(
      [sources.terrainOverpassApi, sources.overpassFallbackApi, sources.overpassApi],
      overpassAreaQuery(selectors, tile),
    );

    addOverpassWayFeatures(featuresById, response.elements ?? [], propertiesBuilder, options);
  }

  return {
    type: "FeatureCollection",
    features: [...featuresById.values()],
  };
}

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

      if (!nameUk) {
        return null;
      }

      return {
        type: "Feature",
        properties: {
          id: `${element.type}/${element.id}`,
          name: tags.name ?? nameUk,
          nameUk,
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

function bboxIntersects(a, b) {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}

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

async function writeGeoJson(relativePath, data) {
  const targetPath = path.join(processedRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");
}

async function resolveGeoBoundariesDownload(apiUrl) {
  const metadata = await fetchJson(apiUrl);
  return metadata.simplifiedGeometryGeoJSON ?? metadata.gjDownloadURL;
}

async function main() {
  await mkdir(layersRoot, { recursive: true });

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
  ] = await Promise.all([
    fetchJson(adm0Url),
    fetchJson(adm1Url),
    fetchJson(sources.rivers),
    fetchJson(sources.lakes),
    fetchJson(sources.seas),
    fetchJson(sources.roads),
    fetchJson(sources.railways),
  ]);

  const settlements = await fetchOverpassJson(overpassPlaceQuery(theaterBbox));
  const forests = await fetchTiledAreaLayer(
    ['["landuse"="forest"]', '["natural"="wood"]'],
    (tags) => ({
      type: tags.landuse === "forest" ? "forest" : "wood",
    }),
    {
      minApproxAreaKm2: 0.4,
      maxVertices: 120,
    },
  );
  const wetlands = await fetchTiledAreaLayer(
    ['["natural"="wetland"]', "[wetland]"],
    (tags) => ({
      type: tags.wetland ?? tags.natural ?? "wetland",
    }),
    {
      minApproxAreaKm2: 0.15,
      maxVertices: 140,
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
