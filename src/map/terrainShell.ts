import type { GeoJSONSourceSpecification, Map, StyleSpecification } from "maplibre-gl";
import { appConfig } from "../config";
import type { LayerManifest } from "../data";
import type {
  HexEdgeGeoJson,
  HexPolygonGeoJson,
  ProcessedMapData,
} from "../data/loadProcessedData";
import {
  addOrderedLayerStack,
  getManifestLayerById,
  getOrderedLayerRegistry,
} from "./layerRegistry";

export const terrainShellStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": appConfig.backgroundColor,
      },
    },
  ],
};

function buildGeoJsonSource(data: string): GeoJSONSourceSpecification {
  return {
    type: "geojson",
    data,
  };
}

type SourceData = string | HexPolygonGeoJson | HexEdgeGeoJson;

function addSourceIfMissing(
  map: Map,
  sourceId: string,
  data: SourceData,
) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data,
    });
  }
}

function mountOperationalHexLayer(map: Map) {
  if (!map.getSource("operational-hexes")) {
    return;
  }

  if (!map.getLayer("operational-hex-fill")) {
    map.addLayer({
      id: "operational-hex-fill",
      type: "fill",
      source: "operational-hexes",
      paint: {
        "fill-color": "#6e7664",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.02,
          6,
          0.035,
          8,
          0.05,
          10,
          0.075,
        ],
      },
    });
  }

  if (!map.getLayer("operational-hex-outline")) {
    map.addLayer({
      id: "operational-hex-outline",
      type: "line",
      source: "operational-hex-edges",
      layout: {
        "line-join": "round",
      },
      paint: {
        "line-color": "#53604f",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.08,
          6,
          0.14,
          8,
          0.3,
          10,
          0.55,
          12,
          0.78,
        ],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.2,
          6,
          0.35,
          8,
          0.7,
          10,
          1.05,
          12,
          1.4,
        ],
      },
    });
  }
}

function mountManifestLayer(map: Map, layer: LayerManifest) {
  const sourceId = `processed-${layer.id}`;
  addSourceIfMissing(map, sourceId, layer.sourcePath);

  const definition = getOrderedLayerRegistry().find((entry) => entry.id === layer.id);

  if (!definition) {
    return;
  }

  addOrderedLayerStack(map, definition.build(sourceId));
}

export function mountTerrainShell(
  map: Map,
  processedData: ProcessedMapData,
) {
  const { layers, hexSourceUrl, hexGeoJson, hexEdgeGeoJson } = processedData;
  const orderedRegistry = getOrderedLayerRegistry();

  for (const definition of orderedRegistry) {
    if (definition.id === "terrain-wash") {
      addOrderedLayerStack(map, definition.build(""));
      continue;
    }

    const layer = getManifestLayerById(layers, definition.id);

    if (layer) {
      mountManifestLayer(map, layer);
    }
  }

  addSourceIfMissing(map, "operational-hexes", hexGeoJson ?? hexSourceUrl);
  addSourceIfMissing(
    map,
    "operational-hex-edges",
    hexEdgeGeoJson ?? {
      type: "FeatureCollection",
      features: [],
    },
  );
  mountOperationalHexLayer(map);
}
