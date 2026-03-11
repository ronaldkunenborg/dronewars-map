# Layer Build

This step turns normalized inputs plus the registered OSM extract into
app-facing processed layers under `data/processed`.

## Commands

```bash
npm run data:layers:plan
```

Writes `data/processed/layer-build-plan.json` with the layer recipes.

```bash
npm run data:layers
```

Builds the initial processed layers:

- `layers/theater-boundary.geojson`
- `layers/oblast-boundaries.geojson`
- `layers/rivers.geojson`
- `layers/water-bodies.geojson`
- `layers/wetlands.geojson`
- `layers/forests.geojson`
- `layers/roads.geojson`
- `layers/railways.geojson`
- `layers/settlements.geojson`
- `terrain/elevation-clipped.tif`
- `terrain/landcover-clipped.tif`
- `terrain/hillshade-clipped.png`
- `layers.json`

Notes:

- The OSM-themed layers are extracted via `ogr2ogr` SQL from the registered OSM extract.
- Forests and wetlands are initially sourced from OSM tags; later tasks can fuse in landcover-derived layers if needed.
- Elevation and landcover rasters are carried through as terrain inputs for later contour and scoring work.
- Hillshade is generated during preprocessing and copied into the app-facing terrain output set.

## Public fallback

```bash
npm run data:layers:public
```

Downloads a minimal public fallback layer set for Ukraine into
`data/processed/layers` and writes `data/processed/layers.json`.

This is intended to get visible map content on screen when the full OSM/GDAL
pipeline inputs are not available yet.

To run only elevation + hillshade acquisition through the same cache system:

```bash
npm run data:intake:elevation
```
