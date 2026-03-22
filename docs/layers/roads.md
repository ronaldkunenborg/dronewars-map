# Roads (`layers/roads.geojson`)

## Source and cache

- Source: Natural Earth roads (`natural-earth/roads`)
- Cache behavior: long-lived cache

## Processing

1. Clip to theater/hex extent.
2. Render as logistics road line layer.

## Output role

- Strategic/operational road network context.

## Known limits

- Natural Earth is generalized and not lane-level.

## Solved issues already captured

- Stable fallback road layer available in offline/public build path.
