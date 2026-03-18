# River-Water Gap Checklist

Generated: 2026-03-18T20:50:41.455Z

## Inputs

- Hex layer: `data\processed\hex-cells.geojson`
- Water layer: `data\processed\layers\water-bodies.geojson`
- Theater boundary: `data\processed\layers\country-boundaries.geojson`
- River layer: `data\cache\public-sources\osm\rivers-lines-from-pbf.geojson`

## Scan Settings

- Require river name: `true`
- Only theater hexes: `true`
- Require rendered rivers in hex: `true`
- Rendered river minimum: `0.12 km`
- Feature minimum length: `40 km`
- Segment minimum length: `0.05 km`
- Covered-distance threshold: `0.03 km`
- Water search radius: `0.35 km`

## Summary

- Candidate river features scanned: 221
- Candidate river segments scanned: 83801
- Hexes with at least 1 km river: 869
- Hexes passing rendered-river gate: 160
- Manually excluded hexes removed: 34
- Manually included flagged hexes added: 1
- Theater filter applied: true
- Flagged hexes to check: 12

## Hex Checklist

| Hex | River km | Rendered river km | Uncovered km | Uncovered % | Main rivers | Center |
|---|---:|---:|---:|---:|---|---|
| HX-E53-N53 | 0 | 0 | 0 | 0 |  | 36.84355, 49.844806 |
| HX-W19-N50 | 17.795 | 7.301 | 16.96 | 95.31 | Стривігор (16.328), Дністер (1.467) | 23.120268, 49.530978 |
| HX-W18-N50 | 12.46 | 17.024 | 10.242 | 82.2 | Дністер (7.696), Стривігор (4.764) | 23.306979, 49.530978 |
| HX-E3-N41 | 10.866 | 7.664 | 9.915 | 91.25 | Жванчик (10.866) | 26.387716, 48.577313 |
| HX-W9-N36 | 13.108 | 9.8 | 8.7 | 66.37 | Тересва (13.108) | 23.680402, 48.039581 |
| HX-W9-N46 | 32.287 | 9.667 | 6.84 | 21.18 | Лімниця (14.919), Дністер (9.808), Луква (7.56) | 24.613959, 49.109385 |
| HX-W1-N33 | 4.2 | 5.788 | 4.2 | 100 | Vaserul (4.2) | 24.894026, 47.71422 |
| HX-W2-N34 | 4.085 | 7.397 | 4.085 | 100 | Vaserul (4.085) | 24.80067, 47.8229 |
| HX-W17-N50 | 5.69 | 8.857 | 2.851 | 50.11 | Бистриця Тисменицька (3.163), Дністер (2.527) | 23.493691, 49.530978 |
| HX-W13-N54 | 7.92 | 14.948 | 2.422 | 30.58 | Полтва (7.92) | 24.613959, 49.948965 |
| HX-W19-N47 | 1.927 | 8.51 | 0.988 | 51.25 | Дністер (0.988), San - Сян (0.939) | 22.840201, 49.215122 |
| HX-W19-N48 | 7.963 | 15.196 | 0.374 | 4.69 | Дністер (7.963) | 22.933557, 49.320633 |

## Notes

- `Uncovered` means the segment midpoint is farther than the covered-distance threshold from water polygons.
- This report is a review checklist. It does not modify map layers.
