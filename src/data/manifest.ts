import type { LayerManifest } from "./types";

export const scaffoldLayers: LayerManifest[] = [
  {
    id: "terrain",
    label: "Terrain",
    description: "Basemap relief and landform styling placeholder.",
    geometryKind: "raster",
    sourcePath: "/data/processed/terrain.json",
    visibleByDefault: true,
    color: "#8b9a6d",
    group: "terrain",
  },
  {
    id: "hydrology",
    label: "Hydrology",
    description: "Rivers, lakes, and wetlands scaffold.",
    geometryKind: "polygon",
    sourcePath: "/data/processed/hydrology.geojson",
    visibleByDefault: true,
    color: "#6b8fb8",
    group: "hydrology",
  },
  {
    id: "transport",
    label: "Transport",
    description: "Road and railway layer placeholder.",
    geometryKind: "line",
    sourcePath: "/data/processed/transport.geojson",
    visibleByDefault: true,
    color: "#b8864b",
    group: "transport",
  },
  {
    id: "hexes",
    label: "Operational Cells",
    description: "Hex overlay scaffold for future simulation units.",
    geometryKind: "polygon",
    sourcePath: "/data/processed/hex-cells.geojson",
    visibleByDefault: true,
    color: "#64705f",
    group: "operational",
  },
];
