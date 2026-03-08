import type { AddLayerObject, Map } from "maplibre-gl";
import type { LayerManifest } from "../data";

type OrderedLayerDefinition = {
  id: string;
  sourceLayerId: string;
  build: (sourceId: string) => AddLayerObject[];
};

export const mapLayerVisibilityTargets = {
  water: ["water-bodies-fill", "rivers-line"],
  wetlands: ["wetlands-fill"],
  forests: ["forests-fill"],
  roads: ["roads-line"],
  railways: ["railways-line"],
  settlements: ["settlements-circle", "settlements-label"],
  oblasts: ["oblast-boundaries-line", "theater-boundary-line"],
  hexes: ["operational-hex-fill", "operational-hex-outline"],
  contours: [],
  hillshade: [],
} as const;

const orderedLayerRegistry: OrderedLayerDefinition[] = [
  {
    id: "terrain-wash",
    sourceLayerId: "terrain-wash",
    build: () => [
      {
        id: "terrain-wash",
        type: "background",
        paint: {
          "background-color": "#d7decb",
        },
      },
    ],
  },
  {
    id: "water-bodies",
    sourceLayerId: "water-bodies",
    build: (sourceId) => [
      {
        id: "water-bodies-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#88a8c1",
          "fill-opacity": 0.84,
        },
      },
    ],
  },
  {
    id: "wetlands",
    sourceLayerId: "wetlands",
    build: (sourceId) => [
      {
        id: "wetlands-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#8ca88f",
          "fill-opacity": 0.35,
        },
      },
    ],
  },
  {
    id: "forests",
    sourceLayerId: "forests",
    build: (sourceId) => [
      {
        id: "forests-fill",
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#7d9470",
          "fill-opacity": 0.44,
        },
      },
    ],
  },
  {
    id: "rivers",
    sourceLayerId: "rivers",
    build: (sourceId) => [
      {
        id: "rivers-line",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#6788aa",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.8,
            8,
            2.1,
            11,
            3.1,
          ],
          "line-opacity": 0.94,
        },
      },
    ],
  },
  {
    id: "roads",
    sourceLayerId: "roads",
    build: (sourceId) => [
      {
        id: "roads-line",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#a08359",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.3,
            8,
            0.9,
            11,
            1.9,
          ],
          "line-opacity": 0.46,
        },
      },
    ],
  },
  {
    id: "railways",
    sourceLayerId: "railways",
    build: (sourceId) => [
      {
        id: "railways-line",
        type: "line",
        source: sourceId,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#5d6358",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.4,
            8,
            1,
            11,
            1.5,
          ],
          "line-dasharray": [3, 2],
          "line-opacity": 0.62,
        },
      },
    ],
  },
  {
    id: "settlements",
    sourceLayerId: "settlements",
    build: (sourceId) => [
      {
        id: "settlements-circle",
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            1,
            8,
            2.5,
            11,
            4,
          ],
          "circle-color": "#5a4d3f",
          "circle-opacity": 0.74,
          "circle-stroke-color": "#ece6d8",
          "circle-stroke-width": 0.4,
        },
      },
      {
        id: "settlements-label",
        type: "symbol",
        source: sourceId,
        minzoom: 5,
        layout: {
          "text-field": ["coalesce", ["get", "nameUk"], ["get", "name"]],
          "text-font": ["Open Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            10,
            6,
            11,
            8,
            12,
            10,
            13,
          ],
          "text-offset": [0, 0.9],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "symbol-sort-key": ["coalesce", ["get", "labelRank"], 10],
        },
        filter: ["<=", ["coalesce", ["get", "labelRank"], 10], 4],
        paint: {
          "text-color": "#2f362c",
          "text-halo-color": "rgba(241, 238, 226, 0.96)",
          "text-halo-width": 1.2,
        },
      },
    ],
  },
  {
    id: "theater-boundary",
    sourceLayerId: "theater-boundary",
    build: (sourceId) => [
      {
        id: "theater-boundary-line",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#404b3f",
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      },
    ],
  },
  {
    id: "oblast-boundaries",
    sourceLayerId: "oblast-boundaries",
    build: (sourceId) => [
      {
        id: "oblast-boundaries-line",
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#73796d",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.4,
            8,
            0.85,
          ],
          "line-dasharray": [2, 2],
          "line-opacity": 0.58,
        },
      },
    ],
  },
];

export function getOrderedLayerRegistry() {
  return orderedLayerRegistry;
}

export function getManifestLayerById(layers: LayerManifest[], id: string) {
  return layers.find((entry) => entry.id === id);
}

export function addOrderedLayerStack(
  map: Map,
  orderedLayers: AddLayerObject[],
) {
  for (const layer of orderedLayers) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  }
}
