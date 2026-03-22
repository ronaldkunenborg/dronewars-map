# Water Bodies (`layers/water-bodies.geojson`)

## Source and cache

- Inputs:
  - OSM water polygons from local PBF extraction (`osm/water-bodies/pbf-extract`)
  - Prototype overpass water polygons (`overpass/water-bodies/*`) as fallback/reference
- Cache behavior: local extract cache + upstream response cache; reused unless refreshed

## Processing

1. Start from OSM-informed polygon base with fallback merge.
2. Apply major river corridor append and targeted river repair reconstruction.
3. Apply hex-specific fallback where configured.
4. Coastal stage subtracts corrected sea mask from inland water where needed.

## Output role

- Main hydrology polygon layer used in normal map viewing.

## Known limits

- Repair behavior depends on curated target-hex report and name scopes.
- Geometry quality can vary with source coverage and simplification.

## Solved issues already captured

- River-gap remediation made visible in normal hydrology output (not z12-only rendering).
- Coastal cleanup removed sea/inland overlap artifacts in reviewed hexes.
