# Dronewars Map

Offline-first operational map prototype for Ukraine built around a terrain-first basemap and brigade-scale operational hex cells.

## Current Status

The project currently includes:

- a Vite + React + TypeScript + MapLibre application shell
- a generated operational hex grid with analytics fields
- a user-facing cell inspector with click selection and cell highlighting
- a clickable hex debug panel
- UI controls for presets, layer toggles, reset-to-Ukraine, legend, and coordinate readout
- a settlements display-level selector (`Cities`, `Cities + Towns`, `Cities + Towns + Villages`)
- a cell-layer mode switch between `Hex` and `Voronoi`
- lightweight overlay slots for future frontlines, zones of control, artillery ranges, logistics routes, and force placement
- a public-source data pipeline that generates and refreshes visible map layers using cached upstream downloads
- a cached fetch path so repeated rebuilds reuse prior downloads instead of refetching everything

The project is intentionally built around public-source layers (GeoBoundaries, Natural Earth, Overpass, WorldCover) as its operational data foundation.
Remaining limitations are mostly about tooling maturity and optional overlays, not a planned replacement of the source stack.

- terrain layers are generated from public OSM/Overpass and WorldCover-backed sources
- the current debug panel is still a temporary diagnostic tool
- the future overlays are scaffolded but not populated with real data yet

## Install and Run

```bash
npm install
npm run dev
```

The dev server will print a local URL such as:

```bash
http://127.0.0.1:5173
```

For a production build:

```bash
npm run build
```

Build output notes (Windows / Dropbox-safe default):

- by default, Vite build artifacts are written to `C:\temp\dronewars-map-dist` (instead of project-local `dist/`)
- this avoids Dropbox file-lock interference during output cleanup/rewrite
- override the output directory with `DRONEWARS_BUILD_OUT_DIR` when needed

Example override:

```powershell
$env:DRONEWARS_BUILD_OUT_DIR='C:/temp/custom-dronewars-dist'
npm run build
```

## What You Should See

With the current processed data, the app should show:

- a terrain/reference map of Ukraine
- operational hex cells
- water, seas, forests, wetlands, roads, railways, settlements, theater boundary, and oblast boundaries
- raion-level oblast subdivisions at medium/high zoom
- major-city urban extents beneath city labels
- optional city-seeded Voronoi operational cells (when `Cell Layer` is set to `Voronoi`)
- single dominant country labels (with Ukraine emphasized) that stay visible but become more subdued on zoom-in
- oblast labels that appear at higher zoom and are smaller/subordinate to country labels
- sidebar controls for visibility and presets
- a cell inspector in the top-left after clicking a hex
- a hex debug panel in the top-right

At the moment, the processed layers provide:

- theater boundary
- oblast boundaries
- oblast subdivisions (ADM2 / raion fallback)
- rivers
- water bodies
- seas
- forests
- wetlands
- roads
- railways
- major-city urban areas
- settlements
- settlement voronoi cells (city-seeded)

## Data Workflow

There are currently two data paths in the repository.

External source inventory, usage purpose, and fair-use/licensing notes are documented in:

- [EXTERNAL_SOURCES.md](EXTERNAL_SOURCES.md)

### 1. Primary Public-Source Pipeline

This is the primary pipeline for this project and the recommended way to build map content.

```bash
npm run data:layers:public
```

This downloads or reuses cached public Ukraine boundary, Natural Earth, and Overpass layers and writes:

- `data/processed/layers.json`
- `data/processed/layers/*.geojson`

This is what the app uses for visible thematic content. The public builder combines:

- GeoBoundaries metadata/endpoints for ADM0/ADM1 support inputs, with rendered Ukraine administrative linework built from cached GADM ADM2 topology (ADM0 outer, ADM1 shared, ADM2 internal) for cross-level coherence
- Natural Earth for rivers, lakes, seas, roads, railways, and urban areas
- OSM Overpass for settlements, forests, and wetlands
- ESA WorldCover raster fallback for landcover visualization in the map shell

