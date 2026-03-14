# External Sources, Usage, and Fair-Use Notes

This project is built on public-source geodata. External payloads are cached locally under `data/cache/public-sources` and reused in normal runs; builds do not refetch every source on each run.

## Source Register (Quick Table)

| Source | Primary Use | Current Role |
| --- | --- | --- |
| GeoBoundaries (ADM0, ADM1) | Theater and oblast boundaries | Active primary |
| GADM (ADM2 local cache) | Raion/subdivision boundaries | Active primary for ADM2 |
| Natural Earth | Rivers/lakes/seas/roads/railways/urban areas/country lines | Active primary |
| OSM via Overpass API | Settlements + thematic polygons + prototype water/POI pulls | Active primary |
| Geofabrik (OSM extract) | Optional raw OSM `.pbf` intake | Optional supporting |
| FABDEM 30m | Elevation/hillshade (preferred) | Active preferred |
| Copernicus GLO-30 | Elevation fallback | Active fallback |
| ESA WorldCover v200 | Landcover input | Active supporting |

## Per-Source Details and Fit-for-Purpose Conclusions

### GeoBoundaries (ADM0, ADM1)

- Use in repo: Ukraine theater boundary (ADM0) and oblast boundaries (ADM1).
- Consumption: metadata endpoint -> GeoJSON URL -> cached local copy.
- License/fair-use: follow GeoBoundaries gbOpen terms and attribution requirements.
- Fit for purpose: suitable as primary for ADM0/ADM1 in this project.

### GADM (ADM2 local cache)

- Use in repo: ADM2/raion subdivisions.
- Consumption: local cached file `data/cache/public-sources/gadm41_UKR_ADM2.geojson` (preferred for subdivision detail).
- License/fair-use: more restrictive than gbOpen/CC-BY style sources; commercial use and redistribution are typically permission-gated under GADM terms. Avoid redistributing raw bundles beyond allowed scope.
- Fit for purpose: currently preferred for ADM2 detail quality in this project.

### Natural Earth

- Use in repo: rivers, lakes, seas, roads, railways, urban areas, country polygons/border lines.
- Consumption: cached GeoJSON downloads filtered to theater bbox.
- License/fair-use: public domain; attribution still recommended.
- Fit-for-purpose conclusions from reports:
  - From `reports/water-bodies-prototype-comparison.md`: Natural Earth lakes are useful as coarse baseline context, but not sufficient as sole inland-water source for detailed theater water depiction.
  - From `reports/poi-overlay-source-feasibility.md`: Natural Earth ports are useful as a major-port fallback/baseline, not as a replacement for OSM local-detail harbour mapping.

### OpenStreetMap via Overpass API

- Use in repo: settlements, forests, wetlands, water-body prototype, and POI feasibility prototypes.
- Consumption: Overpass query endpoints with fallback hosts; responses are cached and reused.
- License/fair-use: ODbL applies; include "© OpenStreetMap contributors" and honor share/attribution obligations for public derivatives.
- Fit-for-purpose conclusions from reports:
  - From `reports/osm-api-water-source-feasibility.md`: keep Overpass as primary water-feature acquisition path; this is the feasible read API for thematic extraction at theater scale.
  - From `reports/poi-overlay-source-feasibility.md`: OSM is suitable as the primary source for special POI overlays (airfields, mines, factories, harbours, powerplants), with category-specific confidence and optional enrichment.
  - From `reports/water-bodies-prototype-comparison.md`: OSM water polygons provide much richer inland-water feature coverage than Natural Earth in this theater and are better suited to detailed water overlays.
  - From `reports/osm-informed-hex-shading-comparison.md`: OSM-water-informed hex shading changed a meaningful subset of cells (prototype), indicating OSM water signals are useful for terrain-class refinement; still prototype-only until explicitly promoted.

### OpenStreetMap Editing API (api.openstreetmap.org)

- Use in repo: not used as a normal layer source.
- Consumption: none in standard pipeline.
- License/fair-use: API policy discourages heavy read-only extraction usage.
- Fit-for-purpose conclusions from reports:
  - From `reports/osm-api-water-source-feasibility.md`: low feasibility for this project's theater-scale water refreshes due to tiny bbox limits and high request fan-out; only acceptable as narrow debug fallback for small bbox checks.

### Geofabrik Ukraine OSM Extract

- Use in repo: optional raw OSM `.pbf` for local/offline preprocess path.
- Consumption: downloaded in raw-intake bootstrap, then local processing.
- License/fair-use: ODbL-derived content; follow both OSM and Geofabrik usage terms.
- Fit for purpose: suitable as optional bulk/raw source when local preprocessing path is used.

### FABDEM 30m

- Use in repo: preferred elevation input for clipped DEM + hillshade generation.
- Consumption: tile index + selected tile fetch/mosaic cached locally.
- License/fair-use: comply with FABDEM terms and keep attribution in derived terrain outputs.
- Fit for purpose: preferred DEM source in current pipeline.

### Copernicus GLO-30

- Use in repo: fallback DEM when FABDEM acquisition fails/unavailable.
- Consumption: reachable-tile selection and mosaic generation.
- License/fair-use: comply with Copernicus/ESA terms and attribution requirements.
- Fit for purpose: operational fallback source.

### ESA WorldCover v200 (2021)

- Use in repo: landcover raster input in intake/bootstrap pipeline.
- Consumption: cloud-optimized tile pulls and clipping to theater extent.
- License/fair-use: comply with ESA WorldCover terms and citation requirements.
- Fit for purpose: suitable landcover baseline/support source.

## Alternative Datasets (Boundary Stack)

### World Bank Official Boundaries (WBOB)

- Why considered: candidate for coherent ADM0/ADM1/ADM2 hierarchy with licensing that is generally easier for redistribution/commercial use than GADM.
- Expected strengths: one provider across levels, consistent schema, and potentially GADM-like geometric detail depending on country/version.
- Fit-for-purpose status in this repo: not yet prototyped locally; planned as a small-scope benchmark against current GeoBoundaries+GADM mix.

### OSM Administrative Boundaries (admin_level relations)

- Why considered: high local detail and very broad global availability.
- Tradeoff: requires heavier normalization/QA and hierarchy stitching than packaged boundary products.
- Fit-for-purpose status in this repo: viable fallback/research path, not current primary boundary stack.

### Current Position (ADM0/ADM1/ADM2)

- ADM0/ADM1 remain on GeoBoundaries (gbOpen) due to stable integration and permissive reuse model.
- ADM2 is currently sourced from cached GADM for geometry detail, with awareness of licensing restrictions.
- WBOB is the next candidate to test for a coherent and permissive single-provider hierarchy.

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
