import { useDeferredValue, useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  MapGeoJSONFeature,
  GeoJSONSource,
} from "maplibre-gl";
import {
  HexInspector,
  type HexInspectorData,
  type HexInspectorDebugData,
} from "../components/HexInspector";
import {
  type HexPolygonGeoJson,
  loadHexOnlyProcessedData,
  loadProcessedMapData,
  type ProcessedMapData,
} from "../data/loadProcessedData";
import type {
  LayerVisibility,
  SettlementDisplayLevel,
} from "../components/LayerPanel";
import { appConfig, ukraineTheaterConfig } from "../config";
import { createBaseMap } from "./createMap";
import { mapLayerVisibilityTargets } from "./layerRegistry";

type HexDebugInfo = HexInspectorDebugData;

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
type SearchResultEntry =
  | {
    kind: "settlement";
    id: string;
    entry: SettlementSearchEntry;
    exactMatch: boolean;
    prefixMatch: boolean;
  }
  | {
    kind: "hex";
    id: string;
    hexId: string;
    feature: HexPolygonGeoJson["features"][number];
    exactMatch: boolean;
    prefixMatch: boolean;
  };
type SettlementSearchResult = Extract<SearchResultEntry, { kind: "settlement" }>;
type HexSearchResult = Extract<SearchResultEntry, { kind: "hex" }>;
type FeatureCollectionLike = {
  type: "FeatureCollection";
  features: Array<{
    type?: string;
    properties?: Record<string, unknown>;
    geometry?: {
      type?: string;
      coordinates?: unknown;
    };
  }>;
};

const poiPrototypePath = new URL("../assets/poi-prototype.geojson", import.meta.url).href;
const poiAirfieldPngPath = new URL("../assets/poi-icons/poi-airfield.png", import.meta.url).href;
const poiAirfieldSvgPath = new URL("../assets/poi-icons/poi-airfield.svg", import.meta.url).href;
const poiAirportLargePngPath = new URL("../assets/poi-icons/poi-airport-large.png", import.meta.url).href;
const poiAirportLargeSvgPath = new URL("../assets/poi-icons/poi-airport-large.svg", import.meta.url).href;
const poiAirfieldMilitaryPngPath = new URL("../assets/poi-icons/poi-airfield-military.png", import.meta.url).href;
const poiAirfieldMilitarySvgPath = new URL("../assets/poi-icons/poi-airfield-military.svg", import.meta.url).href;
const poiBridgePngPath = new URL("../assets/poi-icons/poi-bridge.png", import.meta.url).href;
const poiBridgeSvgPath = new URL("../assets/poi-icons/poi-bridge.svg", import.meta.url).href;
const poiDamPngPath = new URL("../assets/poi-icons/poi-dam.png", import.meta.url).href;
const poiDamSvgPath = new URL("../assets/poi-icons/poi-dam.svg", import.meta.url).href;
const poiPowerPngPath = new URL("../assets/poi-icons/poi-power.png", import.meta.url).href;
const poiPowerSvgPath = new URL("../assets/poi-icons/poi-power.svg", import.meta.url).href;
const poiPowerNuclearPngPath = new URL("../assets/poi-icons/poi-power-nuclear.png", import.meta.url).href;
const poiPowerNuclearSvgPath = new URL("../assets/poi-icons/poi-power-nuclear.svg", import.meta.url).href;
const poiMilitaryPngPath = new URL("../assets/poi-icons/poi-military.png", import.meta.url).href;
const poiMilitarySvgPath = new URL("../assets/poi-icons/poi-military.svg", import.meta.url).href;
const poiRocketPngPath = new URL("../assets/poi-icons/poi-rocket.png", import.meta.url).href;
const poiRocketSvgPath = new URL("../assets/poi-icons/poi-rocket.svg", import.meta.url).href;
const poiSteelPngPath = new URL("../assets/poi-icons/poi-steel.png", import.meta.url).href;
const poiSteelSvgPath = new URL("../assets/poi-icons/poi-steel.svg", import.meta.url).href;
const poiPortCivilPngPath = new URL("../assets/poi-icons/poi-port-civil.png", import.meta.url).href;
const poiPortCivilSvgPath = new URL("../assets/poi-icons/poi-port-civil.svg", import.meta.url).href;
const poiPortMilitaryPngPath = new URL("../assets/poi-icons/poi-port-military.png", import.meta.url).href;
const poiPortMilitarySvgPath = new URL("../assets/poi-icons/poi-port-military.svg", import.meta.url).href;
const poiGenericPngPath = new URL("../assets/poi-icons/poi-generic.png", import.meta.url).href;
const poiGenericSvgPath = new URL("../assets/poi-icons/poi-generic.svg", import.meta.url).href;


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

