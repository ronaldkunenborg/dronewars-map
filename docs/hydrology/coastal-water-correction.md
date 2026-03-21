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
4. Apply hex-level sea completion fallback in configured problem hexes: `seaInHex = hexArea - landMaskInHex`.
5. Apply ADM2 land/sea lockstep in configured hexes: inside those hexes, areas outside the ADM2-derived Ukraine border are rendered as sea, and country-fill is clipped to the same border.
6. Remove corrected sea space from inland water output (`water-bodies = water-bodies - correctedSeas`) so sea and inland polygons do not overlap.
7. (Optional/disabled by default) apply stricter hex-specific OSM sea override with area-ratio guard.

## Hex Sea Completion Fallback

For known bad coastal hexes where coarse sea geometry creates wedges or cut-lines, the builder can replace sea inside the hex using only land geometry:

- take the selected hex polygon,
- subtract land mask from that hex,
- write the remainder as sea in that hex.

This avoids dependence on coarse upstream sea polygon shape in that local area.

Current configured completion set includes Odessa + Crimea task hexes:

- `HX-E36-N22`
- `HX-E71-N12`
- `HX-E72-N11`
- `HX-E75-N12`
- `HX-E77-N12`

## Why Sea Completion And Lockstep Both Exist

Both mechanisms are needed because they solve different failure modes:

- `adm2LandSeaLockstepHexIds` enforces border-consistent land/sea behavior in selected hexes where Ukraine boundary geometry is present in the hex.
- `coastalSeaCompletionHexIds` is a local fallback that forces sea from the land mask in known bad coastal hexes, including cases where lockstep may not fully apply due to boundary-intersection edge cases in that hex.

Operational rule:

- keep lockstep as the broad consistency control,
- keep sea completion as a small curated safety net for stubborn coastal artifacts.

## Hex-Specific Override Guard

For an explicit problem hex, the builder can also attempt a local OSM-based sea replacement.  
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
- The current coastal stabilization uses curated hex ID lists (`adm2LandSeaLockstepHexIds` and `coastalSeaCompletionHexIds`). If hex size, grid alignment, or theater scope changes, these curated lists can become invalid and produce wrong coastal behavior until they are regenerated/reviewed.
