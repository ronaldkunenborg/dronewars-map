# Raw Data Intake

Use the intake scripts to create the expected folder structure and register
source files in consistent locations.

## Prepare the raw-data workspace

```bash
npm run data:intake:prepare
```

This creates category folders under `data/raw/` and writes
`data/raw/source-manifest.json`.

## Register a raw source file

```bash
npm run data:intake:register -- <source-id> <path-to-file>
```

Example:

```bash
npm run data:intake:register -- osm-extract D:/gis/ukraine-latest.osm.pbf
```

## Acquire elevation automatically

```bash
npm run data:intake:elevation
```

This command acquires `data/raw/terrain/ukraine-elevation.tif` for the full
displayed theater extent (`22.0,44.0` to `40.5,52.5`) using:

1. FABDEM 30m (preferred)
2. Copernicus GLO-30 (fallback)

It also writes source metadata to
`data/raw/terrain/ukraine-elevation.source.json`.

It runs through the existing public-source cache pipeline, so cached entries are
visible in:

```bash
npm run data:layers:public -- --cache-report
```

Requirement: GDAL tools (`gdalwarp`, `gdaldem`, `gdal_translate`) must be available on `PATH`.

## Expected source ids

- `theater-boundary`: Ukraine theater boundary polygon used to clip all later outputs.
- `oblast-boundaries`: reference oblast boundaries for grouping and labels.
- `osm-extract`: primary OpenStreetMap extract for roads, rail, water, and settlements.
- `landcover`: source for forests, wetlands, and open terrain.
- `elevation`: DEM input for hillshade, contours, and roughness.
- `hydrology-supplement`: optional supplemental hydrology dataset.

The intake step does not process the data yet. It only standardizes what files
exist in `data/raw` and where they are stored.
