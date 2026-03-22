# Country Boundaries and Country Labels (`layers/country-boundaries.geojson`, `layers/country-boundary-lines.geojson`, `layers/country-label-guides.geojson`)

## Source and cache

- Sources:
  - Natural Earth countries (`natural-earth/countries`)
  - Natural Earth country boundary lines (`natural-earth/country-boundary-lines`)
- Cache behavior: long-lived cache in `data/cache/public-sources`

## Processing

1. Country fill layer is clipped to theater extent.
2. UKR country fill geometry is replaced by ADM-derived Ukraine geometry for consistency.
3. Natural Earth country line rendering excludes UKR edges so UKR border uses ADM-derived theater boundary line.
4. Country label guides are generated from fill geometry bounds.
5. Hex-specific exception applies in `HX-E72-N11`: non-UKR fill is suppressed.

## Output role

- Non-Ukraine context fill/lines around theater and country labels.

## Known limits

- Coarse country polygons can conflict with detailed coastal interpretation in disputed zones.
- Label guide placement uses geometric bounds, not cartographic manual annotation.

## Solved issues already captured

- UKR line-source mismatch removed (single ADM-derived border behavior).
- Kerch dispute hex country-fill override prevents wrong-side coarse fill.
