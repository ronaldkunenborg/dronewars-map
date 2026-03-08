# Hex Grid

This stage creates the operational cell grid and enriches it with base metadata.

## Commands

```bash
npm run data:hex:generate
```

Generates `data/processed/hex-grid.geojson` from the configured theater extent and
hex radius.

```bash
npm run data:hex:enrich
```

Reads `hex-grid.geojson` and writes `data/processed/hex-cells.geojson` with:

- `id`
- `q`
- `r`
- `centroid`
- `areaKm2`
- `parentRegionId`
- `parentRegionName`
- `adjacencyIds`

Notes:

- The generator filters by theater extent and, when available, by the processed theater boundary layer.
- Parent-region assignment uses centroid-in-polygon checks against processed oblast boundaries.
- The default hex radius is currently `12 km`, matching the application scaffold.

