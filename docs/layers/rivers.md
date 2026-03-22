# Rivers (`layers/rivers.geojson`)

## Source and cache

- Base source: Natural Earth rivers (`natural-earth/rivers`)
- Additional detail inputs for reconstruction come from cached local OSM PBF extraction (`osm/rivers/pbf-lines`)

## Processing

1. Base rivers are clipped to extent.
2. Features are split for inside/outside-Ukraine behavior metadata where needed.
3. Hydrology reconstruction logic uses major-river corridor pass and targeted repair scope from report inputs.

## Output role

- River line visualization layer.

## Known limits

- Base Natural Earth coverage can miss smaller local branches.
- Targeted repair quality depends on curated report scope.

## Solved issues already captured

- Major corridor and targeted reconstruction improved visible continuity for known gap hexes.
