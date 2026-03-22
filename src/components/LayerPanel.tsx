import { useState, type CSSProperties } from "react";

export type LayerControlId =
  | "water"
  | "rivers"
  | "wetlands"
  | "forests"
  | "roads"
  | "railways"
  | "airports"
  | "settlements"
  | "poi"
  | "oblasts"
  | "hexes"
  | "contours"
  | "hillshade";

export type SettlementDisplayLevel = "cities" | "towns" | "villages";

export type LayerVisibility = Record<LayerControlId, boolean>;

type LayerControl = {
  id: LayerControlId;
  label: string;
  color: string;
  available: boolean;
};

const terrainLayerControls: LayerControl[] = [
  { id: "water", label: "Water", color: "#6f8fab", available: true },
  { id: "rivers", label: "Rivers", color: "#88a8c1", available: true },
  { id: "wetlands", label: "Wetlands", color: "#9a8a63", available: true },
  { id: "forests", label: "Forests", color: "#7a9660", available: true },
  { id: "hillshade", label: "Hillshade", color: "#727067", available: true },
];

const logisticsLayerControls: LayerControl[] = [
  { id: "roads", label: "Roads", color: "#b4895b", available: true },
  { id: "railways", label: "Railways", color: "#5f655b", available: true },
  { id: "airports", label: "Airports", color: "#9f9f9f", available: false },
];

const settlementsLayerControls: LayerControl[] = [
  { id: "settlements", label: "Settlements", color: "#5a4d3f", available: true },
  { id: "poi", label: "POI (Prototype)", color: "#a14f4f", available: true },
];

const boundariesLayerControls: LayerControl[] = [
  { id: "oblasts", label: "Oblasts", color: "#73796d", available: true },
  { id: "hexes", label: "Hexes", color: "#55614f", available: true },
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
  poi: true,
  oblasts: true,
  hexes: true,
  contours: false,
  hillshade: false,
};

type LayerPanelProps = {
  coordinateReadout: string | null;
  zoomReadout: string | null;
  settlementDisplayLevel: SettlementDisplayLevel;
  onChangeSettlementDisplayLevel: (level: SettlementDisplayLevel) => void;
  onReset: () => void;
  onToggleLayer: (layerId: LayerControlId) => void;
  visibility: LayerVisibility;
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
  onChangeSettlementDisplayLevel,
  onReset,
  onToggleLayer,
  visibility,
}: LayerPanelProps) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <>
      <section className="panel">
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
          <LayerToggleRow
            checked={visibility.settlements}
            layer={settlementsLayerControls[0]}
            onToggle={onToggleLayer}
          />
        </ul>
        <div className="settlement-level">
          <label className="settlement-level__label" htmlFor="settlement-level-select">
            Settlement level
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
        <ul className="layer-list">
          <LayerToggleRow
            checked={visibility.poi}
            layer={settlementsLayerControls[1]}
            onToggle={onToggleLayer}
          />
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
        <button
          aria-expanded={legendOpen}
          className="panel-collapse-toggle"
          onClick={() => setLegendOpen((current) => !current)}
          type="button"
        >
          <span>Legend</span>
          <span className="panel-collapse-toggle__indicator">{legendOpen ? "▲" : "▼"}</span>
        </button>
        {legendOpen ? (
          <ul className="legend-list">
            <li><span className="legend-swatch legend-swatch--water" />Water bodies + rivers</li>
            <li><span className="legend-swatch legend-swatch--forest" />Forest</li>
            <li><span className="legend-swatch legend-swatch--wetland" />Wetland</li>
            <li><span className="legend-swatch legend-swatch--road" />Road</li>
            <li><span className="legend-swatch legend-swatch--rail" />Railway</li>
            <li><span className="legend-swatch legend-swatch--settlements" />Settlements</li>
          </ul>
        ) : null}
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
