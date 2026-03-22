# Wetlands Corridor Enhancement (Task 76)

This document describes the inland wetland enhancement implemented in `data:layers:public`.

## Goal

Increase wetland indicators near river/water corridors relevant to mechanized mobility, without broadly adding non-river inland wetland clutter.

## Problem Observed

Raw OSM wetland coverage includes many fragmented polygons.  
Before this change, the public build retained only larger wetlands (`>= 2 km²` approx bbox area), which removed most small floodplain fragments.

## Current Processing Rule

Wetlands are built in two passes:

1. Baseline wetlands:
   - fetch OSM wetland candidates
   - keep large features (`>= 2 km²`) as normal baseline wetlands

2. Corridor enhancement:
   - take small wetland candidates (`< 2 km²`)
   - keep only candidates near processed `water-bodies` (primary corridor mask)
   - merge nearby candidates into local clusters
   - append clusters that pass a lower retained-area threshold

Result: more visible wetland indicators near mapped river/water corridors while preserving controlled inland noise.

## Current Parameters

Defined in `scripts/layers/fetch-public-layers.mjs`:

- baseline wetland threshold: `wetlandMinApproxAreaKm2 = 2`
- corridor distance from processed `water-bodies`: `wetlandCorridorDistanceKm = 0.5`
- candidate merge distance: `wetlandCorridorMergeDistanceKm = 0.5`
- minimum retained merged-cluster area: `wetlandCorridorMinClusterAreaKm2 = 0.2`

## Scope

- Applied in normal `data:layers:public` builds (global and `--hex-only` scoped runs).
- Uses processed `water-bodies` after hydrology/coastal correction so corridor behavior matches the rendered water layer.

## Notes

- This is inland/non-coastal wetland improvement; sea-land border correction remains separate.
- For quick visual tests, prefer nearby `--hex-only` selections to keep fetch bbox small and iteration fast.
