import { useDeferredValue, useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  MapGeoJSONFeature,
  GeoJSONSource,
} from "maplibre-gl";
import { HexInspector, type HexInspectorData } from "../components/HexInspector";
import {
  type HexPolygonGeoJson,
  loadHexOnlyProcessedData,
  loadProcessedMapData,
  type ProcessedMapData,
} from "../data/loadProcessedData";
import type {
  CellLayerMode,
  LayerVisibility,
  SettlementDisplayLevel,
} from "../components/LayerPanel";
import { appConfig, ukraineTheaterConfig } from "../config";
import { createBaseMap } from "./createMap";
import { mapLayerVisibilityTargets } from "./layerRegistry";

type HexDebugInfo = {
  hexId: string;
  trueCenterLngLat: [number, number] | null;
  trueCenterPixels: [number, number] | null;
  clickLngLat: [number, number];
  clickPixels: [number, number];
  deltaTrueCenterPixels: [number, number] | null;
  clickToTrueCenterKm: number | null;
};

type JsonObject = Record<string, unknown>;
type Point = [number, number];
type SettlementSearchEntry = {
  id: string;
  nameUk: string;
  nameEn: string | null;
  place: string;
  population: number | null;
  coordinates: Point;
};

const riverGapChecklistReportPath = "reports/river-water-gap-checklist.json";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(from: [number, number], to: [number, number]) {
  const earthRadiusKm = 6371.0088;
  const deltaLatitude = toRadians(to[1] - from[1]);
  const deltaLongitude = toRadians(to[0] - from[0]);
  const latitude1 = toRadians(from[1]);
  const latitude2 = toRadians(to[1]);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function parseCentroid(value: unknown): [number, number] | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseCentroid(parsed);
    } catch {
      return null;
    }
  }

  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [value[0], value[1]];
  }

  return null;
}

