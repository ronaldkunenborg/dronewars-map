# ADR-0003: Coastal Dispute Hex Policy for Sea/Land Fill

- Status: Accepted
- Date: 2026-03-20

## Context

In Kerch/Crimea coastal hexes, coarse country polygon fill and sea polygons can conflict with the theater boundary interpretation derived from Ukraine ADM2 topology.

This caused visible artifacts:

- sea/land wedges in coastal hexes,
- land fill appearing where review expects sea,
- mismatch between the ADM0-derived theater boundary line and country-fill polygons.

## Decision

Use a targeted operational policy for known problematic coastal hexes:

1. Apply hex-level sea completion from land mask in selected coastal hexes (`seaInHex = hexArea - landMaskInHex`), instead of relying only on coarse upstream sea geometry there.
2. Apply a hex-specific country-fill exclusion for `HX-E72-N11`: suppress non-Ukraine `country-boundaries` fill in that hex (keep `UKR` if present).
3. Replace Ukraine `country-boundaries` fill geometry with the ADM2-derived Ukraine geometry so Ukraine land fill and theater boundary share one coastline truth.
4. Keep hex-specific exceptions scoped to configured hexes only; do not change non-Ukraine country-fill behavior globally outside those exception hexes.

Implementation note:

- Ukraine fill and theater boundary line must use the same boundary-geometry basis (`ukraineBoundaryGeometry`) to avoid line/fill coastal mismatch in review hexes.

Example impact:

- Odesa coastal hex `HX-E36-N22`: sea wedge artifacts were reduced by setting all areas outside the ADM2-derived border to sea within that hex.

## Consequences

- Coastal visuals in reviewed dispute hexes align with theater-boundary interpretation.
- Existing border behavior in unrelated hexes is preserved.
- This is an operational fix, not a final source-harmonization solution; long-term coastal source upgrade remains tracked under coastal tasks.