Public-source cache behavior:

- cached source responses live under `data/cache/public-sources`
- cache entries are valid for one year from write time
- cache entries are also invalidated when the script-level cache schema version changes
- the cache directory is ignored by Git

Useful public builder commands:

```bash
node scripts/layers/fetch-public-layers.mjs --cache-report
node scripts/layers/fetch-public-layers.mjs --elevation-only
node scripts/layers/fetch-public-layers.mjs --refresh
node scripts/layers/fetch-public-layers.mjs --refresh=natural-earth
node scripts/layers/fetch-public-layers.mjs --refresh=elevation
node scripts/layers/fetch-public-layers.mjs --refresh=overpass/settlements
node scripts/layers/fetch-public-layers.mjs --smoke-test=static
node scripts/layers/fetch-public-layers.mjs --smoke-test=settlements
node scripts/layers/fetch-public-layers.mjs --smoke-test=wetlands
node scripts/layers/fetch-public-layers.mjs --smoke-test=forests
node scripts/layers/fetch-public-layers.mjs --smoke-test=water-bodies
```

Hex-scoped rebuilds (fast local iteration):

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50,HX-W18-N50
```

Notes for `--hex-only`:

- vector outputs are clipped/filtered to the selected hex mask (polygons clipped, points filtered to inside mask, lines filtered to features intersecting the mask)
- this option is intended for local debugging/iteration runs, not full-theater production outputs
- if `osm/rivers/pbf-lines` or `osm/water-bodies/pbf-extract` were previously cached for a larger extent, a hex-only run may still process larger cached inputs; force a scoped refresh when needed:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50 --refresh=osm/rivers/pbf-lines,osm/water-bodies/pbf-extract
```

Raw intake bootstrap command (clean checkout preparation for local preprocess/layer builds):

```bash
npm run data:intake:bootstrap
```

This prepares `data/raw/*` for:

- `theater-boundary` (GeoBoundaries ADM0)
- `oblast-boundaries` (GeoBoundaries ADM1)
- `osm-extract` (Geofabrik Ukraine PBF)
- `elevation` (FABDEM 30m preferred, Copernicus fallback via the existing elevation intake path)
- `landcover` (ESA WorldCover mosaic clipped to theater extent)

Optional bootstrap controls:

```bash
npm run data:intake:bootstrap -- --refresh
npm run data:intake:bootstrap -- --refresh=landcover
npm run data:intake:bootstrap -- --skip-osm --skip-landcover
```

Refresh expectations:

- a normal rerun of `npm run data:layers:public` should mostly report `cache hit` once the cache is warm
- use `--refresh` only when you intentionally want to replace cached upstream responses
- use `--cache-report` to see which source payloads are ready, missing, expired, or on an older schema
- `--elevation-only` acquires cached elevation/hillshade via FABDEM 30m first, then Copernicus GLO-30 fallback

### OSGeo4W (Windows GDAL/PROJ)

Elevation and hillshade generation rely on GDAL tools (`gdalwarp`, `gdaldem`, `gdal_translate`, `gdal2tiles`).

Install these OSGeo4W packages at minimum:

- `gdal`
- `gdal312-runtime` (or the runtime matching your installed GDAL package line)
- `proj`
- `proj-runtime-data`
- `proj-data`

Needed for tiled hillshade (`gdal2tiles`):

- `python3-gdal`

This project resolves GDAL tools from an explicit OSGeo path. Set this before running elevation commands:

```powershell
$env:OSGEO4W_BIN='C:\OSGeo4W\bin'
```

Quick verification (all should run without loader/proj errors):

```powershell
C:\OSGeo4W\bin\gdalinfo.exe --version
C:\OSGeo4W\bin\proj.exe
C:\OSGeo4W\bin\projinfo.exe EPSG:3857
C:\OSGeo4W\bin\sqlite3.exe C:\OSGeo4W\share\proj\proj.db "select * from metadata where key in ('PROJ.VERSION','DATABASE.LAYOUT.VERSION.MAJOR','DATABASE.LAYOUT.VERSION.MINOR');"
```

