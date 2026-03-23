# Settlements (`layers/settlements.geojson`)

## Source and cache

- Source: Overpass place query for `place=city|town|village` in theater extent
- Cache keys: `overpass/settlements`
- Cache behavior: cached POST response reused unless explicit refresh

## Processing

1. Overpass node/way/relation places are converted to point features.
2. Population is normalized and curated city fallback values are applied where needed.
3. Deterministic dedupe merges near-overlap duplicates (node/way/relation and script variants).
4. Features are clipped to theater/hex mask and sea corrections as needed.

## Output role

- City/town/village circles and labels.
- Search index input.
- Priority city star symbols for the curated city set (currently Kyiv, Dnipro, and Odesa), anchored to settlement point locations.

## Known limits

- OSM administrative `place` classes may not match intuitive real-world size.
- Label collision logic intentionally hides some names at given zoom levels.

## Solved issues already captured

- Reduced duplicate city/town markers from mixed OSM entity types.
- Empty English-label bracket artifacts suppressed by non-empty `nameEn` handling.
