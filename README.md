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
- a public fallback data pipeline that generates visible map layers without requiring the full OSM/GDAL workflow
- a cached public-source fetch path so repeated fallback rebuilds reuse prior downloads instead of refetching everything

The project does **not** yet include the full intended production-grade terrain pipeline. In particular:

- the current public fallback terrain layers are generated from public OSM/Overpass and WorldCover-backed sources rather than the intended final local ingest pipeline
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

## What You Should See

With the current fallback processed data, the app should show:

- a terrain/reference map of Ukraine
- operational hex cells
- water, seas, forests, wetlands, roads, railways, settlements, theater boundary, and oblast boundaries
- major-city urban extents beneath city labels
- optional city-seeded Voronoi operational cells (when `Cell Layer` is set to `Voronoi`)
- sidebar controls for visibility and presets
- a cell inspector in the top-left after clicking a hex
- a hex debug panel in the top-right

At the moment, the fallback processed layers provide:

- theater boundary
- oblast boundaries
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

There are currently two data paths.

### 1. Public Fallback Layer Build

This is the fastest way to get visible map content into the app.

```bash
npm run data:layers:public
```

This downloads or reuses cached public Ukraine boundary, Natural Earth, and Overpass layers and writes:

- `data/processed/layers.json`
- `data/processed/layers/*.geojson`

This is what the app currently uses for visible thematic content. The public builder now combines:

- GeoBoundaries for national and oblast boundaries
- Natural Earth for rivers, lakes, seas, roads, railways, and urban areas
- OSM Overpass for settlements, forests, and wetlands
- ESA WorldCover raster fallback for landcover visualization in the map shell

Public fallback cache behavior:

- cached source responses live under `data/cache/public-sources`
- cache entries are valid for one year from write time
- cache entries are also invalidated when the script-level cache schema version changes
- the cache directory is ignored by Git

Useful public builder commands:

```bash
node scripts/layers/fetch-public-layers.mjs --cache-report
node scripts/layers/fetch-public-layers.mjs --refresh
node scripts/layers/fetch-public-layers.mjs --refresh=natural-earth
node scripts/layers/fetch-public-layers.mjs --refresh=overpass/settlements
node scripts/layers/fetch-public-layers.mjs --smoke-test=static
node scripts/layers/fetch-public-layers.mjs --smoke-test=settlements
node scripts/layers/fetch-public-layers.mjs --smoke-test=wetlands
node scripts/layers/fetch-public-layers.mjs --smoke-test=forests
```

Refresh expectations:

- a normal rerun of `npm run data:layers:public` should mostly report `cache hit` once the cache is warm
- use `--refresh` only when you intentionally want to replace cached upstream responses
- use `--cache-report` to see which source payloads are ready, missing, expired, or on an older schema

### 2. Full Intended Pipeline

The repo also contains the fuller pipeline structure for:

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

Important: the full pipeline still expects proper raw source data and GIS tooling. The public fallback path is what currently makes the visible map usable.

## Generated Files

Current important processed outputs:

- `data/processed/hex-grid.geojson`
- `data/processed/hex-cells.geojson`
- `data/processed/hex-cells-analytics.geojson`
- `data/processed/hex-cells.dataset.json`
- `data/processed/layers.json`
- `data/processed/layers/*.geojson`

Repository strategy for generated geodata:

- `data/cache/` is intentionally local-only and ignored by Git
- very large generated fallback layers such as `data/processed/layers/forests.geojson` and `data/processed/layers/wetlands.geojson` are ignored by Git to keep pushes repository-safe
- use `npm run repo:audit:size` before pushing if you want a quick check for tracked files over GitHub-friendly limits
- the application can still use those ignored generated files locally after they are rebuilt

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

- `data/processed/layers/seas.geojson` is part of the fallback manifest and is rendered in the map as a dedicated sea layer
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

Not yet complete:

- finalized README coverage for the completed end-state

## Known Limitations

- the debug panel is still temporary and too noisy
- the fallback layer builder uses public reference data rather than the intended richer local pipeline
- overlay slots exist but are not populated with operational data yet
- the build currently produces a large JS bundle and would benefit from code-splitting later

## Repo Rules

Task execution order is tracked in:

- `TASKS.md`

Project agent instructions are tracked in:

- `AGENTS.md`
