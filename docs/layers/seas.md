# Seas (`layers/seas.geojson`)

## Source and cache

- Base source: Natural Earth marine polygons (`natural-earth/seas`)
- Cache behavior: source cached; corrected output rebuilt in pipeline

## Processing

1. Build coastal land mask from country/ADM-derived geometry.
2. Subtract land mask from sea polygons.
3. Apply curated coastal hex completion and lockstep rules where configured.
4. Clip to extent and write corrected sea layer.

## Output role

- Sea rendering and coastal consistency baseline for downstream subtraction.

## Known limits

- Curated hex controls are geometry-specific and may need updates if tiling/rules change.
- Coarse source polygons can still require manual exception handling in disputed areas.

## Solved issues already captured

- Odessa/Kerch coastal wedge and land-in-sea artifacts significantly reduced.
- Hex-specific dispute policy in Kerch prevents non-UKR fill override behavior.