function normalizeHexSearchText(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
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

function hexFeatureCenter(feature: HexPolygonGeoJson["features"][number]): Point | null {
  const centerFromProps = parseCentroid(
    feature.properties?.centerLngLat ?? feature.properties?.centroid,
  );

  if (centerFromProps) {
    return centerFromProps;
  }

  const ring = feature.geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length === 0) {
    return null;
  }

  const sum = ring.reduce(
    (accumulator, [longitude, latitude]) => ({
      longitude: accumulator.longitude + longitude,
      latitude: accumulator.latitude + latitude,
    }),
    { longitude: 0, latitude: 0 },
  );
  const divisor = ring.length;

  return [sum.longitude / divisor, sum.latitude / divisor];
}

function hexFeatureBounds(feature: HexPolygonGeoJson["features"][number]) {
  const ring = feature.geometry.coordinates[0];
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of ring) {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  }

  if (!Number.isFinite(west) || !Number.isFinite(south) || !Number.isFinite(east) || !Number.isFinite(north)) {
    return null;
  }

  return {
    west,
    south,
    east,
    north,
  };
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

async function applySettlementCityDedupe(
  map: MapLibreMap,
  processedData: ProcessedMapData,
) {
  const settlementsLayer = processedData.layers.find((layer) => layer.id === "settlements");
  if (!settlementsLayer) {
    return;
  }

  const response = await fetch(settlementsLayer.sourcePath, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return;
  }

  const geojson = (await response.json()) as FeatureCollectionLike;
  if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return;
  }

  const deduped = dedupeNearbyCitySettlements(geojson);
  const source =
    (map.getSource("processed-settlements") as GeoJSONSource | undefined) ??
    (map.getSource("settlements") as GeoJSONSource | undefined);
  source?.setData(deduped as unknown as GeoJSON.FeatureCollection);
}

function disperseNearbyPoiFeatures(geojson: FeatureCollectionLike): FeatureCollectionLike {
  const next = JSON.parse(JSON.stringify(geojson)) as FeatureCollectionLike;
  const points = next.features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates))
    .map(({ feature, index }) => {
      const coordinates = feature.geometry?.coordinates as unknown[];
      return {
        index,
        longitude: Number(coordinates[0]),
        latitude: Number(coordinates[1]),
      };
    });

  const visited = new Set<number>();
  const radiusKm = 1.1;
  const groupingDistanceKm = 2.0;

  for (const point of points) {
    if (visited.has(point.index)) {
      continue;
    }

    const group = points.filter((candidate) => {
      if (visited.has(candidate.index)) {
        return false;
      }
      return haversineKm([point.longitude, point.latitude], [candidate.longitude, candidate.latitude]) <= groupingDistanceKm;
    });

    if (group.length <= 1) {
      visited.add(point.index);
      continue;
    }

    const centerLongitude = group.reduce((sum, value) => sum + value.longitude, 0) / group.length;
    const centerLatitude = group.reduce((sum, value) => sum + value.latitude, 0) / group.length;
    const latitudeRadians = toRadians(centerLatitude);
    const longitudeKmScale = Math.max(0.25, Math.cos(latitudeRadians)) * 111.32;

    group.forEach((value, groupIndex) => {
      const angle = (2 * Math.PI * groupIndex) / group.length;
      const offsetLongitude = (radiusKm * Math.cos(angle)) / longitudeKmScale;
      const offsetLatitude = (radiusKm * Math.sin(angle)) / 111.32;
      const feature = next.features[value.index];
      if (feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates = [
          centerLongitude + offsetLongitude,
          centerLatitude + offsetLatitude,
        ];
      }
      visited.add(value.index);
    });
  }

  return next;
}

