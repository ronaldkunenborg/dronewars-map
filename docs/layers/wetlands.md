# Wetlands (`layers/wetlands.geojson`)

## Source and cache

- Source: Overpass tiled wetland pull (`overpass/wetlands/*`) using `natural=wetland` and `wetland=*`
- Cache behavior: tiled cache reused unless refreshed

## Processing

1. Baseline large wetlands retained.
2. Small wetland fragments are corridor-filtered using processed `water-bodies`.
3. Nearby corridor fragments are merged and appended with lower retained-area threshold.

## Output role

- Operational wet/soft-ground indicator layer.

## Known limits

- Corridor parameters are heuristic and may miss isolated non-river wet terrain.
- Small-shape simplification can still remove micro-features.

## Solved issues already captured

- Increased inland wetland signal near river/water corridors without broad noisy expansion.
