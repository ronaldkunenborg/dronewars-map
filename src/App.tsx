import { useState } from "react";
import {
  type CellLayerMode,
  LayerPanel,
  presetVisibility,
  type LayerControlId,
  type SettlementDisplayLevel,
  type ViewMode,
} from "./components/LayerPanel";
import { ukraineTheaterConfig } from "./config";
import { MapView } from "./map/MapView";

export default function App() {
  const [visibility, setVisibility] = useState(presetVisibility.boundaries);
  const [viewMode, setViewMode] = useState<ViewMode>("boundaries");
  const [cellLayerMode, setCellLayerMode] = useState<CellLayerMode>("hexes");
  const [settlementDisplayLevel, setSettlementDisplayLevel] =
    useState<SettlementDisplayLevel>("villages");
  const [resetToken, setResetToken] = useState(0);
  const [coordinateReadout, setCoordinateReadout] = useState<string | null>(null);
  const [zoomReadout, setZoomReadout] = useState<string | null>(null);

  function handleChangeCellLayerMode(mode: CellLayerMode) {
    setCellLayerMode(mode);
    setVisibility((current) => ({
      ...current,
      hexes: true,
    }));
  }

  function handleToggleLayer(layerId: LayerControlId) {
    setVisibility((current) => ({
      ...current,
      [layerId]: !current[layerId],
    }));
  }

  function handleApplyPreset(mode: ViewMode) {
    setViewMode(mode);
    setVisibility(presetVisibility[mode]);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="sidebar__header">
          <p className="eyebrow">Operational Cartography</p>
          <h1>Dronewars Map</h1>
          <p className="sidebar__copy">
            Theater extent:
            {" "}
            {ukraineTheaterConfig.extent.west} to {ukraineTheaterConfig.extent.east}
            {" "}
            lon / {ukraineTheaterConfig.extent.south} to {ukraineTheaterConfig.extent.north}
            {" "}
            lat.
          </p>
        </header>
        <LayerPanel
          cellLayerMode={cellLayerMode}
          coordinateReadout={coordinateReadout}
          zoomReadout={zoomReadout}
          settlementDisplayLevel={settlementDisplayLevel}
          onApplyPreset={handleApplyPreset}
          onChangeCellLayerMode={handleChangeCellLayerMode}
          onChangeSettlementDisplayLevel={setSettlementDisplayLevel}
          onReset={() => setResetToken((value) => value + 1)}
          onToggleLayer={handleToggleLayer}
          viewMode={viewMode}
          visibility={visibility}
        />
      </aside>
      <section className="map-stage">
        <MapView
          cellLayerMode={cellLayerMode}
          layerVisibility={visibility}
          settlementDisplayLevel={settlementDisplayLevel}
          onCoordinateChange={setCoordinateReadout}
          onZoomChange={setZoomReadout}
          resetToken={resetToken}
        />
        <footer className="attribution-footer" aria-label="Data attribution">
          <span>Data: GeoBoundaries, GADM, Natural Earth, OSM, FABDEM/Copernicus, ESA WorldCover.</span>
          <a href="/docs/ATTRIBUTION.md" rel="noopener noreferrer" target="_blank">
            Attribution
          </a>
        </footer>
      </section>
    </main>
  );
}