function dedupeNearbyCitySettlements(geojson: FeatureCollectionLike): FeatureCollectionLike {
  const dedupePlaces = new Set(["city", "town"]);
  const dedupeDistanceKm = 2.0;

  const normalizeName = (value: string) => value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

  const rankFromId = (id: string) => {
    if (id.startsWith("relation/")) {
      return 2;
    }
    if (id.startsWith("way/")) {
      return 1;
    }
    return 0;
  };

  type Candidate = {
    index: number;
    place: string;
    nameKey: string;
    id: string;
    longitude: number;
    latitude: number;
    population: number;
    sourceRank: number;
  };

  const candidates: Candidate[] = geojson.features
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates))
    .map(({ feature, index }) => {
      const coordinates = feature.geometry?.coordinates as unknown[];
      const place = String(feature.properties?.place ?? "");
      const id = String(feature.properties?.id ?? "");
      const population = parseNumber(feature.properties?.population) ?? 0;
      const nameEn = parseString(feature.properties?.nameEn) ?? "";
      const nameUk = parseString(feature.properties?.nameUk) ?? "";
      const name = parseString(feature.properties?.name) ?? "";
      const preferredName = nameEn || nameUk || name;
      return {
        index,
        place,
        nameKey: normalizeName(preferredName),
        id,
        longitude: Number(coordinates[0]),
        latitude: Number(coordinates[1]),
        population,
        sourceRank: rankFromId(id),
      };
    })
    .filter((candidate) => dedupePlaces.has(candidate.place) && candidate.nameKey !== "");

  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.place}|${candidate.nameKey}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  const keepIndices = new Set<number>();

  for (const group of grouped.values()) {
    const remaining = [...group];
    while (remaining.length > 0) {
      const seed = remaining.shift();
      if (!seed) {
        break;
      }

      const cluster = [seed];
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        const distance = haversineKm(
          [seed.longitude, seed.latitude],
          [candidate.longitude, candidate.latitude],
        );
        if (distance <= dedupeDistanceKm) {
          cluster.push(candidate);
          remaining.splice(index, 1);
        }
      }

      cluster.sort((left, right) =>
        right.sourceRank - left.sourceRank ||
        right.population - left.population,
      );
      keepIndices.add(cluster[0].index);
    }
  }

  return {
    ...geojson,
    features: geojson.features.filter((feature, index) => {
      const place = String(feature.properties?.place ?? "");
      if (!dedupePlaces.has(place)) {
        return true;
      }
      return keepIndices.has(index);
    }),
  };
}

