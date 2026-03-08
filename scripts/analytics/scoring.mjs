export const scoringConfig = {
  baseCapacity: 7500,
  roadDensityBonus: 900,
  railBonus: 800,
  settlementBonus: 250,
  openTerrainBonus: 1200,
  waterPenalty: 1800,
  wetlandPenalty: 1500,
  forestPenalty: 1100,
  roughnessPenalty: 1000,
  minCapacity: 1500,
  maxCapacity: 12000,
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function computeEffectiveCapacity(summary) {
  const rawCapacity =
    scoringConfig.baseCapacity +
    summary.roadDensity * scoringConfig.roadDensityBonus +
    (summary.railPresence ? scoringConfig.railBonus : 0) +
    summary.settlementScore * scoringConfig.settlementBonus +
    summary.openTerrainCoverage * scoringConfig.openTerrainBonus -
    (summary.waterBarrierPresence ? scoringConfig.waterPenalty : 0) -
    summary.wetlandCoverage * scoringConfig.wetlandPenalty -
    summary.forestCoverage * scoringConfig.forestPenalty -
    summary.elevationRoughness * scoringConfig.roughnessPenalty;

  return clamp(rawCapacity, scoringConfig.minCapacity, scoringConfig.maxCapacity);
}

export function computeMobilityScore(summary) {
  const rawScore =
    45 +
    summary.roadDensity * 20 +
    (summary.railPresence ? 10 : 0) +
    summary.openTerrainCoverage * 18 -
    summary.wetlandCoverage * 22 -
    summary.elevationRoughness * 18 -
    (summary.waterBarrierPresence ? 12 : 0);

  return clamp(Math.round(rawScore), 0, 100);
}

export function computeDefensibilityScore(summary) {
  const rawScore =
    35 +
    summary.forestCoverage * 20 +
    summary.wetlandCoverage * 10 +
    summary.elevationRoughness * 18 +
    (summary.waterBarrierPresence ? 15 : 0) -
    summary.openTerrainCoverage * 12;

  return clamp(Math.round(rawScore), 0, 100);
}

