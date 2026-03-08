import maplibregl from "maplibre-gl";
import { mapViewConfig, ukraineTheaterConfig } from "../config";
import type { ProcessedMapData } from "../data/loadProcessedData";
import { terrainShellStyle, mountTerrainShell } from "./terrainShell";

export function createBaseMap(
  container: HTMLDivElement,
  processedData?: ProcessedMapData,
) {
  const map = new maplibregl.Map({
    container,
    style: terrainShellStyle,
    center: mapViewConfig.center,
    zoom: mapViewConfig.zoom,
    minZoom: mapViewConfig.minZoom,
    maxZoom: mapViewConfig.maxZoom,
    maxBounds: ukraineTheaterConfig.fitBounds,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  map.on("load", () => {
    if (processedData) {
      mountTerrainShell(map, processedData);
    }
  });

  return map;
}
