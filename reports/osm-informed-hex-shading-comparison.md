# OSM-Informed Hex Shading Prototype Comparison

Generated: 2026-03-13T15:48:10.483Z

## Headline

- Hexes changed by prototype class: 484 / 7960 (6.08%).
- New inland-water class count: 47.

## Current vs Prototype Class Counts

| Class | Current | Prototype | Delta |
|---|---:|---:|---:|
| sea | 771 | 865 | 94 |
| inland-water | 0 | 47 | 47 |
| urban | 154 | 147 | -7 |
| wetland | 892 | 1178 | 286 |
| forest | 5763 | 5386 | -377 |
| open | 380 | 329 | -51 |
| mixed | 0 | 8 | 8 |

## Top Changed Regions

| Region | Changed hexes |
|---|---:|
| unassigned | 484 |

## Notes

- Current class mirrors active map logic (`sea` then `urban` override, then `wetland/forest/open`).
- Prototype adds explicit inland OSM-water signal (`inland-water`) using centroid-in-OSM-water polygons.
- This is a prototype output/report and does not auto-switch runtime styling.
