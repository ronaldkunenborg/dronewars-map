type LngLat = [number, number];

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
  } | null;
  baseCapacity: number | null;
  effectiveCapacity: number | null;
  assignedForceCount: number | null;
  mobilityScore: number | null;
  defensibilityScore: number | null;
};

type HexInspectorProps = {
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
      <p><strong>Hex:</strong> {selectedHex.hexId}</p>
      <p><strong>Region:</strong> {selectedHex.parentRegionName}</p>
      <p><strong>Area:</strong> {formatNumber(selectedHex.areaKm2, 1)} km²</p>
      <p><strong>Centroid:</strong> {formatLngLat(selectedHex.centroidLngLat)}</p>
      <p><strong>True center:</strong> {formatLngLat(selectedHex.trueCenterLngLat)}</p>

      <h3>Capacity</h3>
      <p><strong>Base capacity:</strong> {formatNumber(selectedHex.baseCapacity)}</p>
      <p><strong>Effective capacity:</strong> {formatNumber(selectedHex.effectiveCapacity)}</p>
      <p><strong>Assigned force count:</strong> {formatNumber(selectedHex.assignedForceCount)}</p>
      <p><strong>Mobility score:</strong> {formatNumber(selectedHex.mobilityScore)}</p>
      <p><strong>Defensibility score:</strong> {formatNumber(selectedHex.defensibilityScore)}</p>

      <h3>Terrain</h3>
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

      <h3>Infrastructure</h3>
      <p><strong>Road density:</strong> {formatNumber(selectedHex.infrastructureSummary?.roadDensity ?? null, 3)}</p>
      <p>
        <strong>Rail presence:</strong>{" "}
        {formatBoolean(selectedHex.infrastructureSummary?.railPresence ?? null, "Present", "Absent")}
      </p>
      <p><strong>Settlement score:</strong> {formatNumber(selectedHex.infrastructureSummary?.settlementScore ?? null)}</p>
    </div>
  );
}
