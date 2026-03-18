# Attribution

This project is built from public-source datasets.  
Canonical source inventory and policy notes are documented in:

- [EXTERNAL_SOURCES.md](../EXTERNAL_SOURCES.md)

## Core Attribution Text

Use the following attribution text where map data is displayed:

- Administrative boundaries: GeoBoundaries, GADM
- Base thematic vectors (rivers, lakes, seas, roads, railways, urban areas): Natural Earth
- OSM-derived thematic layers (for example settlements, forests, wetlands, OSM water extracts): OpenStreetMap contributors
- Elevation / hillshade inputs: FABDEM 30m (preferred), Copernicus GLO-30 (fallback)
- Landcover support layers: ESA WorldCover

## Links

- GeoBoundaries: https://www.geoboundaries.org/
- GADM: https://gadm.org/
- Natural Earth: https://www.naturalearthdata.com/
- OpenStreetMap: https://www.openstreetmap.org/copyright
- FABDEM: https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn
- Copernicus DEM: https://dataspace.copernicus.eu/
- ESA WorldCover: https://worldcover2021.esa.int/

## Scope Notes

- Attribution requirements can vary by rendered layer and export context.
- When in doubt, include the full source/provider list above plus the links.

## App/Docs Checklist

Use this lightweight checklist for normal app/docs updates:

1. In-app attribution footer/link is visible in the map UI.
2. Footer link opens `docs/ATTRIBUTION.md`.
3. `docs/ATTRIBUTION.md` still reflects the current active source stack.
4. `README.md` and `docs/INDEX.md` still contain links to this page.
