# River-Water Gap Checklist

Generated: 2026-03-16T21:33:24.174Z

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
- Hexes with at least 1 km river: 880
- Hexes passing rendered-river gate: 171
- Manually excluded hexes removed: 23
- Theater filter applied: true
- Flagged hexes to check: 22

## Hex Checklist

| Hex | River km | Rendered river km | Uncovered km | Uncovered % | Main rivers | Center |
|---|---:|---:|---:|---:|---|---|
| HX-W19-N50 | 17.795 | 7.301 | 16.96 | 95.31 | Стривігор (16.328), Дністер (1.467) | 23.120268, 49.530978 |
| HX-E20-N69 | 14.2 | 9.686 | 11.473 | 80.79 | Мена (11.473), Десна (2.727) | 32.175767, 51.484469 |
| HX-E16-N64 | 28.411 | 3.764 | 12.103 | 42.6 | Остер (17.848), Десна (10.563) | 30.962144, 50.978221 |
| HX-E3-N41 | 10.866 | 7.664 | 9.915 | 91.25 | Жванчик (10.866) | 26.387716, 48.577313 |
| HX-W9-N36 | 13.108 | 9.811 | 8.7 | 66.37 | Тересва (13.108) | 23.680402, 48.039581 |
| HX-E22-N70 | 18.346 | 14.517 | 8.597 | 46.86 | Десна (9.611), Убідь (8.736) | 32.642546, 51.58505 |
| HX-W9-N46 | 32.287 | 9.667 | 6.84 | 21.18 | Лімниця (14.919), Дністер (9.808), Луква (7.56) | 24.613959, 49.109385 |
| HX-E55-N49 | 23.507 | 17.836 | 6.447 | 27.43 | Сіверський Донець (16.231), Волоська Балаклійка (4.346), Середня Балаклійка (2.93) | 36.84355, 49.425918 |
| HX-E51-N57 | 4.983 | 15.092 | 4.754 | 95.41 | Вовча (4.983) | 36.84355, 50.260095 |
| HX-W1-N33 | 4.2 | 5.788 | 4.2 | 100 | Vaserul (4.2) | 24.894026, 47.71422 |
| HX-W2-N34 | 4.085 | 7.397 | 4.085 | 100 | Vaserul (4.085) | 24.80067, 47.8229 |
| HX-E20-N68 | 25.566 | 14.648 | 5.403 | 21.13 | Десна (19.851), Мена (5.715) | 32.082412, 51.383664 |
| HX-W18-N50 | 12.46 | 17.024 | 4.764 | 38.24 | Дністер (7.696), Стривігор (4.764) | 23.306979, 49.530978 |
| HX-E24-N74 | 15.938 | 15.409 | 3.854 | 24.18 | Десна (12.027), Івотка (3.911) | 33.389391, 51.985157 |
| HX-W17-N50 | 5.69 | 8.857 | 2.799 | 49.2 | Бистриця Тисменицька (3.163), Дністер (2.527) | 23.493691, 49.530978 |
| HX-W13-N54 | 7.92 | 14.948 | 2.422 | 30.58 | Полтва (7.92) | 24.613959, 49.948965 |
| HX-E22-N69 | 24.214 | 16.412 | 2.136 | 8.82 | Десна (14.104), Сейм (7.974), Убідь (2.136) | 32.54919, 51.484469 |
| HX-W19-N47 | 1.927 | 8.51 | 0.988 | 51.25 | Дністер (0.988), San - Сян (0.939) | 22.840201, 49.215122 |
| HX-E51-N51 | 11.039 | 9.687 | 1.722 | 15.6 | Сіверський Донець (9.166), Мжа (1.873) | 36.283416, 49.635812 |
| HX-E16-N63 | 23.213 | 14.649 | 1.912 | 8.24 | Десна (19.002), Остер (4.211) | 30.868788, 50.876303 |
| HX-E11-N46 | 2.052 | 13.414 | 0.709 | 34.54 | Рів (2.052) | 28.348185, 49.109385 |
| HX-W19-N48 | 7.963 | 15.196 | 0.374 | 4.69 | Дністер (7.963) | 22.933557, 49.320633 |

## Notes

- `Uncovered` means the segment midpoint is farther than the covered-distance threshold from water polygons.
- This report is a review checklist. It does not modify map layers.
