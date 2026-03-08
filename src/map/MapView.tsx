import { useEffect, useRef, useState } from "react";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  MapGeoJSONFeature,
} from "maplibre-gl";
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
  centroidLngLat: [number, number];
  centroidPixels: [number, number];
  clickLngLat: [number, number];
  clickPixels: [number, number];
  deltaPixels: [number, number];
  deltaTrueCenterPixels: [number, number] | null;
  clickToCenterKm: number;
  rawProperties: string;
};

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

  function attachHexDebugHandler(map: MapLibreMap) {
    const handleClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: ["operational-hex-fill"],
      })[0] as MapGeoJSONFeature | undefined;

      if (!feature) {
        setDebugInfo(null);
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

      setDebugInfo({
        hexId,
        trueCenterLngLat: trueCenter,
        trueCenterPixels,
        centroidLngLat: centroid,
        centroidPixels,
        clickLngLat,
        clickPixels,
        deltaPixels: [
          clickPixels[0] - centroidPixels[0],
          clickPixels[1] - centroidPixels[1],
        ],
        deltaTrueCenterPixels: trueCenterPixels
          ? [
              clickPixels[0] - trueCenterPixels[0],
              clickPixels[1] - trueCenterPixels[1],
            ]
          : null,
        clickToCenterKm: haversineKm(clickLngLat, centroid),
        rawProperties: JSON.stringify(feature.properties ?? {}, null, 2),
      });
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
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
            <strong>Centroid lng/lat:</strong>{" "}
            {debugInfo.centroidLngLat[0].toFixed(6)}, {debugInfo.centroidLngLat[1].toFixed(6)}
          </p>
          <p>
            <strong>Centroid px:</strong>{" "}
            {debugInfo.centroidPixels[0].toFixed(2)}, {debugInfo.centroidPixels[1].toFixed(2)}
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
            <strong>Delta px:</strong>{" "}
            {debugInfo.deltaPixels[0].toFixed(2)}, {debugInfo.deltaPixels[1].toFixed(2)}
          </p>
          <p>
            <strong>Delta true center px:</strong>{" "}
            {debugInfo.deltaTrueCenterPixels
              ? `${debugInfo.deltaTrueCenterPixels[0].toFixed(2)}, ${debugInfo.deltaTrueCenterPixels[1].toFixed(2)}`
              : "n/a"}
          </p>
          <p>
            <strong>Click to center:</strong> {debugInfo.clickToCenterKm.toFixed(4)} km
          </p>
          <p><strong>Raw properties:</strong></p>
          <pre className="debug-panel__raw">{debugInfo.rawProperties}</pre>
        </aside>
      ) : (
        <aside className="debug-panel debug-panel--empty">
          <h2>Hex Debug</h2>
          <p>Click inside a hex to inspect its center in pixels and kilometers.</p>
        </aside>
      )}
    </>
  );
}
