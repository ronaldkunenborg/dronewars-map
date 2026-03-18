# Analytics and Report Commands

## Cache Status

```bash
node scripts/layers/fetch-public-layers.mjs --cache-report
```

Console-only cache health report.

## Elevation Thresholds

```bash
npm run data:analytics:elevation-thresholds
```

Outputs under `reports/`.

## DEM Resolution Benchmark

```bash
npm run data:analytics:dem-resolutions
```

Outputs benchmark JSON/MD and subset imagery under `reports/dem-resolution-benchmark/`.

## Water Source Comparison

```bash
npm run data:analytics:water-sources
```

Writes water-source comparison report artifacts.

## River Gap Checklist

```bash
npm run data:analytics:river-gaps
```

Writes:

- `reports/river-water-gap-checklist.json`
- `reports/river-water-gap-checklist.md`

## OSM-Informed Hex Shading

```bash
npm run data:analytics:hex-shading
```

Writes prototype comparison report artifacts under `reports/`.
