# Railways (`layers/railways.geojson`)

## Source and cache

- Source: Natural Earth railroads (`natural-earth/railways`)
- Cache behavior: long-lived cache

## Processing

1. Clip to theater/hex extent.
2. Render as dashed rail logistics layer.

## Output role

- Strategic rail network context.

## Known limits

- Generalized network; not timetable or status aware.

## Solved issues already captured

- Stable fallback rail layer integrated in public build path.