type MapViewProps = {
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

function applyOperationalHexVisibility(map: MapLibreMap, cellsVisible: boolean) {
  setLayerVisibility(
    map,
    ["operational-hex-fill", "operational-hex-outline"],
    cellsVisible ? "visible" : "none",
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

function setSelectedHexFeature(
  map: MapLibreMap,
  feature: HexPolygonGeoJson["features"][number],
) {
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

type PoiIconDefinition = {
  id: string;
  pngUrl: string;
  svgUrl: string;
};

const poiIconDefinitions: PoiIconDefinition[] = [
  { id: "poi-airfield", pngUrl: poiAirfieldPngPath, svgUrl: poiAirfieldSvgPath },
  { id: "poi-airport-large", pngUrl: poiAirportLargePngPath, svgUrl: poiAirportLargeSvgPath },
  { id: "poi-airfield-military", pngUrl: poiAirfieldMilitaryPngPath, svgUrl: poiAirfieldMilitarySvgPath },
  { id: "poi-bridge", pngUrl: poiBridgePngPath, svgUrl: poiBridgeSvgPath },
  { id: "poi-dam", pngUrl: poiDamPngPath, svgUrl: poiDamSvgPath },
  { id: "poi-power", pngUrl: poiPowerPngPath, svgUrl: poiPowerSvgPath },
  { id: "poi-power-nuclear", pngUrl: poiPowerNuclearPngPath, svgUrl: poiPowerNuclearSvgPath },
  { id: "poi-military", pngUrl: poiMilitaryPngPath, svgUrl: poiMilitarySvgPath },
  { id: "poi-rocket", pngUrl: poiRocketPngPath, svgUrl: poiRocketSvgPath },
  { id: "poi-steel", pngUrl: poiSteelPngPath, svgUrl: poiSteelSvgPath },
  { id: "poi-port-civil", pngUrl: poiPortCivilPngPath, svgUrl: poiPortCivilSvgPath },
  { id: "poi-port-military", pngUrl: poiPortMilitaryPngPath, svgUrl: poiPortMilitarySvgPath },
  { id: "poi-generic", pngUrl: poiGenericPngPath, svgUrl: poiGenericSvgPath },
];

async function loadIconImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load icon ${url}`));
    image.src = url;
  });
}

function buildFallbackIconImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.fillStyle = "#0B2B50";
  context.beginPath();
  context.arc(32, 32, 18, 0, Math.PI * 2);
  context.fill();
  return context.getImageData(0, 0, 64, 64);
}

async function ensurePoiIcons(map: MapLibreMap) {
  await Promise.all(
    poiIconDefinitions.map(async (iconDefinition) => {
      if (map.hasImage(iconDefinition.id)) {
        return;
      }

      try {
        let image: HTMLImageElement;
        try {
          image = await loadIconImage(iconDefinition.pngUrl);
        } catch {
          image = await loadIconImage(iconDefinition.svgUrl);
        }
        map.addImage(iconDefinition.id, image);
      } catch (error) {
        const fallbackIcon = buildFallbackIconImage();
        if (fallbackIcon && !map.hasImage(iconDefinition.id)) {
          map.addImage(iconDefinition.id, fallbackIcon);
        }
        console.warn(`POI icon load failed for ${iconDefinition.id}`, error);
      }
    }),
  );
}

function ensurePoiPrototypeLayers(map: MapLibreMap) {
  if (!map.getSource("poi-prototype")) {
    map.addSource("poi-prototype", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  void ensurePoiIcons(map).then(() => {
    if (!map.getLayer("poi-prototype-icon")) {
      map.addLayer({
        id: "poi-prototype-icon",
        type: "symbol",
        source: "poi-prototype",
        layout: {
          "icon-image": [
            "coalesce",
            ["get", "icon"],
            [
              "match",
              ["coalesce", ["get", "category"], "other"],
              "airport",
              "poi-airfield",
              "airfield",
              "poi-airfield",
              "bridge",
              "poi-bridge",
              "dam",
              "poi-dam",
              "power_plant",
              "poi-power",
              "nuclear_power_plant",
              "poi-power-nuclear",
              "military_base",
              "poi-military",
              "rocket_site",
              "poi-rocket",
              "steel_plant",
              "poi-steel",
              "port",
              "poi-port-civil",
              "poi-generic",
            ],
          ],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            0.03,
            8,
            0.05,
            12,
            0.065,
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
    }
  });

  if (!map.getLayer("poi-prototype-label")) {
    map.addLayer({
      id: "poi-prototype-label",
      type: "symbol",
      source: "poi-prototype",
      minzoom: 7.5,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "category"], "POI"],
        "text-font": ["Noto Sans Regular", "Open Sans Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          7.5,
          10,
          10,
          12,
          12,
          13,
        ],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#4b4238",
        "text-halo-color": "rgba(245, 242, 232, 0.95)",
        "text-halo-width": 1.2,
      },
    });
  }

  fetch(poiPrototypePath, {
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${poiPrototypePath}: ${response.status}`);
      }
      return response.json();
    })
    .then((geojson) => {
      const source = map.getSource("poi-prototype") as GeoJSONSource | undefined;
      const normalized = disperseNearbyPoiFeatures(geojson as FeatureCollectionLike);
      source?.setData(normalized as unknown as GeoJSON.FeatureCollection);
    })
    .catch(() => {
      const source = map.getSource("poi-prototype") as GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: [],
      });
    });
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
  const [statusFaded, setStatusFaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState<HexDebugInfo | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexInspectorData | null>(null);
  const [hoveredHexId, setHoveredHexId] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<SearchResultEntry[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>("Loading settlements and hexes for search.");

  useEffect(() => {
    const rawQuery = deferredSearchQuery.trim();
    const normalizedSettlementQuery = normalizeSearchText(rawQuery);
    const normalizedHexQuery = normalizeHexSearchText(rawQuery);
    const compactHexQuery = normalizedHexQuery.replace(/-/g, "");

    if (normalizedSettlementQuery === "" && normalizedHexQuery === "") {
      setSearchResults([]);
      setSearchMessage(
        settlementsRef.current.length > 0
          ? "Search for a city, town, village, or hex ID."
          : "Loading settlements and hexes for search.",
      );
      return;
    }

    const settlementResults: SettlementSearchResult[] = normalizedSettlementQuery === ""
      ? []
      : settlementsRef.current
      .map((entry) => {
        const uk = normalizeSearchText(entry.nameUk);
        const en = entry.nameEn ? normalizeSearchText(entry.nameEn) : "";
        const label = normalizeSearchText(settlementLabel(entry));
        const exactMatch =
          uk === normalizedSettlementQuery ||
          en === normalizedSettlementQuery ||
          label === normalizedSettlementQuery;
        const prefixMatch =
          uk.startsWith(normalizedSettlementQuery) ||
          en.startsWith(normalizedSettlementQuery) ||
          label.startsWith(normalizedSettlementQuery);
        const containsMatch =
          uk.includes(normalizedSettlementQuery) ||
          en.includes(normalizedSettlementQuery) ||
          label.includes(normalizedSettlementQuery);

        if (!containsMatch) {
          return null;
        }

        return {
          kind: "settlement" as const,
          id: `settlement:${entry.id}`,
          entry,
          exactMatch,
          prefixMatch,
        } satisfies SettlementSearchResult;
      })
      .filter((result): result is SettlementSearchResult => result !== null)
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
      });

    const hexResults: HexSearchResult[] = normalizedHexQuery === "" || !hexGeoJsonRef.current
      ? []
      : hexGeoJsonRef.current.features
        .map((feature) => {
          const hexId = String(feature.properties?.id ?? "");
          if (hexId === "") {
            return null;
          }

          const normalizedHexId = hexId.toUpperCase();
          const compactHexId = normalizedHexId.replace(/-/g, "");
          const exactMatch =
            normalizedHexId === normalizedHexQuery ||
            compactHexId === compactHexQuery;
          const prefixMatch =
            normalizedHexId.startsWith(normalizedHexQuery) ||
            compactHexId.startsWith(compactHexQuery);
          const containsMatch =
            normalizedHexId.includes(normalizedHexQuery) ||
            compactHexId.includes(compactHexQuery);

          if (!containsMatch) {
            return null;
          }

          return {
            kind: "hex" as const,
            id: `hex:${hexId}`,
            hexId,
            feature,
            exactMatch,
            prefixMatch,
          } satisfies HexSearchResult;
        })
        .filter((result): result is HexSearchResult => result !== null)
        .sort((left, right) => {
          if (left.exactMatch !== right.exactMatch) {
            return left.exactMatch ? -1 : 1;
          }

          if (left.prefixMatch !== right.prefixMatch) {
            return left.prefixMatch ? -1 : 1;
          }

          return left.hexId.localeCompare(right.hexId, "en");
        });

    const likelyHexQuery = normalizedHexQuery.includes("HX") || normalizedHexQuery.includes("-");
    const rankedResults: SearchResultEntry[] = [
      ...(likelyHexQuery ? hexResults : settlementResults),
      ...(likelyHexQuery ? settlementResults : hexResults),
    ]
      .sort((left, right) => {
        if (left.exactMatch !== right.exactMatch) {
          return left.exactMatch ? -1 : 1;
        }

        if (left.prefixMatch !== right.prefixMatch) {
          return left.prefixMatch ? -1 : 1;
        }

        if (left.kind !== right.kind) {
          return left.kind === "hex" ? -1 : 1;
        }

        if (left.kind === "hex" && right.kind === "hex") {
          return left.hexId.localeCompare(right.hexId, "en");
        }

        if (left.kind === "settlement" && right.kind === "settlement") {
          const populationDelta = (right.entry.population ?? 0) - (left.entry.population ?? 0);

          if (populationDelta !== 0) {
            return populationDelta;
          }

          return settlementLabel(left.entry).localeCompare(settlementLabel(right.entry), "uk");
        }

        return 0;
      })
      .slice(0, 12);

    setSearchResults(rankedResults);
    setSearchMessage(
      rankedResults.length > 0
        ? null
        : `No results matched "${rawQuery}".`,
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
    setSelectedHexFeature(map, containingHex);
    setSelectedHex(buildHexInspectorData(containingHex as unknown as MapGeoJSONFeature));
    setDebugInfo(null);
    setSearchQuery(settlementLabel(entry));
    setSearchMessage(`Centered on ${settlementLabel(entry)} in ${containingHex.properties.id}.`);
  }

  function focusHex(feature: HexPolygonGeoJson["features"][number]) {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const center = hexFeatureCenter(feature);
    const bounds = hexFeatureBounds(feature);
    const hexId = String(feature.properties?.id ?? "unknown");

    setSearchResultHexFeature(map, feature);
    setSelectedHexFeature(map, feature);
    setSelectedHex(buildHexInspectorData(feature as unknown as MapGeoJSONFeature));
    setDebugInfo(null);
    setSearchQuery(hexId);
    setSearchMessage(`Centered on ${hexId}.`);

    if (bounds) {
      map.fitBounds(
        [[bounds.west, bounds.south], [bounds.east, bounds.north]],
        {
          padding: 90,
          duration: 600,
          maxZoom: 9.5,
          essential: true,
        },
      );
      return;
    }

    if (center) {
      map.flyTo({
        center,
        zoom: Math.max(map.getZoom(), 9),
        essential: true,
      });
    }
  }

  function focusSearchResult(result: SearchResultEntry) {
    if (result.kind === "hex") {
      focusHex(result.feature);
      return;
    }

    focusSettlement(result.entry);
  }

  function attachHexDebugHandler(map: MapLibreMap) {
    ensureSelectedHexLayers(map);

    const handleClick = (event: MapMouseEvent) => {
      const renderedFeature = map.queryRenderedFeatures(event.point, {
        layers: ["operational-hex-fill"],
      })[0] as MapGeoJSONFeature | undefined;
      const point: Point = [event.lngLat.lng, event.lngLat.lat];
      const renderedHexId =
        typeof renderedFeature?.properties?.id === "string"
          ? renderedFeature.properties.id
          : null;
      const canonicalFeatureById = renderedHexId
        ? hexGeoJsonRef.current?.features.find(
            (candidate) => String(candidate.properties?.id ?? "") === renderedHexId,
          )
        : null;
      const canonicalFeature = canonicalFeatureById ??
        hexGeoJsonRef.current?.features.find((candidate) =>
          pointInPolygonFeature(point, candidate),
        );
      const featureForDebug = renderedFeature ??
        (canonicalFeature as unknown as MapGeoJSONFeature | undefined);

      if (!canonicalFeature || !featureForDebug) {
        setDebugInfo(null);
        setSelectedHex(null);
        clearSelectedHex(map);
        return;
      }

      const centroid =
        parseCentroid(featureForDebug.properties?.centroid) ?? geometryCentroid(featureForDebug);
      const trueCenter = parseCentroid(featureForDebug.properties?.centerLngLat);
      const hexId =
        typeof featureForDebug.properties?.id === "string"
          ? featureForDebug.properties.id
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

      setSelectedHexFeature(map, canonicalFeature);
      setSelectedHex(buildHexInspectorData(canonicalFeature as unknown as MapGeoJSONFeature));
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
      ensurePoiPrototypeLayers(map);
      applyLayerVisibility(map, layerVisibility);
      applyOperationalHexVisibility(map, layerVisibility.hexes);
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
        map.once("idle", () => {
          mountDebugHandler();
          void applySettlementCityDedupe(map, processedData);
        });
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
            setSearchMessage("Search for a city, town, village, or hex ID.");
          })
          .catch(() => {
            if (disposed) {
              return;
            }

            settlementsRef.current = [];
            setSearchMessage("Settlement search is unavailable. Hex search is still available.");
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
            setSearchMessage("Settlement search is unavailable. Hex search is still available.");
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
    applyOperationalHexVisibility(mapRef.current, layerVisibility.hexes);
    applySettlementDisplayLevel(
      mapRef.current,
      layerVisibility.settlements,
      settlementDisplayLevel,
    );
  }, [layerVisibility, settlementDisplayLevel]);

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

  useEffect(() => {
    if (!status && !datasetInfo) {
      return;
    }

    setStatusFaded(false);
    const fadeTimeout = window.setTimeout(() => {
      setStatusFaded(true);
    }, 120);

    return () => {
      window.clearTimeout(fadeTimeout);
    };
  }, [status, datasetInfo]);

  return (
    <>
      <div className="map-root" ref={containerRef} />
      <div className={`map-status${statusFaded ? " is-faded" : ""}`}>
        <p className="placeholder-note">{status}</p>
        {datasetInfo ? <p className="placeholder-note">{datasetInfo}</p> : null}
      </div>
      <section className="cell-panel" aria-label="Cell information">
        <div className="cell-panel__controls">
          <div className="cell-panel__control-group">
            <button
              aria-controls="cell-details-panel"
              aria-expanded={detailsVisible}
              className="cell-panel__toggle"
              onClick={() => setDetailsVisible((value) => !value)}
              type="button"
            >
              <span aria-hidden="true" className="cell-panel__toggle-indicator">
                {detailsVisible ? "▲" : "▼"}
              </span>
              <span className="cell-panel__toggle-text">{`Hex: ${hoveredHexId ?? "n/a"}`}</span>
            </button>
          </div>
          <form
            className="cell-panel__search-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (searchResults[0]) {
                focusSearchResult(searchResults[0]);
              }
            }}
          >
            <input
              className="cell-panel__search-input"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search settlement or hex (HX-W19-N50)"
              type="search"
              value={searchQuery}
            />
          </form>
        </div>
        {searchResults.length > 0 ? (
          <ul className="cell-panel__search-results">
            {searchResults.map((result) => (
              <li key={result.id}>
                <button
                  className="cell-panel__search-result"
                  onClick={() => focusSearchResult(result)}
                  type="button"
                >
                  {result.kind === "hex" ? (
                    <>
                      <strong>{result.hexId}</strong>
                      <span>Hex</span>
                    </>
                  ) : (
                    <>
                      <strong>{result.entry.nameUk}</strong>
                      <span>
                        {result.entry.nameEn ? `(${result.entry.nameEn}) · ` : ""}
                        {result.entry.place}
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : searchMessage ? (
          <p className="cell-panel__search-message">{searchMessage}</p>
        ) : null}
        {detailsVisible ? (
          <div className="cell-panel__body" id="cell-details-panel">
            <HexInspector
              debugInfo={debugInfo}
              hexRadiusKm={appConfig.hexRadiusKm}
              selectedHex={selectedHex}
              title="Cell Information"
            />
          </div>
        ) : null}
      </section>
    </>
  );
}
