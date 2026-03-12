# Scripts

This directory is reserved for data intake, preprocessing, hex generation, and
analytics scripts that will be added in later tasks.

Current intake scripts:

- `scripts/intake/prepare-raw.mjs`: create the raw-data directory layout and write a source manifest.
- `scripts/intake/register-raw-source.mjs`: copy a source file into its expected location under `data/raw`.
- `scripts/intake/bootstrap-raw.mjs`: reproducibly fetch/prepare minimum raw inputs (`theater-boundary`, `oblast-boundaries`, `osm-extract`, `elevation`, `landcover`) using cached public sources.

Elevation acquisition is handled through the public-source cache pipeline:

- `npm run data:intake:elevation` (runs `scripts/layers/fetch-public-layers.mjs --elevation-only`)
- `npm run data:intake:bootstrap` (runs full raw intake bootstrap; supports `--refresh` and `--skip-*` flags)

Current preprocess scripts:

- `scripts/preprocess/plan-preprocess.mjs`: write a visible processing plan to `data/processed/preprocess-plan.json`.
- `scripts/preprocess/run-preprocess.mjs`: clip and normalize registered raw inputs into `data/processed` using GDAL tools.

Current layer-build scripts:

- `scripts/layers/plan-layers.mjs`: write the processed-layer recipe plan.
- `scripts/layers/build-layers.mjs`: extract named app-facing layers into `data/processed/layers` and `data/processed/terrain`.

Current hex scripts:

- `scripts/hex/generate-hex-grid.mjs`: generate the operational hex grid from the configured theater extent and hex radius.
- `scripts/hex/enrich-hex-grid.mjs`: assign IDs, centroids, areas, adjacency, and parent oblasts to the generated hex grid.

Current analytics scripts:

- `scripts/analytics/compute-cell-analytics.mjs`: derive terrain/infrastructure summaries and initial operational scores for each hex.
- `scripts/analytics/scoring.mjs`: tunable heuristic scoring constants and formulas for capacity, mobility, and defensibility.
- `scripts/analytics/investigate-elevation-thresholds.mjs`: compare low-elevation cutoff impacts on cell coverage and connectivity.
- `scripts/analytics/benchmark-dem-resolutions.mjs`: benchmark 30m/60m/90m DEM outputs on a subset theater geometry for runtime, size, and detail tradeoffs.

Current export scripts:

- `scripts/export/export-hex-dataset.mjs`: publish the analytics-enriched hex dataset to the canonical app-facing path.