function parseJsonObject<T extends JsonObject>(value: unknown): T | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonObject<T>(parsed);
    } catch {
      return null;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function parseString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function settlementLabel(entry: SettlementSearchEntry) {
  return entry.nameEn ? `${entry.nameUk} (${entry.nameEn})` : entry.nameUk;
}

function geometryCentroid(feature: MapGeoJSONFeature): [number, number] | null {
  const geometry = feature.geometry;

  if (!geometry || geometry.type !== "Polygon") {
    return null;
  }

  const ring = geometry.coordinates[0];

  if (!ring || ring.length < 4) {
    return null;
  }

  const points = ring.slice(0, -1);
  const longitude =
    points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude =
    points.reduce((sum, point) => sum + point[1], 0) / points.length;

  return [longitude, latitude];
}

function pointInRing(point: Point, ring: Point[]) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
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

function pointInPolygonFeature(
  point: Point,
  feature: HexPolygonGeoJson["features"][number],
) {
  const ring = feature.geometry.coordinates[0];
  return pointInRing(point, ring);
}

async function loadSettlementSearchEntries(processedData: ProcessedMapData) {
  const settlementsLayer = processedData.layers.find((layer) => layer.id === "settlements");

  if (!settlementsLayer) {
    return [];
  }

  const response = await fetch(settlementsLayer.sourcePath, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${settlementsLayer.sourcePath}: ${response.status}`);
  }

  const geojson = (await response.json()) as {
    features?: Array<{
      geometry?: {
        type?: string;
        coordinates?: unknown;
      };
      properties?: Record<string, unknown>;
    }>;
  };

  return (geojson.features ?? [])
    .filter((feature) => feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates))
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates as unknown[];
      const nameUk = parseString(feature.properties?.nameUk) ?? parseString(feature.properties?.name) ?? "";

      return {
        id: parseString(feature.properties?.id) ?? `${nameUk}-${coordinates.join(",")}`,
        nameUk,
        nameEn: parseString(feature.properties?.nameEn),
        place: parseString(feature.properties?.place) ?? "settlement",
        population: parseNumber(feature.properties?.population),
        coordinates: [Number(coordinates[0]), Number(coordinates[1])] as Point,
      } satisfies SettlementSearchEntry;
    })
    .filter((entry) => entry.nameUk !== "");
}

type MapViewProps = {
  cellLayerMode: CellLayerMode;
  layerVisibility: LayerVisibility;
  settlementDisplayLevel: SettlementDisplayLevel;
  onCoordinateChange: (value: string | null) => void;
  onZoomChange: (value: string | null) => void;
  resetToken: number;
};

function setLayerVisibility(
  map: MapLibreMap,
  layerIds: string[],
  visibility: "visible" | "none",
) {
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

function applyOperationalCellLayerMode(
  map: MapLibreMap,
  cellsVisible: boolean,
  cellLayerMode: CellLayerMode,
) {
  setLayerVisibility(
    map,
    ["operational-hex-fill", "operational-hex-outline"],
    cellsVisible && cellLayerMode === "hexes" ? "visible" : "none",
  );
  setLayerVisibility(
    map,
    ["settlement-voronoi-fill", "settlement-voronoi-outline"],
    cellsVisible && cellLayerMode === "voronoi" ? "visible" : "none",
  );
}

function applySettlementDisplayLevel(
  map: MapLibreMap,
  settlementsVisible: boolean,
  settlementDisplayLevel: SettlementDisplayLevel,
) {
  const showCities = settlementsVisible;
  const showTowns = settlementsVisible && settlementDisplayLevel !== "cities";
  const showVillages = settlementsVisible && settlementDisplayLevel === "villages";

  setLayerVisibility(
    map,
    ["major-city-urban-fill", "priority-city-star", "settlements-city-circle", "settlements-city-label"],
    showCities ? "visible" : "none",
  );
  setLayerVisibility(
    map,
    ["settlements-town-circle", "settlements-town-label"],
    showTowns ? "visible" : "none",
  );
  setLayerVisibility(
    map,
    ["settlements-village-circle", "settlements-village-label"],
    showVillages ? "visible" : "none",
  );
}

function ensureSelectedHexLayers(map: MapLibreMap) {
  if (!map.getSource("selected-hex")) {
    map.addSource("selected-hex", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  if (!map.getLayer("selected-hex-fill")) {
    map.addLayer({
      id: "selected-hex-fill",
      type: "fill",
      source: "selected-hex",
      paint: {
        "fill-color": "#ffe457",
        "fill-opacity": 0.08,
      },
    });
  }

  if (!map.getLayer("selected-hex-outline")) {
    map.addLayer({
      id: "selected-hex-outline",
      type: "line",
      source: "selected-hex",
      paint: {
        "line-color": "#ffe457",
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          2.2,
          8,
          3.6,
          12,
          5.2,
        ],
      },
    });
  }
}

function clearSelectedHex(map: MapLibreMap) {
  const source = map.getSource("selected-hex") as GeoJSONSource | undefined;

  source?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function setSelectedHexFeature(map: MapLibreMap, feature: MapGeoJSONFeature) {
  const source = map.getSource("selected-hex") as GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: [feature],
  });
}

function ensureSearchResultHexLayers(map: MapLibreMap) {
  if (!map.getSource("search-result-hex")) {
    map.addSource("search-result-hex", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  if (!map.getLayer("search-result-hex-outline")) {
    map.addLayer({
      id: "search-result-hex-outline",
      type: "line",
      source: "search-result-hex",
      paint: {
        "line-color": "#d8b24f",
        "line-opacity": 0.98,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          1.2,
          8,
          2.2,
          12,
          3.6,
        ],
      },
    });
  }
}

function clearSearchResultHex(map: MapLibreMap) {
  const source = map.getSource("search-result-hex") as GeoJSONSource | undefined;

  source?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function setSearchResultHexFeature(
  map: MapLibreMap,
  feature: HexPolygonGeoJson["features"][number],
) {
  const source = map.getSource("search-result-hex") as GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: [feature],
  });
}

async function loadRiverGapHexIds() {
  const response = await fetch(riverGapChecklistReportPath, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${riverGapChecklistReportPath}: ${response.status}`);
  }

  const report = (await response.json()) as {
    flaggedHexes?: Array<{
      hexId?: unknown;
    }>;
  };

  return new Set(
    (report.flaggedHexes ?? [])
      .map((entry) => (typeof entry.hexId === "string" ? entry.hexId : null))
      .filter((value): value is string => value !== null),
  );
}

