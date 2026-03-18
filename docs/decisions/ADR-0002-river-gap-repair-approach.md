# ADR-0002: River Gap Repair Uses OSM Lines + Polygon Reconstruction

- Status: Accepted
- Date: 2026-03-18

## Context

River-line visibility and water-body polygons can diverge in problematic hexes. Visual-only line detail is insufficient when polygon hydrology remains disconnected.

## Decision

Use OSM river-line detail as input to reconstruct missing water-body corridors in targeted repair workflows.

The reconstructed geometries are written into normal `water-bodies` output, so fixes are visible at standard map zoom behavior.

## Consequences

- Better alignment between expected river system continuity and polygon hydrology
- Targeted repair runs can fix localized systems without full-theater retuning
- Review-driven exclusions remain available until users approve final cleanup
