# Major City Urban Areas (`layers/major-city-urban-areas.geojson`)

## Source and cache

- Source: Natural Earth urban areas (`natural-earth/urban-areas`)
- Cache behavior: cached source reused by default

## Processing

1. Clip urban polygons to current theater/hex extent.
2. Keep features with `max_pop_al >= 50,000`.
3. Remove malformed wide-span artifacts.
4. Keep only polygons anchored to nearby `place=city|town` settlements with `population >= 50,000`.
5. Store anchor metadata (`anchorPlace`, `anchorDistanceKm`) for UI-level filtering.

## Output role

- Built-up area fill tied to operational settlement display level.

## Known limits

- Natural Earth urban extents are generalized and may not match exact local built-up footprints.
- Anchor distance threshold is heuristic.

## Solved issues already captured

- Removed unlabeled built-up patches caused by town-only/no-anchor cases.
- Urban visibility now follows selected settlement display level behavior.

## Fast rebuild command

```bash
npm run data:layers:public -- --urban-only
```
