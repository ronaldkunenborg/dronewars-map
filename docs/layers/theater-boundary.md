# Theater Boundary (`layers/theater-boundary.geojson`)

## Source and cache

- Source stack: GADM ADM2 polygons (`data/cache/public-sources/gadm41_UKR_ADM2.geojson` via `loadAdm2Subdivisions`)
- Cache behavior: read from local cache file, no per-run network call when file exists

## Processing

1. ADM2 polygons are dissolved/topologized.
2. Outer ADM2 edges become the Ukraine theater boundary geometry.
3. Geometry is written as line output and clipped for `--hex-only` when used.

## Output role

- Primary authoritative theater border line for map rendering and scope masking.

## Known limits

- Precision is limited by ADM2 source geometry quality.
- Any ADM2 source update can shift downstream boundary line topology.

## Solved issues already captured

- Removed dependence on coarse Natural Earth UKR border for theater rendering.
- Stabilized cross-zoom border consistency by deriving from one topology stack.
