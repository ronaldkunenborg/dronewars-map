# Forests (`layers/forests.geojson`)

## Source and cache

- Source: Overpass tiled pulls for `landuse=forest` and `natural=wood` (`overpass/forests/*`)
- Cache behavior: tiled cache reused unless refreshed

## Processing

1. Tiled polygon fetch with dedupe merge.
2. Area/vertex simplification thresholds applied.
3. Clip to extent and hex mask where used.

## Output role

- Forest/woodland terrain overlay.

## Known limits

- Overpass polygon completeness and complexity can vary by tile.
- Geometry warnings from source polygons can occur (`non closed ring`), typically non-fatal.

## Solved issues already captured

- Parallel tile fetching and deterministic merge reduced build time and variability.
