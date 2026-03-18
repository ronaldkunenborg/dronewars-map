# Coastal Water Correction Workflow

This document explains how sea/land mismatches are corrected during public layer builds.

## Goal

Fix cases where:

- sea polygons overlap visible land,
- inland water appears in sea space, or
- coastal seams look inconsistent across neighboring hexes.

Primary examples include Odessa/Crimea coastal hexes (for example `HX-E36-N22` and nearby Black Sea/Azov strips).

## Inputs

The correction flow combines:

1. `seas` polygons (Natural Earth source)
2. `water-bodies` polygons (OSM-derived cache inputs)
3. land/admin geometry used to construct a theater coastal land mask

## Processing Flow

1. Build a theater coastal land mask from boundary geometry (including higher-detail Ukraine geometry where available).
2. Correct sea polygons by subtracting the land mask (`correctedSeas = seas - landMask`).
3. Clip corrected sea and water polygons to the current build bbox (geometry clipping, not just bbox-intersection filtering).
4. Remove corrected sea space from inland water output (`water-bodies = water-bodies - correctedSeas`) so sea and inland polygons do not overlap.
5. Apply hex-specific coastal fallback only where explicitly configured (currently Odessa test hex), with safety guards.

## Hex-Specific Fallback Guard

For an explicit problem hex, the builder can attempt a local OSM-based sea replacement.  
This fallback is constrained by an area-ratio sanity check to avoid over-removing sea:

- apply only when replacement area is reasonably close to the existing corrected sea area,
- skip and keep base corrected sea if ratio is out of bounds.

Typical log lines:

- `Sea override applied for HX-...`
- `Sea override skipped for HX-...`

## Important Behavior Notes

- Rivers do not define coastline geometry. Coastline behavior comes from sea + water polygon processing.
- This flow reuses cached source data during normal runs. External refreshes should only happen when explicitly requested.
- This is the operational fix track; long-term higher-detail coastal source replacement is tracked separately in tasks.
