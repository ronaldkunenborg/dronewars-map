import type { GeoJSONSourceSpecification, Map, StyleSpecification } from "maplibre-gl";
import { appConfig, ukraineTheaterConfig } from "../config";
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

function addRasterImageSourceIfMissing(
  map: Map,
  sourceId: string,
  imagePath: string,
) {
  if (map.getSource(sourceId)) {
    return;
  }

  const { west, south, east, north } = ukraineTheaterConfig.extent;
  map.addSource(sourceId, {
    type: "image",
    url: imagePath,
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  });
}

function addRasterTileSourceIfMissing(
  map: Map,
  sourceId: string,
  tilePathTemplate: string,
) {
  if (map.getSource(sourceId)) {
    return;
  }

  map.addSource(sourceId, {
    type: "raster",
    tiles: [tilePathTemplate],
    tileSize: 1024,
  });
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
        "fill-color": [
          "case",
          ["==", ["coalesce", ["get", "dominantTerrain"], "open"], "sea"],
          "#5f8fb3",
          [">=", ["coalesce", ["get", "strongestPlaceScore"], 0], 4],
          "#9a6f66",
          ["==", ["coalesce", ["get", "dominantTerrain"], "open"], "wetland"],
          "#8a6f46",
          ["==", ["coalesce", ["get", "dominantTerrain"], "open"], "forest"],
          "#3f5c3a",
          "#8b8578",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.16,
          6,
          0.24,
          8,
          0.36,
          10,
          0.48,
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

function raiseSettlementLayers(map: Map) {
  for (const layerId of [
    "settlements-city-circle",
    "settlements-town-circle",
    "settlements-village-circle",
  ]) {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }

  if (map.getLayer("priority-city-star")) {
    map.moveLayer("priority-city-star");
  }

  for (const layerId of [
    "settlements-city-label",
    "settlements-town-label",
    "settlements-village-label",
  ]) {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  }
}

function raiseHillshadeLayer(map: Map) {
  if (map.getLayer("hillshade-raster")) {
    map.moveLayer("hillshade-raster");
  }
}

function mountManifestLayer(map: Map, layer: LayerManifest) {
  const sourceId = `processed-${layer.id}`;
  if (layer.id === "terrain-hillshade" && layer.geometryKind === "raster") {
    if (layer.sourcePath.includes("{z}/{x}/{y}")) {
      addRasterTileSourceIfMissing(map, sourceId, layer.sourcePath);
    } else {
      addRasterImageSourceIfMissing(map, sourceId, layer.sourcePath);
    }
  } else {
    addSourceIfMissing(map, sourceId, layer.sourcePath);
  }

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
  // Keep hillshade visible over terrain/hex fills while leaving labels above it.
  raiseHillshadeLayer(map);
  raiseSettlementLayers(map);
  mountOverlayManager(map);
}
