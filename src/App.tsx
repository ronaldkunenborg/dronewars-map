import { useState } from "react";
import {
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
  const [settlementDisplayLevel, setSettlementDisplayLevel] =
    useState<SettlementDisplayLevel>("villages");
  const [resetToken, setResetToken] = useState(0);
  const [coordinateReadout, setCoordinateReadout] = useState<string | null>(null);
  const [zoomReadout, setZoomReadout] = useState<string | null>(null);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [attributionContent, setAttributionContent] = useState<string | null>(null);
  const [attributionError, setAttributionError] = useState<string | null>(null);

  async function openAttributionPanel() {
    setAttributionOpen(true);
    if (attributionContent !== null || attributionError !== null) {
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}docs/ATTRIBUTION.md`, {
        headers: {
          Accept: "text/markdown,text/plain,*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load attribution (${response.status}).`);
      }

      setAttributionContent(await response.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load attribution.";
      setAttributionError(message);
    }
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
          coordinateReadout={coordinateReadout}
          zoomReadout={zoomReadout}
          settlementDisplayLevel={settlementDisplayLevel}
          onApplyPreset={handleApplyPreset}
          onChangeSettlementDisplayLevel={setSettlementDisplayLevel}
          onReset={() => setResetToken((value) => value + 1)}
          onToggleLayer={handleToggleLayer}
          viewMode={viewMode}
          visibility={visibility}
        />
      </aside>
      <section className="map-stage">
        <MapView
          layerVisibility={visibility}
          settlementDisplayLevel={settlementDisplayLevel}
          onCoordinateChange={setCoordinateReadout}
          onZoomChange={setZoomReadout}
          resetToken={resetToken}
        />
        <footer className="attribution-chip" aria-label="Data attribution">
          <a
            className="attribution-chip__link"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              void openAttributionPanel();
            }}
          >
            Map data sources
          </a>
        </footer>
        {attributionOpen ? (
          <div
            className="dialog-backdrop"
            onClick={() => setAttributionOpen(false)}
            role="presentation"
          >
            <section
              aria-label="Map data sources attribution"
              className="dialog-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="dialog-panel__header">
                <h2>Map data sources</h2>
                <button
                  className="dialog-panel__close"
                  onClick={() => setAttributionOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </header>
              <div className="dialog-panel__content">
                {attributionError ? (
                  <p>{attributionError}</p>
                ) : attributionContent === null ? (
                  <p>Loading attribution...</p>
                ) : (
                  <pre>{attributionContent}</pre>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
