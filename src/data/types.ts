export type LngLat = [number, number];

export type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type AggregationLevel =
  | "theater"
  | "oblast"
  | "operational-sector"
  | "hex-cell";

export type GeometryKind = "polygon" | "line" | "point" | "raster";

export type OverlayKind =
  | "frontline"
  | "zones-of-control"
  | "artillery-range"
  | "logistics-route"
  | "force-placement"
  | "custom";

export type TerrainSummary = {
  dominantTerrain: string;
  forestCoverage: number;
  wetlandCoverage: number;
  openTerrainCoverage: number;
  waterBarrierPresence: boolean;
  elevationRoughness: number;
};

export type InfrastructureSummary = {
  roadDensity: number;
  railPresence: boolean;
  settlementScore: number;
};

export type CapacityScores = {
  baseCapacity: number;
  effectiveCapacity: number;
  mobilityScore: number;
  defensibilityScore: number;
};

export type HexCell = {
  id: string;
  aggregationLevel: "hex-cell";
  centroid: LngLat;
  parentRegionId: string;
  parentRegionName: string;
  areaKm2: number;
  terrainSummary: TerrainSummary;
  infrastructureSummary: InfrastructureSummary;
  capacity: CapacityScores;
  assignedForceCount: number;
  adjacencyIds: string[];
};

export type ReferenceRegion = {
  id: string;
  aggregationLevel: "oblast" | "operational-sector";
  name: string;
  parentRegionId: string | null;
  parentRegionName: string | null;
  centroid: LngLat;
  bounds: BoundingBox;
  childCellIds: string[];
};

export type TerrainLayerDefinition = {
  id: string;
  label: string;
  description: string;
  geometryKind: GeometryKind;
  sourcePath: string;
  visibleByDefault: boolean;
  color: string;
};

export type LayerManifest = TerrainLayerDefinition & {
  group: "terrain" | "hydrology" | "transport" | "reference" | "operational";
};

export type OverlayDefinition = {
  id: string;
  kind: OverlayKind;
  label: string;
  description: string;
  geometryKind: GeometryKind;
  sourcePath?: string;
};

export type ProcessedDataCatalog = {
  theaterBoundaryPath: string;
  regionBoundaryPath: string;
  hexCellPath: string;
  terrainLayers: TerrainLayerDefinition[];
  overlaySlots: OverlayDefinition[];
};

