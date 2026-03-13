# Water-Body Source Prototype Comparison

Generated: 2026-03-13T12:25:07.167Z
Corridor thresholds (m): 2, 5, 10
Sea-seed hexes: 865

## Source Summary

| Layer | Features | Area (km2) | Inland features | Inland area (km2) |
|---|---:|---:|---:|---:|
| Natural Earth lakes | 8 | 8125.07 | 8 | 8125.07 |
| OSM water prototype | 100185 | 9220.54 | 99490 | 8473.54 |

## Cross-Layer Representative Overlap

- Natural Earth representatives found in OSM polygons: 0/8 (0%).
- OSM representatives found in Natural Earth polygons: 342/100185 (0.34%).

## Inland Water vs Sea-Connected Near-Sea Corridors

| Threshold | NE inland in corridor | OSM inland in corridor |
|---:|---:|---:|
| <= 2m | 1/8 (12.5%) | 3148/99490 (3.16%) |
| <= 5m | 1/8 (12.5%) | 4132/99490 (4.15%) |
| <= 10m | 1/8 (12.5%) | 4721/99490 (4.75%) |

## Notes

- OSM prototype uses Overpass ways from tags: `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`.
- Corridor model starts from sea-dominant hexes (`seaCoverage >= 0.5`) and floods through adjacent hexes with sampled DEM elevation below threshold.
- This is a prototype comparison report; it does not replace the default rendered `water-bodies` layer.
