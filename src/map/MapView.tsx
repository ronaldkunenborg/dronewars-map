import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  MapGeoJSONFeature,
  GeoJSONSource,
} from "maplibre-gl";
import { HexInspector, type HexInspectorData } from "../components/HexInspector";
import {
  loadHexOnlyProcessedData,
  loadProcessedMapData,
  type ProcessedMapData,
} from "../data/loadProcessedData";
import type { LayerVisibility } from "../components/LayerPanel";
import { ukraineTheaterConfig } from "../config";
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

type MapViewProps = {
  layerVisibility: LayerVisibility;
  onCoordinateChange: (value: string | null) => void;
  resetToken: number;
};

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
        "fill-color": "#d3a85e",
        "fill-opacity": 0.12,
      },
    });
  }

  if (!map.getLayer("selected-hex-outline")) {
    map.addLayer({
      id: "selected-hex-outline",
      type: "line",
      source: "selected-hex",
      paint: {
        "line-color": "#9f7035",
        "line-opacity": 0.95,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.8,
          8,
          1.4,
          12,
          2.2,
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

function buildHexInspectorData(feature: MapGeoJSONFeature): HexInspectorData {
  const terrainSummary = parseJsonObject<{
    dominantTerrain?: unknown;
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
  onCoordinateChange,
  resetToken,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState("Loading local processed map data.");
  const [datasetInfo, setDatasetInfo] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<HexDebugInfo | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexInspectorData | null>(null);

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
      const hasFeature = map.queryRenderedFeatures(event.point, {
        layers: ["operational-hex-fill"],
      }).length > 0;

      map.getCanvas().style.cursor = hasFeature ? "pointer" : "";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", "operational-hex-fill", handleMouseLeave);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseleave", "operational-hex-fill", handleMouseLeave);
      map.getCanvas().style.cursor = "";
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
      applyLayerVisibility(map, layerVisibility);
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      onCoordinateChange(
        `${event.lngLat.lng.toFixed(5)}, ${event.lngLat.lat.toFixed(5)}`,
      );
    };

    map.on("mousemove", handleMouseMove);

    loadProcessedMapData()
      .then((processedData: ProcessedMapData) => {
        if (disposed || !containerRef.current) {
          return;
        }

        map.remove();
        map = createBaseMap(containerRef.current, processedData);
        mapRef.current = map;
        map.on("mousemove", handleMouseMove);
        map.once("idle", mountDebugHandler);
        setStatus("Terrain shell loaded from local processed data.");
        setDatasetInfo(
          `${processedData.layers.length} local layers available. Hex dataset bound from processed storage.`,
        );
      })
      .catch(() => {
        loadHexOnlyProcessedData()
          .then((processedData) => {
            if (disposed || !containerRef.current) {
              return;
            }

            map.remove();
            map = createBaseMap(containerRef.current, processedData);
            mapRef.current = map;
            map.on("mousemove", handleMouseMove);
            map.once("idle", mountDebugHandler);

            setStatus("Processed layer manifest not found yet. Showing offline terrain shell with operational hexes only.");
            setDatasetInfo(
              "Hex cells are loaded from processed storage. Build layers.json and thematic layers to populate terrain sources.",
            );
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
      map.remove();
      mapRef.current = null;
    };
  }, [onCoordinateChange]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    applyLayerVisibility(mapRef.current, layerVisibility);
  }, [layerVisibility]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    mapRef.current.fitBounds(ukraineTheaterConfig.fitBounds, {
      padding: 48,
      duration: 800,
    });
  }, [resetToken]);

  return (
    <>
      <div className="map-root" ref={containerRef} />
      <div className="map-status">
        <p className="placeholder-note">{status}</p>
        {datasetInfo ? <p className="placeholder-note">{datasetInfo}</p> : null}
      </div>
      {debugInfo ? (
        <aside className="debug-panel">
          <h2>Hex Debug</h2>
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
        </aside>
      ) : (
        <aside className="debug-panel debug-panel--empty">
          <h2>Hex Debug</h2>
          <p>Click inside a hex to inspect the true generated center and click delta.</p>
        </aside>
      )}
      <HexInspector selectedHex={selectedHex} />
    </>
  );
}