function ensureRiverGapHexLayers(map: MapLibreMap) {
  if (!map.getSource("river-gap-hexes")) {
    map.addSource("river-gap-hexes", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  if (!map.getLayer("river-gap-hex-outline")) {
    map.addLayer({
      id: "river-gap-hex-outline",
      type: "line",
      source: "river-gap-hexes",
      paint: {
        "line-color": "#d62828",
        "line-opacity": 0.96,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          1.6,
          8,
          2.8,
          11,
          4.2,
        ],
      },
    });
  }
}

function setRiverGapHexFeatures(map: MapLibreMap, hexFeatures: HexPolygonGeoJson["features"]) {
  const source = map.getSource("river-gap-hexes") as GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData({
    type: "FeatureCollection",
    features: hexFeatures,
  });
}

async function populateRiverGapHexOverlay(
  map: MapLibreMap,
  hexGeoJson: HexPolygonGeoJson | null,
) {
  if (!hexGeoJson) {
    setRiverGapHexFeatures(map, []);
    return;
  }

  try {
    const flaggedHexIds = await loadRiverGapHexIds();
    const flaggedHexFeatures = hexGeoJson.features.filter((feature) =>
      flaggedHexIds.has(String(feature.properties?.id ?? "")),
    );
    setRiverGapHexFeatures(map, flaggedHexFeatures);
  } catch {
    setRiverGapHexFeatures(map, []);
  }
}

function buildHexInspectorData(feature: MapGeoJSONFeature): HexInspectorData {
  const terrainSummary = parseJsonObject<{
    dominantTerrain?: unknown;
    seaCoverage?: unknown;
    forestCoverage?: unknown;
    wetlandCoverage?: unknown;
    openTerrainCoverage?: unknown;
    waterBarrierPresence?: unknown;
    elevationRoughness?: unknown;
  }>(feature.properties?.terrainSummary);

  const infrastructureSummary = parseJsonObject<{
    roadDensity?: unknown;
    railPresence?: unknown;
    settlementScore?: unknown;
    strongestPlaceScore?: unknown;
  }>(feature.properties?.infrastructureSummary);

  return {
    hexId: parseString(feature.properties?.id) ?? "unknown",
    parentRegionName: parseString(feature.properties?.parentRegionName) ?? "unassigned",
    areaKm2: parseNumber(feature.properties?.areaKm2),
    centroidLngLat:
      parseCentroid(feature.properties?.centroid) ?? geometryCentroid(feature),
    trueCenterLngLat: parseCentroid(feature.properties?.centerLngLat),
    terrainSummary: terrainSummary
      ? {
          dominantTerrain: parseString(terrainSummary.dominantTerrain) ?? "n/a",
          seaCoverage: parseNumber(terrainSummary.seaCoverage),
          forestCoverage: parseNumber(terrainSummary.forestCoverage),
          wetlandCoverage: parseNumber(terrainSummary.wetlandCoverage),
          openTerrainCoverage: parseNumber(terrainSummary.openTerrainCoverage),
          waterBarrierPresence: parseBoolean(terrainSummary.waterBarrierPresence),
          elevationRoughness: parseNumber(terrainSummary.elevationRoughness),
        }
      : null,
    infrastructureSummary: infrastructureSummary
      ? {
          roadDensity: parseNumber(infrastructureSummary.roadDensity),
          railPresence: parseBoolean(infrastructureSummary.railPresence),
          settlementScore: parseNumber(infrastructureSummary.settlementScore),
          strongestPlaceScore: parseNumber(infrastructureSummary.strongestPlaceScore),
        }
      : null,
    baseCapacity: parseNumber(feature.properties?.baseCapacity),
    effectiveCapacity: parseNumber(feature.properties?.effectiveCapacity),
    assignedForceCount: parseNumber(feature.properties?.assignedForceCount),
    mobilityScore: parseNumber(feature.properties?.mobilityScore),
    defensibilityScore: parseNumber(feature.properties?.defensibilityScore),
  };
}

function applyLayerVisibility(map: MapLibreMap, visibility: LayerVisibility) {
  for (const [logicalId, layerIds] of Object.entries(mapLayerVisibilityTargets)) {
    const desiredVisibility = visibility[logicalId as keyof LayerVisibility] ? "visible" : "none";

    for (const layerId of layerIds) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", desiredVisibility);
      }
    }
  }
}

