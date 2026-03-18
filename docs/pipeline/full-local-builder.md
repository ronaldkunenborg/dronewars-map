# Full Local Layer Builder (`data:layers`)

Use this path when full local inputs and tooling are available.

## Commands

```bash
npm run data:layers:plan
npm run data:layers
```

## Typical Outputs

- `data/processed/layers/theater-boundary.geojson`
- `data/processed/layers/oblast-boundaries.geojson`
- `data/processed/layers/rivers.geojson`
- `data/processed/layers/water-bodies.geojson`
- `data/processed/layers/wetlands.geojson`
- `data/processed/layers/forests.geojson`
- `data/processed/layers/roads.geojson`
- `data/processed/layers/railways.geojson`
- `data/processed/layers/settlements.geojson`
- `data/processed/layers.json`

## Prerequisites

- registered raw intake inputs (`npm run data:intake:bootstrap`)
- GDAL/OSGeo availability on Windows (see [Windows OSGeo4W Setup](../setup/windows-osgeo4w.md))

For fast fallback/public path, see [Public Layer Builder](public-layer-builder.md).
