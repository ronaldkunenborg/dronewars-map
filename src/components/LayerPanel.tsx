export type LayerControlId =
  | "water"
  | "wetlands"
  | "forests"
  | "roads"
  | "railways"
  | "settlements"
  | "oblasts"
  | "hexes"
  | "contours"
  | "hillshade";

export type ViewMode = "terrain" | "hydrology" | "mobility" | "operational-cells";

export type LayerVisibility = Record<LayerControlId, boolean>;

type LayerControl = {
  id: LayerControlId;
  label: string;
  description: string;
  color: string;
  available: boolean;
};

const layerControls: LayerControl[] = [
  { id: "water", label: "Water", description: "Rivers and water bodies", color: "#6f8fab", available: true },
  { id: "wetlands", label: "Wetlands", description: "Wetland layer", color: "#91a98f", available: true },
  { id: "forests", label: "Forests", description: "Forest cover", color: "#7f9572", available: true },
  { id: "roads", label: "Roads", description: "Road network", color: "#b4895b", available: true },
  { id: "railways", label: "Railways", description: "Rail network", color: "#5f655b", available: true },
  { id: "settlements", label: "Settlements", description: "Populated places", color: "#5a4d3f", available: true },
  { id: "oblasts", label: "Oblasts", description: "Reference boundaries", color: "#73796d", available: true },
  { id: "hexes", label: "Operational Cells", description: "Simulation hex grid", color: "#55614f", available: true },
  { id: "contours", label: "Contours", description: "Not generated yet", color: "#9f9f9f", available: false },
  { id: "hillshade", label: "Hillshade", description: "Not generated yet", color: "#9f9f9f", available: false },
];

export const defaultLayerVisibility: LayerVisibility = {
  water: true,
  wetlands: true,
  forests: true,
  roads: true,
  railways: true,
  settlements: true,
  oblasts: true,
  hexes: true,
  contours: false,
  hillshade: false,
};

export const presetVisibility: Record<ViewMode, LayerVisibility> = {
  terrain: {
    ...defaultLayerVisibility,
    roads: false,
    railways: false,
    settlements: false,
    hexes: false,
  },
  hydrology: {
    ...defaultLayerVisibility,
    forests: false,
    roads: false,
    railways: false,
    settlements: false,
    oblasts: false,
    hexes: false,
  },
  mobility: {
    ...defaultLayerVisibility,
    wetlands: true,
    forests: false,
    oblasts: false,
    hexes: false,
  },
  "operational-cells": {
    ...defaultLayerVisibility,
    wetlands: false,
    forests: false,
    settlements: false,
    hexes: true,
    oblasts: true,
  },
};

type LayerPanelProps = {
  coordinateReadout: string | null;
  onApplyPreset: (mode: ViewMode) => void;
  onReset: () => void;
  onToggleLayer: (layerId: LayerControlId) => void;
  visibility: LayerVisibility;
  viewMode: ViewMode;
};

export function LayerPanel({
  coordinateReadout,
  onApplyPreset,
  onReset,
  onToggleLayer,
  visibility,
  viewMode,
}: LayerPanelProps) {
  return (
    <>
      <section className="panel">
        <h2>View Modes</h2>
        <div className="preset-row">
          <button
            className={`preset-button${viewMode === "terrain" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("terrain")}
            type="button"
          >
            Terrain
          </button>
          <button
            className={`preset-button${viewMode === "hydrology" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("hydrology")}
            type="button"
          >
            Hydrology
          </button>
          <button
            className={`preset-button${viewMode === "mobility" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("mobility")}
            type="button"
          >
            Mobility
          </button>
          <button
            className={`preset-button${viewMode === "operational-cells" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("operational-cells")}
            type="button"
          >
            Cells
          </button>
        </div>
        <button className="reset-button" onClick={onReset} type="button">
          Reset to Ukraine
        </button>
      </section>

      <section className="panel">
        <h2>Layers</h2>
        <ul className="layer-list">
          {layerControls.map((layer) => (
            <li key={layer.id}>
              <label className={`toggle-row${layer.available ? "" : " is-disabled"}`}>
                <div className="layer-label">
                  <strong>{layer.label}</strong>
                  <span>{layer.description}</span>
                </div>
                <span className="toggle-row__controls">
                  <span
                    aria-hidden="true"
                    className="layer-dot"
                    style={{ "--dot-color": layer.color } as CSSProperties}
                  />
                  <input
                    checked={visibility[layer.id]}
                    disabled={!layer.available}
                    onChange={() => onToggleLayer(layer.id)}
                    type="checkbox"
                  />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Legend</h2>
        <ul className="legend-list">
          <li><span className="legend-swatch legend-swatch--water" />Water</li>
          <li><span className="legend-swatch legend-swatch--forest" />Forest</li>
          <li><span className="legend-swatch legend-swatch--wetland" />Wetland</li>
          <li><span className="legend-swatch legend-swatch--road" />Road</li>
          <li><span className="legend-swatch legend-swatch--rail" />Railway</li>
          <li><span className="legend-swatch legend-swatch--hex" />Operational hex</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Coordinates</h2>
        <p className="panel__copy">
          {coordinateReadout ?? "Move the pointer over the map to read coordinates."}
        </p>
      </section>
    </>
  );
}
import type { CSSProperties } from "react";
