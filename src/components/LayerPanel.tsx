import type { CSSProperties } from "react";

export type LayerControlId =
  | "water"
  | "rivers"
  | "wetlands"
  | "forests"
  | "roads"
  | "railways"
  | "airports"
  | "settlements"
  | "oblasts"
  | "hexes"
  | "contours"
  | "hillshade";

export type ViewMode = "terrain" | "logistics" | "settlements" | "boundaries";
export type SettlementDisplayLevel = "cities" | "towns" | "villages";

export type LayerVisibility = Record<LayerControlId, boolean>;

type LayerControl = {
  id: LayerControlId;
  label: string;
  description: string;
  color: string;
  available: boolean;
};

const terrainLayerControls: LayerControl[] = [
  { id: "water", label: "Water", description: "Seas and inland water bodies", color: "#6f8fab", available: true },
  { id: "rivers", label: "Rivers", description: "River and stream overlay", color: "#88a8c1", available: true },
  { id: "wetlands", label: "Wetlands", description: "Wetland layer", color: "#91a98f", available: true },
  { id: "forests", label: "Forests", description: "Forest cover", color: "#7f9572", available: true },
  { id: "contours", label: "Contours", description: "Not generated yet", color: "#9f9f9f", available: false },
  { id: "hillshade", label: "Hillshade", description: "Relief shading from elevation", color: "#727067", available: true },
];

const logisticsLayerControls: LayerControl[] = [
  { id: "roads", label: "Roads", description: "Road network", color: "#b4895b", available: true },
  { id: "railways", label: "Railways", description: "Rail network", color: "#5f655b", available: true },
  { id: "airports", label: "Airports", description: "Planned layer", color: "#9f9f9f", available: false },
];

const settlementsLayerControls: LayerControl[] = [
  { id: "settlements", label: "Settlements", description: "Populated places", color: "#5a4d3f", available: true },
];

const boundariesLayerControls: LayerControl[] = [
  { id: "oblasts", label: "Oblasts", description: "Reference boundaries", color: "#73796d", available: true },
  { id: "hexes", label: "Hexes", description: "Operational hex layer", color: "#55614f", available: true },
];

export const defaultLayerVisibility: LayerVisibility = {
  water: true,
  rivers: true,
  wetlands: false,
  forests: false,
  roads: true,
  railways: true,
  airports: false,
  settlements: false,
  oblasts: true,
  hexes: true,
  contours: false,
  hillshade: false,
};

export const presetVisibility: Record<ViewMode, LayerVisibility> = {
  terrain: {
    ...defaultLayerVisibility,
    water: true,
    rivers: true,
    wetlands: true,
    forests: true,
    contours: false,
    hillshade: true,
    roads: false,
    railways: false,
    settlements: false,
    oblasts: false,
    hexes: false,
  },
  logistics: {
    ...defaultLayerVisibility,
    water: false,
    rivers: false,
    wetlands: false,
    forests: false,
    hillshade: false,
    roads: true,
    railways: true,
    settlements: false,
    oblasts: false,
    hexes: false,
  },
  settlements: {
    ...defaultLayerVisibility,
    water: false,
    rivers: false,
    wetlands: false,
    forests: false,
    roads: true,
    railways: false,
    settlements: true,
    oblasts: true,
    hexes: false,
    hillshade: false,
  },
  boundaries: {
    ...defaultLayerVisibility,
    water: false,
    rivers: false,
    wetlands: false,
    forests: false,
    roads: false,
    railways: false,
    settlements: false,
    oblasts: true,
    hexes: true,
    hillshade: false,
  },
};

type LayerPanelProps = {
  coordinateReadout: string | null;
  zoomReadout: string | null;
  settlementDisplayLevel: SettlementDisplayLevel;
  onApplyPreset: (mode: ViewMode) => void;
  onChangeSettlementDisplayLevel: (level: SettlementDisplayLevel) => void;
  onReset: () => void;
  onToggleLayer: (layerId: LayerControlId) => void;
  visibility: LayerVisibility;
  viewMode: ViewMode;
};

function LayerToggleRow({
  layer,
  checked,
  onToggle,
}: {
  layer: LayerControl;
  checked: boolean;
  onToggle: (layerId: LayerControlId) => void;
}) {
  return (
    <li>
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
            checked={checked}
            disabled={!layer.available}
            onChange={() => onToggle(layer.id)}
            type="checkbox"
          />
        </span>
      </label>
    </li>
  );
}

export function LayerPanel({
  coordinateReadout,
  zoomReadout,
  settlementDisplayLevel,
  onApplyPreset,
  onChangeSettlementDisplayLevel,
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
            className={`preset-button${viewMode === "logistics" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("logistics")}
            type="button"
          >
            Logistics
          </button>
          <button
            className={`preset-button${viewMode === "settlements" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("settlements")}
            type="button"
          >
            Settlements
          </button>
          <button
            className={`preset-button${viewMode === "boundaries" ? " is-active" : ""}`}
            onClick={() => onApplyPreset("boundaries")}
            type="button"
          >
            Boundaries
          </button>
        </div>
        <button className="reset-button" onClick={onReset} type="button">
          Reset to Ukraine
        </button>
      </section>

      <section className="panel">
        <h2>Terrain</h2>
        <ul className="layer-list">
          {terrainLayerControls.map((layer) => (
            <LayerToggleRow
              key={layer.id}
              checked={visibility[layer.id]}
              layer={layer}
              onToggle={onToggleLayer}
            />
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Logistics</h2>
        <ul className="layer-list">
          {logisticsLayerControls.map((layer) => (
            <LayerToggleRow
              key={layer.id}
              checked={visibility[layer.id]}
              layer={layer}
              onToggle={onToggleLayer}
            />
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Settlements</h2>
        <ul className="layer-list">
          {settlementsLayerControls.map((layer) => (
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
              <div className="settlement-level">
                <label className="settlement-level__label" htmlFor="settlement-level-select">
                  Level
                </label>
                <select
                  className="settlement-level__select"
                  disabled={!visibility.settlements}
                  id="settlement-level-select"
                  onChange={(event) =>
                    onChangeSettlementDisplayLevel(event.target.value as SettlementDisplayLevel)
                  }
                  value={settlementDisplayLevel}
                >
                  <option value="cities">Cities</option>
                  <option value="towns">Cities + Towns</option>
                  <option value="villages">Cities + Towns + Villages</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Boundaries</h2>
        <ul className="layer-list">
          {boundariesLayerControls.map((layer) => (
            <LayerToggleRow
              key={layer.id}
              checked={visibility[layer.id]}
              layer={layer}
              onToggle={onToggleLayer}
            />
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Legend</h2>
        <ul className="legend-list">
          <li><span className="legend-swatch legend-swatch--water" />Water bodies + rivers</li>
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
        <p className="panel__copy">
          {zoomReadout ?? "Zoom: n/a"}
        </p>
      </section>
    </>
  );
}