Expected `proj.db` characteristics in a healthy modern install:

- `DATABASE.LAYOUT.VERSION.MINOR` should be `>= 4` (recent installs typically show `6`)
- `PROJ.VERSION` should match your current PROJ package family (for example `9.8.0`)

If setup reports `upgrades from old installation not supported, please do a fresh install`, do a clean reinstall into an empty root (`C:\OSGeo4W`) instead of in-place upgrade.

## Documentation Structure

Detailed docs are now split under `docs/` and indexed here:

- [Documentation Index](docs/INDEX.md)
- [Windows OSGeo4W Setup](docs/setup/windows-osgeo4w.md)
- [Public Layer Builder](docs/pipeline/public-layer-builder.md)
- [Full Local Layer Builder](docs/pipeline/full-local-builder.md)
- [River Gap Repair Workflow](docs/hydrology/river-gap-repair.md)
- [Analytics Reports](docs/reports/analytics-reports.md)
- [External Sources Policy](docs/data/external-sources.md)
- [Map Layers and Controls](docs/ui/map-layers-and-controls.md)
- [Tasks and Governance](docs/dev/tasks-and-governance.md)
- [Decisions (ADRs)](docs/decisions)

Important runtime consistency notes from recent fixes:

- do not mix multiple PROJ runtime families in one install (for example avoid simultaneously keeping old `proj95-runtime` with `proj9-runtime`)
- if tools crash with Windows loader errors (`-1073741515`) and `proj_9.dll` is missing, reinstall `proj9-runtime`
- if `proj.db` mismatch errors appear (`DATABASE.LAYOUT.VERSION.MINOR = 2 whereas >= 4 expected`), runtime data is stale/mixed; reinstall PROJ runtime/data packages in a fresh OSGeo root

Installer workaround (current broken state observed):

If the OSGeo4W installer reports `proj9-runtime` as installed but `C:\OSGeo4W\bin\proj_9.dll` is still missing, recover manually:

```powershell
$pkgDir='C:\OSGeo4W\_pkg_fix'
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
$url='https://download.osgeo.org/osgeo4w/v2/x86_64/release/proj/proj9-runtime/proj9-runtime-9.8.0-1.tar.bz2'
$pkg=Join-Path $pkgDir 'proj9-runtime-9.8.0-1.tar.bz2'
Invoke-WebRequest -Uri $url -OutFile $pkg
tar -xjf $pkg -C 'C:\OSGeo4W'
```

Then verify:

```powershell
Test-Path C:\OSGeo4W\bin\proj_9.dll
C:\OSGeo4W\bin\projinfo.exe EPSG:3857
C:\OSGeo4W\bin\gdalinfo.exe --version
```

### Report Commands

These commands generate report outputs for analysis and benchmarking.

1. Public source cache status report (console-only):

```bash
node scripts/layers/fetch-public-layers.mjs --cache-report
```

Output:

- prints a cache health/status report in the terminal (no file written under `reports/`)

2. Elevation threshold impact report:

```bash
npm run data:analytics:elevation-thresholds
```

Outputs:

- `reports/elevation-threshold-investigation.json`
- `reports/elevation-threshold-investigation.md`

3. DEM resolution benchmark report (Task 53.1):

```bash
npm run data:analytics:dem-resolutions
```

Outputs:

- `reports/dem-resolution-benchmark/dem-resolution-benchmark.json`
- `reports/dem-resolution-benchmark/dem-resolution-benchmark.md`
- `reports/dem-resolution-benchmark/hillshade-subset-*.png` (quick visual comparison)
- `reports/dem-resolution-benchmark/subset-cutline.geojson` (benchmark subset geometry)

The files above are regenerable artifacts; rerun the same command to recreate them after cleanup.

Current DEM subset benchmark (`2026-03-12`, subset scale `0.55`, approx area ratio `0.3025`):

