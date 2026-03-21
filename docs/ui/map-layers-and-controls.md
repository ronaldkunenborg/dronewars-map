# Map Layers and Controls

## Main Visible Layer Groups

- water (`sea-fill`, `water-bodies-fill`)
- rivers (`rivers-line`)
- wetlands
- forests
- roads
- railways
- settlements
- boundaries/labels
- operational hexes

## Core Interaction

- click a hex to select and inspect cell details
- click outside to clear selection
- hover updates current hex indicator in the cell panel toggle
- layer visibility panel controls thematic groups
- settlement display level supports city/town/village filtering

## Operational Notes

- `water-bodies` is the primary hydrology polygon display
- `rivers` acts as a line fallback/operational hint and is placed below water polygons
- river-gap review uses report outputs (`reports/river-water-gap-checklist.{json,md}`) instead of an in-app temporary overlay
