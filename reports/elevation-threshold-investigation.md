# Elevation Threshold Investigation

Generated: 2026-03-11T23:35:38.532Z
DEM: `C:\Users\RonaldKunenborg\Dropbox\GrundsatzlichIT\Projecten\WebCode\dronewars-map\data\processed\terrain\elevation-clipped.tif`
Sample strategy: centroid WGS84 point sampling via `gdallocationinfo`

## Baseline

- Cells: 7960
- Area: 2978018.88 km2
- Elevation sample (m): min -3.5, p25 81.26, median 148.95, p75 215.99, max 2643.02

## Threshold Scenarios

| Threshold | Removed cells | Removed area | Largest component of kept | Components | Removed settlement cells | Removed city/town cells |
|---:|---:|---:|---:|---:|---:|---:|
| < 10m | 1062 (13.34%) | 397318.6 km2 (13.34%) | 6463 (93.69% of kept) | 5 | 242 | 59 |
| < 50m | 1535 (19.28%) | 574278.77 km2 (19.28%) | 6110 (95.1% of kept) | 11 | 684 | 182 |
| < 100m | 2345 (29.46%) | 877318.38 km2 (29.46%) | 5433 (96.76% of kept) | 23 | 1414 | 357 |

## Notes

- `city/town` cells are approximated as `strongestPlaceScore >= 3`.
- Connectivity is computed from `adjacencyIds` after threshold filtering.
- This analysis does not rewrite the dataset; it reports impact only.
