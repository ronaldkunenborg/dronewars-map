# Preprocessing

The preprocessing step clips and normalizes raw geographic inputs into
`data/processed`.

## Requirements

- Raw sources registered under `data/raw`
- GDAL tools available on `PATH`
  - `ogr2ogr`
  - `gdalwarp`
  - `gdaldem`
  - `gdal_translate`

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
- elevation is clipped to the full theater extent (`22.0,44.0` to `40.5,52.5`) and reprojected to `EPSG:4326`
- landcover is clipped to the theater boundary and reprojected to `EPSG:4326`
- hillshade is generated from the clipped elevation raster and exported as both GeoTIFF and PNG

This step establishes the repeatable geometry-preparation stage. Later tasks can
extend the layer list and add thematic extraction from the normalized outputs.
