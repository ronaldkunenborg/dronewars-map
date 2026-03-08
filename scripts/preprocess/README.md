# Preprocessing

The preprocessing step clips and normalizes raw geographic inputs into
`data/processed`.

## Requirements

- Raw sources registered under `data/raw`
- GDAL tools available on `PATH`
  - `ogr2ogr`
  - `gdalwarp`

## Commands

```bash
npm run data:preprocess:plan
```

Writes `data/processed/preprocess-plan.json` so the intended pipeline is visible
before running it.

```bash
npm run data:preprocess
```

Runs clipping and normalization:

- vector layers are converted to GeoJSON and normalized to `EPSG:4326`
- raster layers are clipped to the theater boundary and reprojected to `EPSG:4326`

This step establishes the repeatable geometry-preparation stage. Later tasks can
extend the layer list and add thematic extraction from the normalized outputs.

