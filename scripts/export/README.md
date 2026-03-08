# Export

This stage publishes the final app-facing operational cell dataset.

## Command

```bash
npm run data:export:hex
```

It copies `data/processed/hex-cells-analytics.geojson` to the canonical frontend
path `data/processed/hex-cells.geojson` and writes
`data/processed/hex-cells.dataset.json`.