- `30m`: `35.4s`, combined DEM+hillshade size `4429.24 MiB` (baseline)
- `60m`: `17.8s` (`~1.99x` faster), combined `1107.87 MiB` (`~4.00x` smaller), medium-high detail retention
- `90m`: `10.9s` (`~3.25x` faster), combined `492.79 MiB` (`~8.99x` smaller), medium detail retention

Recommended default target for display/hillshade derivatives: `60m`, while retaining `30m` in raw cache as the high-detail source.

4. Water-body source prototype comparison (Task 54):

```bash
npm run data:analytics:water-sources
```

Outputs:

- `reports/water-bodies-prototype-comparison.json`
- `reports/water-bodies-prototype-comparison.md`

5. OSM read-source feasibility report for water extraction (Task 54.1):

Outputs (documentation artifacts):

- `reports/osm-api-water-source-feasibility.json`
- `reports/osm-api-water-source-feasibility.md`

Conclusion snapshot:

- OSM Editing API is not suitable for theater-scale read extraction.
- Overpass remains the primary OSM read source for this project.

6. Special-POI overlay source feasibility report (Task 54.2):

Outputs (documentation artifacts):

- `reports/poi-overlay-source-feasibility.json`
- `reports/poi-overlay-source-feasibility.md`

Conclusion snapshot:

- OSM is primary for special POI geometry (airfields, mines, factories, harbours, powerplants), with category-specific supplemental sources as needed.

7. OSM-informed hex shading prototype comparison (Task 54.3):

```bash
npm run data:analytics:hex-shading
```

Outputs:

- `reports/osm-informed-hex-shading-comparison.json`
- `reports/osm-informed-hex-shading-comparison.md`
- `data/processed/hex-cells-osm-shading-prototype.geojson`

8. River/water mismatch checklist report (hexes to review):

```bash
npm run data:analytics:river-gaps
```

Outputs:

- `reports/river-water-gap-checklist.json`
- `reports/river-water-gap-checklist.md`

Default scan behavior targets named major rivers (`feature length >= 40 km`) in-theater; use script args to broaden scope (for example `--feature-min-length-km=12 --include-all-hexes`).

### 2. Optional Local Pipeline Scaffolding

The repo also contains a local pipeline structure for:

- raw data intake
- preprocessing
- thematic layer build
- hex generation
- analytics
- export

Relevant commands:

```bash
npm run data:intake:prepare
npm run data:preprocess:plan
npm run data:preprocess
npm run data:layers:plan
npm run data:layers
npm run data:layers:voronoi
npm run data:hex:generate
npm run data:hex:enrich
npm run data:analytics
npm run data:export:hex
```

Important: this local path is optional and expects raw source prep plus GIS tooling. For this project, the public-source pipeline above is the canonical workflow.

## Generated Files

Current important processed outputs:

- `data/processed/hex-grid.geojson`
- `data/processed/hex-cells.geojson`
- `data/processed/hex-cells-analytics.geojson`
- `data/processed/hex-cells.dataset.json`
- `data/processed/layers.json`
- `data/processed/layers/*.geojson`

Repository strategy for generated geodata:

- all content under `data/` is ignored by Git
- only `.gitkeep` placeholders under `data/**/.gitkeep` remain trackable to preserve directory structure
- downloaded caches, raw inputs, and generated outputs are all treated as local build artifacts
- use `npm run repo:audit:size` before pushing if you want a quick check for tracked files over GitHub-friendly limits
- the application uses local `data/` artifacts after you run the intake/build commands

## Hex Grid Notes

The hex generator lives under:

- `scripts/hex/shared.mjs`
- `scripts/hex/generate-hex-grid.mjs`
- `scripts/hex/enrich-hex-grid.mjs`

The current center formula uses the Red Blob pointy-top axial layout:

```js
x = size * Math.sqrt(3) * (q + r / 2)
y = size * 1.5 * r
```

The default hex radius is configured in:

- `src/config/app.ts`

Current default:

```ts
hexRadiusKm: 24
```

To change hex scale:

