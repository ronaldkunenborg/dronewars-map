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

## Expected source ids

- `theater-boundary`: Ukraine theater boundary polygon used to clip all later outputs.
- `oblast-boundaries`: reference oblast boundaries for grouping and labels.
- `osm-extract`: primary OpenStreetMap extract for roads, rail, water, and settlements.
- `landcover`: source for forests, wetlands, and open terrain.
- `elevation`: DEM input for hillshade, contours, and roughness.
- `hydrology-supplement`: optional supplemental hydrology dataset.

The intake step does not process the data yet. It only standardizes what files
exist in `data/raw` and where they are stored.

