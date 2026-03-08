# Dronewars Map

Offline-first operational map prototype for Ukraine built around a terrain-first basemap and brigade-scale operational hex cells.

## Current Status

The project currently includes:

- a Vite + React + TypeScript + MapLibre application shell
- a generated operational hex grid with analytics fields
- a user-facing cell inspector with click selection and cell highlighting
- a clickable hex debug panel
- UI controls for presets, layer toggles, reset-to-Ukraine, legend, and coordinate readout
- lightweight overlay slots for future frontlines, zones of control, artillery ranges, logistics routes, and force placement
- a public fallback data pipeline that generates visible map layers without requiring the full OSM/GDAL workflow

The project does **not** yet include the full intended production-grade terrain pipeline. In particular:

- `forests` and `wetlands` are currently empty in the public fallback layer set
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
- water, roads, railways, settlements, theater boundary, and oblast boundaries
- sidebar controls for visibility and presets
- a cell inspector in the top-left after clicking a hex
- a hex debug panel in the top-right

At the moment, the fallback processed layers provide:

- theater boundary
- oblast boundaries
- rivers
- water bodies
- roads
- railways
- settlements

Fallback-empty layers:

- forests
- wetlands

## Data Workflow

There are currently two data paths.

### 1. Public Fallback Layer Build

This is the fastest way to get visible map content into the app.

```bash
npm run data:layers:public
```

This downloads public Ukraine boundary and Natural Earth layers and writes:

- `data/processed/layers.json`
- `data/processed/layers/*.geojson`

This is what the app currently uses for visible thematic content.

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
hexRadiusKm: 12
```

To change hex scale:

1. update `hexRadiusKm` in `src/config/app.ts`
2. regenerate the hex dataset
3. reload the app

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

## Current UI

Implemented:

- layer toggles
- preset modes
- legend
- reset-to-Ukraine
- scale bar
- coordinate readout
- cell inspector with selection highlight
- hex debug panel
- overlay slot manager for future operational overlays

Not yet complete:

- finalized README coverage for the completed end-state

## Known Limitations

- fallback `forests` and `wetlands` are empty
- the debug panel is still temporary and too noisy
- the fallback layer builder uses public reference data rather than the intended richer local pipeline
- overlay slots exist but are not populated with operational data yet
- the build currently produces a large JS bundle and would benefit from code-splitting later

## Repo Rules

Task execution order is tracked in:

- `TASKS.md`

Project agent instructions are tracked in:

- `AGENTS.md`
