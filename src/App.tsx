import { useState } from "react";
import {
  defaultLayerVisibility,
  LayerPanel,
  type LayerControlId,
  presetVisibility,
  type ViewMode,
} from "./components/LayerPanel";
import { appConfig, dataPaths, ukraineTheaterConfig } from "./config";
import { MapView } from "./map/MapView";

export default function App() {
  const [visibility, setVisibility] = useState(defaultLayerVisibility);
  const [viewMode, setViewMode] = useState<ViewMode>("terrain");
  const [resetToken, setResetToken] = useState(0);
  const [coordinateReadout, setCoordinateReadout] = useState<string | null>(null);

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
            Terrain-first offline mapping scaffold for Ukraine theater analysis.
          </p>
          <p className="sidebar__copy">
            Default hex radius: {appConfig.hexRadiusKm} km. Theater extent:
            {" "}
            {ukraineTheaterConfig.extent.west} to {ukraineTheaterConfig.extent.east}
            {" "}
            lon / {ukraineTheaterConfig.extent.south} to {ukraineTheaterConfig.extent.north}
            {" "}
            lat.
          </p>
          <p className="sidebar__copy">
            Processed data path: <code>{dataPaths.processedDir}</code>
          </p>
        </header>
        <LayerPanel
          coordinateReadout={coordinateReadout}
          onApplyPreset={handleApplyPreset}
          onReset={() => setResetToken((value) => value + 1)}
          onToggleLayer={handleToggleLayer}
          viewMode={viewMode}
          visibility={visibility}
        />
      </aside>
      <section className="map-stage">
        <MapView
          layerVisibility={visibility}
          onCoordinateChange={setCoordinateReadout}
          resetToken={resetToken}
        />
      </section>
    </main>
  );
}
