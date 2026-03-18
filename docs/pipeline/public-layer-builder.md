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

If river/water PBF extracts were cached for larger extents, force scoped refresh:

```bash
node scripts/layers/fetch-public-layers.mjs --skip-elevation --hex-only=HX-W19-N50 --refresh=osm/rivers/pbf-lines,osm/water-bodies/pbf-extract
```

## Caching

- Cache root: `data/cache/public-sources`
- Default TTL: one year
- Rebuilds should mostly show `cache hit` after warm-up

See [River Gap Repair Workflow](../hydrology/river-gap-repair.md) for hydrology-specific reconstruction details.
