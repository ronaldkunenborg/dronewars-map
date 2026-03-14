# External Sources, Usage, and Fair-Use Notes

This project is built on public-source geodata. External payloads are cached locally under `data/cache/public-sources` and reused in normal runs; builds do not refetch every source on each run.

## Source Register

| Source | What We Use It For | How It Is Consumed | License / Fair-Use Notes |
| --- | --- | --- | --- |
| GeoBoundaries (ADM0, ADM1) | Ukraine theater boundary (ADM0) and oblast boundaries (ADM1) | JSON metadata + GeoJSON download URLs in `scripts/layers/fetch-public-layers.mjs` and `scripts/intake/bootstrap-raw.mjs`; cached before use | Use under GeoBoundaries terms for gbOpen. Keep attribution to GeoBoundaries and original contributors in downstream docs/products. |
| GADM (ADM2 local cache) | Raion/subdivision layer (ADM2) with higher vertex detail than GeoBoundaries ADM2 | Read from local cache file `data/cache/public-sources/gadm41_UKR_ADM2.geojson` during public layer build | Use subject to GADM terms. Do not redistribute extracted raw source bundles beyond allowed use. Keep clear attribution when ADM2 is displayed or exported. |
| Natural Earth | Rivers, lakes, seas, roads, railways, urban areas, country polygons/border lines | GeoJSON downloads in public layer builder; cached and then filtered to theater bbox | Natural Earth is public domain. Attribution is still recommended in project documentation. |
| OpenStreetMap via Overpass API | Settlements and OSM-derived thematic polygons (forests, wetlands, water-body prototypes) | Overpass queries via primary/fallback endpoints; responses cached locally and reused | OSM data is ODbL. If producing public derivative datasets/databases, preserve ODbL obligations and attribution ("© OpenStreetMap contributors"). |
| Geofabrik Ukraine extract | Optional raw OSM `.pbf` intake for local processing path | Downloaded by `scripts/intake/bootstrap-raw.mjs` into raw cache/intake | Derived from OSM; ODbL obligations apply. Respect Geofabrik usage terms for downloads. |
| FABDEM 30m | Preferred elevation source for theater elevation/hillshade generation | Tile index + tile download/mosaic flow in public layer builder, with local cached outputs | Use under FABDEM provider terms. Keep source attribution in derived terrain documentation. |
| Copernicus GLO-30 | Fallback elevation source when FABDEM is unavailable | HTTP tile reachability check + mosaic pipeline in public layer builder | Use under Copernicus/ESA terms. Keep required Copernicus attribution for derivative products. |
| ESA WorldCover v200 (2021) | Landcover raster in raw intake/bootstrap path | COG tile download + clip in `scripts/intake/bootstrap-raw.mjs` | Use under ESA WorldCover terms. Keep dataset citation/attribution in published outputs. |

## Operational Rules In This Repo

- Cache-first behavior is mandatory for external data pulls.
- Normal layer builds must read cached content and should not repeatedly call upstream services.
- `--refresh` flags are for intentional cache refreshes only.
- `data/` outputs are local build artifacts and are not committed to Git.

## Attribution Guidance

When publishing screenshots, maps, or exported derivatives externally, include at least:

- GeoBoundaries (for ADM0/ADM1, where shown)
- GADM (for ADM2, where shown)
- Natural Earth
- OpenStreetMap contributors (for OSM-derived layers)
- FABDEM/Copernicus/ESA WorldCover (when terrain/landcover products are included)
