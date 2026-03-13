# Analytics

This stage computes per-hex terrain and infrastructure summaries plus initial
capacity and scoring outputs.

## Command

```bash
npm run data:analytics
```

Elevation threshold impact investigation:

```bash
npm run data:analytics:elevation-thresholds
```

DEM resolution benchmark (subset geometry clip of the theater boundary):

```bash
npm run data:analytics:dem-resolutions
```

Water-body source prototype comparison (Natural Earth vs OSM water polygons, plus
near-sea-level corridor plausibility):

```bash
npm run data:analytics:water-sources
```

OSM-informed hex-shading prototype comparison versus current terrain-driven
display classes:

```bash
npm run data:analytics:hex-shading
```

Inputs:

- `data/processed/hex-cells.geojson`
- processed thematic layers under `data/processed/layers`

Output:

- `data/processed/hex-cells-analytics.geojson`
- `reports/elevation-threshold-investigation.json`
- `reports/elevation-threshold-investigation.md`
- `reports/dem-resolution-benchmark/dem-resolution-benchmark.json`
- `reports/dem-resolution-benchmark/dem-resolution-benchmark.md`
- `reports/water-bodies-prototype-comparison.json`
- `reports/water-bodies-prototype-comparison.md`
- `reports/osm-informed-hex-shading-comparison.json`
- `reports/osm-informed-hex-shading-comparison.md`
- `data/processed/hex-cells-osm-shading-prototype.geojson`

Current analytics are heuristic and intentionally transparent:

- forest and wetland coverage are approximated from polygon-vertex inclusion
- water barriers are inferred from river-line contact
- road density is approximated from in-hex line length divided by hex area
- settlement score is based on OSM settlement hierarchy
- capacity, mobility, and defensibility use tunable constants in `scoring.mjs`

This keeps the scoring pipeline functional now while leaving room for later
replacement with more exact raster and geometry analysis.
