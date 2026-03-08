import type { AddLayerObject, GeoJSONSourceSpecification, Map } from "maplibre-gl";

type OverlaySlotDefinition = {
  id:
    | "frontline"
    | "zones-of-control"
    | "artillery-range"
    | "logistics-route"
    | "force-placement";
  sourceId: string;
  buildSource: () => GeoJSONSourceSpecification;
  buildLayers: () => AddLayerObject[];
};

const overlaySlotDefinitions: OverlaySlotDefinition[] = [
  {
    id: "frontline",
    sourceId: "overlay-frontline",
    buildSource: () => ({
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    }),
    buildLayers: () => [
      {
        id: "overlay-frontline-line",
        type: "line",
        source: "overlay-frontline",
        layout: {
          visibility: "none",
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#9b453a",
          "line-width": 2.4,
          "line-opacity": 0.9,
        },
      },
    ],
  },
  {
    id: "zones-of-control",
    sourceId: "overlay-zones-of-control",
    buildSource: () => ({
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    }),
    buildLayers: () => [
      {
        id: "overlay-zones-of-control-fill",
        type: "fill",
        source: "overlay-zones-of-control",
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-color": "#d09461",
          "fill-opacity": 0.12,
        },
      },
    ],
  },
  {
    id: "artillery-range",
    sourceId: "overlay-artillery-range",
    buildSource: () => ({
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    }),
    buildLayers: () => [
      {
        id: "overlay-artillery-range-line",
        type: "line",
        source: "overlay-artillery-range",
        layout: {
          visibility: "none",
        },
        paint: {
          "line-color": "#ab6b4b",
          "line-width": 1.4,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
        },
      },
    ],
  },
  {
    id: "logistics-route",
    sourceId: "overlay-logistics-route",
    buildSource: () => ({
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    }),
    buildLayers: () => [
      {
        id: "overlay-logistics-route-line",
        type: "line",
        source: "overlay-logistics-route",
        layout: {
          visibility: "none",
          "line-join": "round",
        },
        paint: {
          "line-color": "#6f5f45",
          "line-width": 1.6,
          "line-opacity": 0.82,
        },
      },
    ],
  },
  {
    id: "force-placement",
    sourceId: "overlay-force-placement",
    buildSource: () => ({
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    }),
    buildLayers: () => [
      {
        id: "overlay-force-placement-circle",
        type: "circle",
        source: "overlay-force-placement",
        layout: {
          visibility: "none",
        },
        paint: {
          "circle-radius": 5,
          "circle-color": "#7e4f2d",
          "circle-opacity": 0.88,
          "circle-stroke-color": "#f0e7d4",
          "circle-stroke-width": 1,
        },
      },
    ],
  },
];

export function getOverlaySlotDefinitions() {
  return overlaySlotDefinitions;
}

export function mountOverlayManager(map: Map) {
  for (const slot of overlaySlotDefinitions) {
    if (!map.getSource(slot.sourceId)) {
      map.addSource(slot.sourceId, slot.buildSource());
    }

    for (const layer of slot.buildLayers()) {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
    }
  }
}
