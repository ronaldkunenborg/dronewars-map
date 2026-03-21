type LngLat = [number, number];

export type HexInspectorDebugData = {
  hexId: string;
  trueCenterLngLat: LngLat | null;
  trueCenterPixels: [number, number] | null;
  clickLngLat: LngLat;
  clickPixels: [number, number];
  deltaTrueCenterPixels: [number, number] | null;
  clickToTrueCenterKm: number | null;
};

export type HexInspectorData = {
  hexId: string;
  parentRegionName: string;
  areaKm2: number | null;
  centroidLngLat: LngLat | null;
  trueCenterLngLat: LngLat | null;
  terrainSummary: {
    dominantTerrain: string;
    seaCoverage: number | null;
    forestCoverage: number | null;
    wetlandCoverage: number | null;
    openTerrainCoverage: number | null;
    waterBarrierPresence: boolean | null;
    elevationRoughness: number | null;
  } | null;
  infrastructureSummary: {
    roadDensity: number | null;
    railPresence: boolean | null;
    settlementScore: number | null;
    strongestPlaceScore: number | null;
  } | null;
  baseCapacity: number | null;
  effectiveCapacity: number | null;
  assignedForceCount: number | null;
  mobilityScore: number | null;
  defensibilityScore: number | null;
};

type HexInspectorProps = {
  debugInfo?: HexInspectorDebugData | null;
  hexRadiusKm?: number;
  selectedHex: HexInspectorData | null;
  title?: string;
};

function formatNumber(value: number | null, digits = 0) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(digits);
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatBoolean(value: boolean | null, trueLabel: string, falseLabel: string) {
  if (value === null) {
    return "n/a";
  }

  return value ? trueLabel : falseLabel;
}

function formatLngLat(value: LngLat | null) {
  if (!value) {
    return "n/a";
  }

  return `${value[0].toFixed(6)}, ${value[1].toFixed(6)}`;
}

export function HexInspector({
  debugInfo = null,
  hexRadiusKm,
  selectedHex,
  title = "Cell Inspector",
}: HexInspectorProps) {
  if (!selectedHex) {
    return (
      <div className="hex-inspector hex-inspector--empty">
        <h2>{title}</h2>
        <p>Click a hex to inspect terrain, infrastructure, and capacity analytics.</p>
      </div>
    );
  }

  return (
    <div className="hex-inspector">
      <h2>{title}</h2>
      <details className="hex-inspector__section" open>
        <summary>Summary</summary>
        <div className="hex-inspector__section-body">
          <p><strong>Hex:</strong> {selectedHex.hexId}</p>
          <p><strong>Hex radius:</strong> {hexRadiusKm ?? "n/a"} km</p>
          <p><strong>Region:</strong> {selectedHex.parentRegionName}</p>
          <p><strong>Area:</strong> {formatNumber(selectedHex.areaKm2, 1)} km²</p>
          <p><strong>Centroid:</strong> {formatLngLat(selectedHex.centroidLngLat)}</p>
          <p><strong>True center:</strong> {formatLngLat(selectedHex.trueCenterLngLat)}</p>
        </div>
      </details>

      <details className="hex-inspector__section">
        <summary>Terrain</summary>
        <div className="hex-inspector__section-body">
          <p><strong>Dominant terrain:</strong> {selectedHex.terrainSummary?.dominantTerrain ?? "n/a"}</p>
          <p><strong>Sea coverage:</strong> {formatPercent(selectedHex.terrainSummary?.seaCoverage ?? null)}</p>
          <p><strong>Forest coverage:</strong> {formatPercent(selectedHex.terrainSummary?.forestCoverage ?? null)}</p>
          <p><strong>Wetland coverage:</strong> {formatPercent(selectedHex.terrainSummary?.wetlandCoverage ?? null)}</p>
          <p><strong>Open terrain:</strong> {formatPercent(selectedHex.terrainSummary?.openTerrainCoverage ?? null)}</p>
          <p>
            <strong>Water barrier:</strong>{" "}
            {formatBoolean(selectedHex.terrainSummary?.waterBarrierPresence ?? null, "Present", "Absent")}
          </p>
          <p><strong>Elevation roughness:</strong> {formatNumber(selectedHex.terrainSummary?.elevationRoughness ?? null, 3)}</p>
        </div>
      </details>

      <details className="hex-inspector__section">
        <summary>Infrastructure</summary>
        <div className="hex-inspector__section-body">
          <p><strong>Road density:</strong> {formatNumber(selectedHex.infrastructureSummary?.roadDensity ?? null, 3)}</p>
          <p>
            <strong>Rail presence:</strong>{" "}
            {formatBoolean(selectedHex.infrastructureSummary?.railPresence ?? null, "Present", "Absent")}
          </p>
          <p><strong>Settlement score:</strong> {formatNumber(selectedHex.infrastructureSummary?.settlementScore ?? null)}</p>
          <p><strong>Strongest settlement class:</strong> {formatNumber(selectedHex.infrastructureSummary?.strongestPlaceScore ?? null)}</p>
        </div>
      </details>

      <details className="hex-inspector__section">
        <summary>Capacity</summary>
        <div className="hex-inspector__section-body">
          <p><strong>Base capacity:</strong> {formatNumber(selectedHex.baseCapacity)}</p>
          <p><strong>Effective capacity:</strong> {formatNumber(selectedHex.effectiveCapacity)}</p>
          <p><strong>Assigned force count:</strong> {formatNumber(selectedHex.assignedForceCount)}</p>
          <p><strong>Mobility score:</strong> {formatNumber(selectedHex.mobilityScore)}</p>
          <p><strong>Defensibility score:</strong> {formatNumber(selectedHex.defensibilityScore)}</p>
        </div>
      </details>

      <details className="hex-inspector__section">
        <summary>Debug</summary>
        <div className="hex-inspector__section-body">
          {debugInfo ? (
            <>
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
            </>
          ) : (
            <p>Click inside a hex to inspect generated true-center debug details.</p>
          )}
        </div>
      </details>
    </div>
  );
}
