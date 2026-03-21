# Public Layer Builder (`data:layers:public`)

Builds processed public-source layers and writes:

- `data/processed/layers/*.geojson`
- `data/processed/layers.json`

Run:

```bash
npm run data:layers:public
```

## Common Commands

```bash
node scripts/layers/fetch-public-layers.mjs --cache-report
node scripts/layers/fetch-public-layers.mjs --elevation-only
node scripts/layers/fetch-public-layers.mjs --skip-elevation
node scripts/layers/fetch-public-layers.mjs --refresh
node scripts/layers/fetch-public-layers.mjs --refresh=natural-earth
node scripts/layers/fetch-public-layers.mjs --smoke-test=water-bodies
node scripts/layers/fetch-public-layers.mjs --coastal-only
node scripts/layers/fetch-public-layers.mjs --skip-elevation --workers=4 --compute-workers=8
```

## Hex-Scoped Iteration (`--hex-only`)

Use a local hex scope for faster debugging runs:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50,HX-W18-N50
```

Behavior:

- selected hexes define the active extent bbox for fetch/extract stages
- final vector outputs are clipped/filtered to the selected hex mask
- `--workers` controls fetch/extract concurrency; `--compute-workers` controls major-river-corridor CPU worker threads

If river/water PBF extracts were cached for larger extents, force scoped refresh:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50 --refresh=osm/rivers/pbf-lines,osm/water-bodies/pbf-extract
```

## Split Stage: Coastal-Only Rebuild

Use `--coastal-only` to rerun only the coastal sea/water correction stage, reusing cached post-hydrology output for the same scope.

1. Prime cache with a normal run for your scope:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-E36-N22
```

2. Iterate quickly on coastline logic:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-E36-N22 --coastal-only
```

Example multi-hex coastal validation scope (Odessa + Crimea task hexes):

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-E36-N22,HX-E72-N11,HX-E75-N12,HX-E77-N12
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-E36-N22,HX-E72-N11,HX-E75-N12,HX-E77-N12 --coastal-only
```

Notes:

- stage cache location: `data/processed/_stage-cache/post-hydrology-*.json`
- `--coastal-only` updates `layers/seas.geojson` and `layers/water-bodies.geojson` (and re-filters settlements against sea)
- if no matching post-hydrology cache exists, the command exits with an explicit error

## Caching

- Cache root: `data/cache/public-sources`
- Default TTL: one year
- Rebuilds should mostly show `cache hit` after warm-up

## Hydrology Dependency

For correct targeted river repairs, `data:layers:public` depends on:

- `reports/river-water-gap-checklist.json`

If this report is missing or stale, targeted reconstruction scope can be wrong. Refresh it with:

```bash
npm run data:analytics:river-gaps
```

Scope note: targeted reconstruction does not blindly use every raw candidate hex.  
The final scope is curated via manual include/exclude overrides in both:

- `scripts/analytics/report-river-water-gaps.mjs` (report-generation curation)
- `scripts/layers/fetch-public-layers.mjs` (build-time target curation)

See [River Gap Repair Workflow](../hydrology/river-gap-repair.md) for hydrology-specific reconstruction details.
