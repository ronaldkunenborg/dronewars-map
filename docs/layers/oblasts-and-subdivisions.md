# Oblast Boundaries and Subdivisions (`layers/oblast-boundaries.geojson`, `layers/oblast-subdivisions.geojson`, label points)

## Source and cache

- Source stack: GADM ADM2 polygons (`gadm41_UKR_ADM2.geojson`), grouped by ADM1/oblast keys
- Cache behavior: local cached ADM2 geometry reused; no per-run remote fetch when cache is present

## Processing

1. Shared ADM2 edges are classified:
   - cross-oblast shared edges -> oblast boundary lines
   - same-oblast shared edges -> subdivision lines
2. Label points are generated from polygon geometry and name fields.
3. Subdivision labels filter obvious invalid names (`?`) in current pipeline behavior.

## Output role

- Administrative context below theater border.
- Operational orientation and region naming.

## Known limits

- Label placement quality depends on polygon shape and can be imperfect in narrow regions.
- Any source naming anomalies must be filtered explicitly.

## Solved issues already captured

- Hierarchical line styling tuned so ADM1 and ADM2 remain visually distinct.
- Duplicate/invalid subdivision label artifacts reduced by filtering.
