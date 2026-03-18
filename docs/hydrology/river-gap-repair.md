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

The checklist flags hexes where river-line segments are not sufficiently covered by water polygons.

## Reconstruction Flow

Current reconstruction in the public builder combines:

1. corridor gap fill using OSM river lines against current water polygons
2. focused reconstruction for known problematic hexes
3. targeted pilot reconstruction for reviewed hexes/areas

All reconstruction writes into normal `water-bodies` output (not a separate z12-only layer), so fixes are visible at regular map zoom behavior.

## Review Workflow

1. Rebuild layers (`data:layers:public`, optionally `--hex-only` during iteration).
2. Visually inspect repaired hexes in app.
3. Keep checklist exclusions aligned with approved user review decisions.
4. Only remove/adjust manual exclusions after review confirmation.

## Notes

- OSM rivers can be more detailed than displayed river-line layer inputs, so water reconstruction may surface valid branches not previously visible in rendered linework.
- Prefer targeted fixes first; expand only after review.
