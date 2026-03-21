# River Gap Repair Workflow

This document describes how river/water mismatches are identified and repaired.

## Checklist Report

Primary report:

- `reports/river-water-gap-checklist.json`
- `reports/river-water-gap-checklist.md`

Generated with:

```bash
npm run data:analytics:river-gaps
```

This report is required for correct targeted river reconstruction.  
`data:layers:public` reads `reports/river-water-gap-checklist.json` and uses `flaggedHexes` as reconstruction targets.

The checklist flags hexes where river-line segments are not sufficiently covered by water polygons.

### How flagged hexes are determined

The checklist script (`scripts/analytics/report-river-water-gaps.mjs`) uses this flow:

1. Take long-enough river features from OSM cache and split them into line segments.
2. For each segment midpoint, find the containing hex and measure distance to nearest water polygon.
3. Mark the segment as covered if nearest water is within the configured threshold (`coveredDistanceKm`).
4. Aggregate per hex:
   - total river length
   - uncovered river length
   - uncovered percentage
   - rendered-river length gate (`requireRenderedRiverPresence` + `minRenderedRiverKm`)
5. Remove manually excluded hexes (`manuallyExcludedHexIds`).
6. Flag hexes that pass both thresholds:
   - uncovered length >= `flagMinUncoveredKm`
   - uncovered percent >= `flagMinUncoveredPct`
7. Apply manual forced-includes (`manuallyIncludedFlaggedHexIds`) and sort by severity.

Output report:

- `flaggedHexes`: active reconstruction target candidates
- `allHexStats`: full scored list after exclusions/gates

### Why final reconstruction scope can differ from the raw report

The pipeline intentionally applies manual curation layers, so not every raw candidate ends up in final reconstruction:

1. Analytics curation (report generation):
   - `manuallyExcludedHexIds`
   - `manuallyIncludedFlaggedHexIds`
   - Location: `scripts/analytics/report-river-water-gaps.mjs`
2. Build-time curation (targeted reconstruction):
   - `excludedTargetHexIds`
   - `forcedTargetHexIds`
   - Location: `scripts/layers/fetch-public-layers.mjs` (`buildTargetedHexRiverSystemReconstructionLayer`)

Result: users may not see all initially detected hexes in the final targeted-repair pass, by design.

## Reconstruction Flow

Current reconstruction in the public builder combines:

1. corridor gap fill using OSM river lines against current water polygons
2. focused reconstruction for known problematic hexes
3. targeted pilot reconstruction for reviewed hexes/areas

All reconstruction writes into normal `water-bodies` output (not a separate z12-only layer), so fixes are visible at regular map zoom behavior.

## Review Workflow

1. Rebuild layers (`data:layers:public`, optionally `--hex-only` during iteration).
2. Visually inspect repaired hexes in app.
3. Use `reports/river-water-gap-checklist.{json,md}` for review scope (the temporary in-app red hex overlay is removed).
4. Keep checklist exclusions aligned with approved user review decisions.
5. Only remove/adjust manual exclusions after review confirmation.

## Notes

- OSM rivers can be more detailed than displayed river-line layer inputs, so water reconstruction may surface valid branches not previously visible in rendered linework.
- Prefer targeted fixes first; expand only after review.