export function MapView({
  cellLayerMode,
  layerVisibility,
  settlementDisplayLevel,
  onCoordinateChange,
  onZoomChange,
  resetToken,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hexGeoJsonRef = useRef<HexPolygonGeoJson | null>(null);
  const settlementsRef = useRef<SettlementSearchEntry[]>([]);
  const [status, setStatus] = useState("Loading local processed map data.");
  const [datasetInfo, setDatasetInfo] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<HexDebugInfo | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexInspectorData | null>(null);
  const [hoveredHexId, setHoveredHexId] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [detailedVisible, setDetailedVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<SettlementSearchEntry[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>("Loading settlements for search.");

  useEffect(() => {
    const normalizedQuery = normalizeSearchText(deferredSearchQuery);

    if (normalizedQuery === "") {
      setSearchResults([]);
      setSearchMessage(
        settlementsRef.current.length > 0
          ? "Search for a city, town, or village."
          : "Loading settlements for search.",
      );
      return;
    }

    const rankedResults = settlementsRef.current
      .map((entry) => {
        const uk = normalizeSearchText(entry.nameUk);
        const en = entry.nameEn ? normalizeSearchText(entry.nameEn) : "";
        const label = normalizeSearchText(settlementLabel(entry));
        const exactMatch =
          uk === normalizedQuery || en === normalizedQuery || label === normalizedQuery;
        const prefixMatch =
          uk.startsWith(normalizedQuery) ||
          en.startsWith(normalizedQuery) ||
          label.startsWith(normalizedQuery);
        const containsMatch =
          uk.includes(normalizedQuery) ||
          en.includes(normalizedQuery) ||
          label.includes(normalizedQuery);

        if (!containsMatch) {
          return null;
        }

        return {
          entry,
          exactMatch,
          prefixMatch,
        };
      })
      .filter((result): result is { entry: SettlementSearchEntry; exactMatch: boolean; prefixMatch: boolean } => result !== null)
      .sort((left, right) => {
        if (left.exactMatch !== right.exactMatch) {
          return left.exactMatch ? -1 : 1;
        }

        if (left.prefixMatch !== right.prefixMatch) {
          return left.prefixMatch ? -1 : 1;
        }

        const populationDelta = (right.entry.population ?? 0) - (left.entry.population ?? 0);

        if (populationDelta !== 0) {
          return populationDelta;
        }

        return settlementLabel(left.entry).localeCompare(settlementLabel(right.entry), "uk");
      })
      .slice(0, 12)
      .map((result) => result.entry);

    setSearchResults(rankedResults);
    setSearchMessage(
      rankedResults.length > 0
        ? null
        : `No settlements matched "${deferredSearchQuery.trim()}".`,
    );
  }, [deferredSearchQuery]);

  function focusSettlement(entry: SettlementSearchEntry) {
    const map = mapRef.current;
    const hexGeoJson = hexGeoJsonRef.current;

    if (!map || !hexGeoJson) {
      return;
    }

  const containingHex = hexGeoJson.features.find((feature: HexPolygonGeoJson["features"][number]) =>
      pointInPolygonFeature(entry.coordinates, feature),
    );

    if (!containingHex) {
      clearSearchResultHex(map);
      map.flyTo({
        center: entry.coordinates,
        zoom: Math.max(map.getZoom(), 9),
        essential: true,
      });
      setSearchQuery(settlementLabel(entry));
      setSearchMessage(`Centered on ${settlementLabel(entry)}.`);
      return;
    }

    setSearchResultHexFeature(map, containingHex);
    map.flyTo({
      center: entry.coordinates,
      zoom: Math.max(map.getZoom(), 9),
      essential: true,
    });
    setSelectedHexFeature(map, containingHex as unknown as MapGeoJSONFeature);
    setSelectedHex(buildHexInspectorData(containingHex as unknown as MapGeoJSONFeature));
    setDebugInfo(null);
    setSearchQuery(settlementLabel(entry));
    setSearchMessage(`Centered on ${settlementLabel(entry)} in ${containingHex.properties.id}.`);
  }

  function attachHexDebugHandler(map: MapLibreMap) {
    ensureSelectedHexLayers(map);

    const handleClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: ["operational-hex-fill"],
      })[0] as MapGeoJSONFeature | undefined;

      if (!feature) {
        setDebugInfo(null);
        setSelectedHex(null);
        clearSelectedHex(map);
        return;
      }

      const centroid =
        parseCentroid(feature.properties?.centroid) ?? geometryCentroid(feature);
      const trueCenter = parseCentroid(feature.properties?.centerLngLat);
      const hexId =
        typeof feature.properties?.id === "string"
          ? feature.properties.id
          : "unknown";

      if (!centroid) {
        setDebugInfo(null);
        return;
      }

      const centroidPoint = map.project({
        lng: centroid[0],
        lat: centroid[1],
      });
      const trueCenterPoint = trueCenter
        ? map.project({
            lng: trueCenter[0],
            lat: trueCenter[1],
          })
        : null;

      const clickLngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      const clickPixels: [number, number] = [event.point.x, event.point.y];
      const centroidPixels: [number, number] = [centroidPoint.x, centroidPoint.y];
      const trueCenterPixels: [number, number] | null = trueCenterPoint
        ? [trueCenterPoint.x, trueCenterPoint.y]
        : null;

      setSelectedHexFeature(map, feature);
      setSelectedHex(buildHexInspectorData(feature));
      setDebugInfo({
        hexId,
        trueCenterLngLat: trueCenter,
        trueCenterPixels,
        clickLngLat,
        clickPixels,
        deltaTrueCenterPixels: trueCenterPixels
          ? [
              clickPixels[0] - trueCenterPixels[0],
              clickPixels[1] - trueCenterPixels[1],
            ]
          : null,
        clickToTrueCenterKm: trueCenter
          ? haversineKm(clickLngLat, trueCenter)
          : null,
      });
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: ["operational-hex-fill"],
      })[0] as MapGeoJSONFeature | undefined;
      const hasFeature = Boolean(feature);
      const nextHoveredHexId =
        typeof feature?.properties?.id === "string" ? feature.properties.id : null;

      map.getCanvas().style.cursor = hasFeature ? "pointer" : "";
      setHoveredHexId((current) => (current === nextHoveredHexId ? current : nextHoveredHexId));
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      setHoveredHexId(null);
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", "operational-hex-fill", handleMouseLeave);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", "operational-hex-fill", handleMouseLeave);
      map.getCanvas().style.cursor = "";
      setHoveredHexId(null);
    };
  }

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let map = createBaseMap(containerRef.current);
    mapRef.current = map;
    let disposed = false;
    let detachDebugHandler: (() => void) | undefined;

    const mountDebugHandler = () => {
      detachDebugHandler?.();
      detachDebugHandler = attachHexDebugHandler(map);
      ensureSearchResultHexLayers(map);
      ensureRiverGapHexLayers(map);
      void populateRiverGapHexOverlay(map, hexGeoJsonRef.current);
      applyLayerVisibility(map, layerVisibility);
      applyOperationalCellLayerMode(map, layerVisibility.hexes, cellLayerMode);
      applySettlementDisplayLevel(map, layerVisibility.settlements, settlementDisplayLevel);
      onZoomChange(`Zoom: ${map.getZoom().toFixed(2)}x`);
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      onCoordinateChange(
        `${event.lngLat.lng.toFixed(5)}, ${event.lngLat.lat.toFixed(5)}`,
      );
    };
    const handleZoom = () => {
      onZoomChange(`Zoom: ${map.getZoom().toFixed(2)}x`);
    };

    map.on("mousemove", handleMouseMove);
    map.on("zoom", handleZoom);

    loadProcessedMapData()
      .then((processedData: ProcessedMapData) => {
        if (disposed || !containerRef.current) {
          return;
        }

        hexGeoJsonRef.current = processedData.hexGeoJson ?? null;

        map.remove();
        map = createBaseMap(containerRef.current, processedData);
        mapRef.current = map;
        map.on("mousemove", handleMouseMove);
        map.on("zoom", handleZoom);
        map.once("idle", mountDebugHandler);
        setStatus("Terrain shell loaded from local processed data.");
        setDatasetInfo(
          `${processedData.layers.length} local layers available. Hex dataset bound from processed storage.`,
        );

        loadSettlementSearchEntries(processedData)
          .then((entries) => {
            if (disposed) {
              return;
            }

            settlementsRef.current = entries;
            setSearchMessage("Search for a city, town, or village.");
          })
          .catch(() => {
            if (disposed) {
              return;
            }

            settlementsRef.current = [];
            setSearchMessage("Settlement search is unavailable.");
          });
      })
      .catch(() => {
        loadHexOnlyProcessedData()
          .then((processedData) => {
            if (disposed || !containerRef.current) {
              return;
            }

            hexGeoJsonRef.current = processedData.hexGeoJson ?? null;
            settlementsRef.current = [];

            map.remove();
            map = createBaseMap(containerRef.current, processedData);
            mapRef.current = map;
            map.on("mousemove", handleMouseMove);
            map.on("zoom", handleZoom);
            map.once("idle", mountDebugHandler);

            setStatus("Processed layer manifest not found yet. Showing offline terrain shell with operational hexes only.");
            setDatasetInfo(
              "Hex cells are loaded from processed storage. Build layers.json and thematic layers to populate terrain sources.",
            );
            setSearchMessage("Settlement search is unavailable.");
          })
          .catch(() => {
            if (disposed) {
              return;
            }

            setStatus("Processed map data not found yet.");
            setDatasetInfo(
              "Generate the hex dataset and processed layer outputs before reloading the app.",
            );
          });
      });

    return () => {
      disposed = true;
      detachDebugHandler?.();
      onCoordinateChange(null);
      onZoomChange(null);
      map.off("zoom", handleZoom);
      map.remove();
      mapRef.current = null;
    };
  }, [onCoordinateChange, onZoomChange]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    applyLayerVisibility(mapRef.current, layerVisibility);
    applyOperationalCellLayerMode(mapRef.current, layerVisibility.hexes, cellLayerMode);
    applySettlementDisplayLevel(
      mapRef.current,
      layerVisibility.settlements,
      settlementDisplayLevel,
    );
  }, [cellLayerMode, layerVisibility, settlementDisplayLevel]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.fitBounds(ukraineTheaterConfig.fitBounds, {
      padding: 48,
      duration: 800,
    });
    onZoomChange(`Zoom: ${mapRef.current.getZoom().toFixed(2)}x`);
  }, [resetToken]);

  return (
    <>
      <div className="map-root" ref={containerRef} />
      <section className="search-panel" aria-label="Settlement search">
        <h2>Settlement Search</h2>
        <form
          className="search-panel__form"
          onSubmit={(event) => {
            event.preventDefault();

            if (searchResults[0]) {
              focusSettlement(searchResults[0]);
            }
          }}
        >
          <input
            className="search-panel__input"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Kyiv, Очаків, Makiivka..."
            type="search"
            value={searchQuery}
          />
          <button className="search-panel__button" type="submit">
            Find
          </button>
        </form>
        {searchResults.length > 0 ? (
          <ul className="search-panel__results">
            {searchResults.map((entry) => (
              <li key={entry.id}>
                <button
                  className="search-panel__result"
                  onClick={() => focusSettlement(entry)}
                  type="button"
                >
                  <strong>{entry.nameUk}</strong>
                  <span>
                    {entry.nameEn ? `(${entry.nameEn}) · ` : ""}
                    {entry.place}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : searchMessage ? (
          <p className="search-panel__message">{searchMessage}</p>
        ) : null}
      </section>
      <div className="map-status">
        <p className="placeholder-note">{status}</p>
        {datasetInfo ? <p className="placeholder-note">{datasetInfo}</p> : null}
      </div>
      <section className="cell-panel" aria-label="Cell information">
        <div className="cell-panel__controls">
          <button
            aria-controls="cell-details-panel"
            aria-expanded={detailsVisible}
            className="cell-panel__toggle"
            onClick={() => setDetailsVisible((value) => !value)}
            type="button"
          >
            <span className="cell-panel__toggle-text">{`Hex: ${hoveredHexId ?? "n/a"}`}</span>
          </button>
          <label className="cell-panel__debug">
            <input
              checked={detailedVisible}
              onChange={(event) => setDetailedVisible(event.target.checked)}
              type="checkbox"
            />
            <span>Detailed</span>
          </label>
        </div>
        {detailsVisible ? (
          <div className="cell-panel__body" id="cell-details-panel">
            <HexInspector
              hexRadiusKm={appConfig.hexRadiusKm}
              selectedHex={selectedHex}
              title="Cell Information"
            />
            {detailedVisible ? (
              <section className="cell-panel__detailed">
                <h3>Detailed</h3>
                {debugInfo ? (
                  <>
                    <p><strong>Hex:</strong> {debugInfo.hexId}</p>
                    <p>
                      <strong>True center lng/lat:</strong>{" "}
                      {debugInfo.trueCenterLngLat
                        ? `${debugInfo.trueCenterLngLat[0].toFixed(6)}, ${debugInfo.trueCenterLngLat[1].toFixed(6)}`
                        : "n/a"}
                    </p>
                    <p>
                      <strong>True center px:</strong>{" "}
                      {debugInfo.trueCenterPixels
                        ? `${debugInfo.trueCenterPixels[0].toFixed(2)}, ${debugInfo.trueCenterPixels[1].toFixed(2)}`
                        : "n/a"}
                    </p>
                    <p>
                      <strong>Click lng/lat:</strong>{" "}
                      {debugInfo.clickLngLat[0].toFixed(6)}, {debugInfo.clickLngLat[1].toFixed(6)}
                    </p>
                    <p>
                      <strong>Click px:</strong>{" "}
                      {debugInfo.clickPixels[0].toFixed(2)}, {debugInfo.clickPixels[1].toFixed(2)}
                    </p>
                    <p>
                      <strong>Delta true center px:</strong>{" "}
                      {debugInfo.deltaTrueCenterPixels
                        ? `${debugInfo.deltaTrueCenterPixels[0].toFixed(2)}, ${debugInfo.deltaTrueCenterPixels[1].toFixed(2)}`
                        : "n/a"}
                    </p>
                    <p>
                      <strong>Click to true center:</strong>{" "}
                      {debugInfo.clickToTrueCenterKm !== null
                        ? `${debugInfo.clickToTrueCenterKm.toFixed(4)} km`
                        : "n/a"}
                    </p>
                  </>
                ) : (
                  <p>Click inside a hex to inspect the true generated center and click delta.</p>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
