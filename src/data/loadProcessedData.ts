import { dataPaths } from "../config";
import type { LayerManifest } from "./types";

type Position = [number, number];

type GeoJsonPolygonFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon";
    coordinates: Position[][];
  };
};

type GeoJsonLineFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString";
    coordinates: Position[];
  };
};

type GeoJsonFeatureCollection<TFeature> = {
  type: "FeatureCollection";
  features: TFeature[];
};

export type HexPolygonGeoJson = GeoJsonFeatureCollection<GeoJsonPolygonFeature>;
export type HexEdgeGeoJson = GeoJsonFeatureCollection<GeoJsonLineFeature>;

export type ProcessedMapData = {
  layers: LayerManifest[];
  hexSourceUrl: string;
  hexGeoJson?: HexPolygonGeoJson;
  hexEdgeGeoJson?: HexEdgeGeoJson;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

type LayerCatalogResponse = {
  generatedAt: string;
  layers: Array<{
    id: string;
    label: string;
    category: LayerManifest["group"];
    geometryKind: LayerManifest["geometryKind"];
    path: string;
  }>;
};

function edgeKey(from: Position, to: Position) {
  const left = `${from[0].toFixed(8)},${from[1].toFixed(8)}`;
  const right = `${to[0].toFixed(8)},${to[1].toFixed(8)}`;
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function buildHexEdgeGeoJson(
  hexGeoJson: HexPolygonGeoJson,
): HexEdgeGeoJson {
  const uniqueEdges = new Map<string, GeoJsonLineFeature>();

  for (const feature of hexGeoJson.features) {
    const ring = feature.geometry.coordinates[0];

    for (let index = 1; index < ring.length; index += 1) {
      const from = ring[index - 1];
      const to = ring[index];
      const key = edgeKey(from, to);

      if (!uniqueEdges.has(key)) {
        uniqueEdges.set(key, {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [from, to],
          },
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features: [...uniqueEdges.values()],
  };
}

export async function loadProcessedMapData(): Promise<ProcessedMapData> {
  const catalog = await fetchJson<LayerCatalogResponse>(dataPaths.manifests.layers);
  const hexGeoJson = await fetchJson<HexPolygonGeoJson>(dataPaths.manifests.hexes);

  const layers: LayerManifest[] = catalog.layers.map((entry) => ({
    id: entry.id,
    label: entry.label,
    description: `${entry.label} local processed layer`,
    group: entry.category,
    geometryKind: entry.geometryKind,
    sourcePath: `${dataPaths.clientProcessedBase}/${entry.path}`,
    visibleByDefault: true,
    color: "#7c8a71",
  }));

  return {
    layers,
    hexSourceUrl: dataPaths.manifests.hexes,
    hexGeoJson,
    hexEdgeGeoJson: buildHexEdgeGeoJson(hexGeoJson),
  };
}

export async function loadHexOnlyProcessedData(): Promise<ProcessedMapData> {
  const hexGeoJson = await fetchJson<HexPolygonGeoJson>(dataPaths.manifests.hexes);

  return {
    layers: [],
    hexSourceUrl: dataPaths.manifests.hexes,
    hexGeoJson,
    hexEdgeGeoJson: buildHexEdgeGeoJson(hexGeoJson),
  };
}
