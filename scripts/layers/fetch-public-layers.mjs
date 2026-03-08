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
  rivers:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
  lakes:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
  roads:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson",
  railways:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson",
  settlements:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson",
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
    roads,
    railways,
    settlements,
  ] = await Promise.all([
    fetchJson(adm0Url),
    fetchJson(adm1Url),
    fetchJson(sources.rivers),
    fetchJson(sources.lakes),
    fetchJson(sources.roads),
    fetchJson(sources.railways),
    fetchJson(sources.settlements),
  ]);

  const filteredLayers = {
    "layers/theater-boundary.geojson": theaterBoundary,
    "layers/oblast-boundaries.geojson": oblastBoundaries,
    "layers/rivers.geojson": filterFeatureCollectionToBbox(rivers, theaterBbox),
    "layers/water-bodies.geojson": filterFeatureCollectionToBbox(lakes, theaterBbox),
    "layers/wetlands.geojson": emptyFeatureCollection(),
    "layers/forests.geojson": emptyFeatureCollection(),
    "layers/roads.geojson": filterFeatureCollectionToBbox(roads, theaterBbox),
    "layers/railways.geojson": filterFeatureCollectionToBbox(railways, theaterBbox),
    "layers/settlements.geojson": filterFeatureCollectionToBbox(settlements, theaterBbox),
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
