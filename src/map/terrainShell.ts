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
import { mountOverlayManager } from "./overlayManager";

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

const worldCoverWmsUrl =
  "https://services.terrascope.be/wms/v2?service=WMS&version=1.1.1&request=GetMap&layers=WORLDCOVER_2021_MAP&styles=&format=image/png&transparent=true&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256";

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

function mountFallbackLandcoverLayer(map: Map) {
  if (!map.getSource("fallback-worldcover")) {
    map.addSource("fallback-worldcover", {
      type: "raster",
      tiles: [worldCoverWmsUrl],
      tileSize: 256,
      attribution: "© ESA WorldCover 2021",
    });
  }

  if (!map.getLayer("fallback-worldcover-raster")) {
    map.addLayer({
      id: "fallback-worldcover-raster",
      type: "raster",
      source: "fallback-worldcover",
      paint: {
        "raster-opacity": 0.34,
        "raster-saturation": -0.08,
        "raster-contrast": 0.06,
      },
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
          0.015,
          6,
          0.025,
          8,
          0.04,
          10,
          0.06,
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
          0.06,
          6,
          0.12,
          8,
          0.24,
          10,
          0.48,
          12,
          0.7,
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

  mountFallbackLandcoverLayer(map);

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
  mountOverlayManager(map);
}