1. update `hexRadiusKm` in `src/config/app.ts`
2. update `radiusKm` in `scripts/hex/shared.mjs`
3. regenerate the hex dataset
4. rerun analytics and export
5. reload the app

## Capacity and Analytics

Hex analytics are currently generated with transparent heuristic scoring in:

- `scripts/analytics/scoring.mjs`
- `scripts/analytics/compute-cell-analytics.mjs`

Current outputs include:

- centroid
- true generated center
- area
- parent region
- adjacency
- terrain summary
- infrastructure summary
- mobility score
- defensibility score
- base capacity
- effective capacity
- assigned force count

Sea terrain handling:

- `data/processed/layers/seas.geojson` is part of the processed manifest and is rendered in the map as a dedicated sea layer
- analytics now derive `seaCoverage` from the sea polygons and classify maritime hexes as `sea` instead of `open`
- the published live hex dataset in `data/processed/hex-cells.geojson` includes that sea classification, so the map shell and inspector see the same terrain result

## Current UI

Implemented:

- layer toggles
- settlements display-level selector (`Cities`, `Cities + Towns`, `Cities + Towns + Villages`)
- preset modes
- legend
- reset-to-Ukraine
- scale bar
- coordinate readout
- cell-layer mode selector (`Hex` / `Voronoi`)
- cell inspector with selection highlight
- hex debug panel
- overlay slot manager for future operational overlays
- major-city urban extent fills under settlement labels
- Ukrainian settlement names with English names below in parentheses when available
- city-seeded Voronoi cells for alternative operational cell display
- single dominant in-theater country labels (no repeated duplicates) with thicker country border lines
- zoom-based label hierarchy where country labels become subdued and oblast labels appear inside provinces
- ADM2 (raion) subdivision boundary overlay inside oblasts

Boundary-stack decision (Task 62 progress):

- Ukraine ADM0/ADM1/ADM2 visible border overlays are now derived from one topology source path (cached GADM ADM2) so borders align across levels.
- Ukraine ADM0 boundary geometry is simplified (currently about `0.6 km` minimum segment target) to reduce low-zoom anti-aliasing/flicker without reintroducing cross-level mismatch.
- Natural Earth country-border fallback for UKR was removed from visible rendering because mixed-source switching caused noticeable mismatch/jump behavior versus ADM1/ADM2.
- Maritime-segment suppression for ADM0 has been implemented as an interim approach; a more topology-aware coastal correction prototype is tracked as Task `62.3`.

### Map Interaction Notes

- The settlement search centers on selected matches and highlights the containing hex when available.
- The cell panel is unified under `Cell Information`, with a `Detailed` toggle for debug-level inspection.
- The detailed panel focuses on generated true center, click location, and deltas (pixel and kilometer) instead of noisier legacy debug fields.

### Label and Styling Notes

- Priority city stars are aligned to the settlement point locations for Kyiv, Kharkiv, and Odesa.
- Fallback population values are used for major city scaling to keep marker sizing stable when source population is missing.
- Country labels use a single dominant in-theater treatment with zoom-based hierarchy, and country borders are intentionally thicker for readability.
- Oblast subdivision (ADM2) lines are intentionally subordinate to ADM1: dashed, lighter color, and thinner-width hierarchy.
- Village/town-only settlement presence no longer forces reddish terrain tinting; terrain style remains terrain-driven unless stronger urban signals apply.
- Forest presentation was restored to finer fidelity relative to an earlier coarse simplification.
- Mixed coastal hex terrain classification was adjusted so part-land/part-sea urbanized cells do not default to `sea` inappropriately.

Not yet complete:

- finalized README coverage for the completed end-state

## Known Limitations

- the debug panel is still temporary and too noisy
- data quality is bounded by available public-source inputs and their update cadence
- overlay slots exist but are not populated with operational data yet
- the build currently produces a large JS bundle and would benefit from code-splitting later

## Repo Rules

Task execution order is tracked in:

- `TASKS.md`

Project agent instructions are tracked in:

- `AGENTS.md`
