# Archival Task List

This archive contains completed tasks from `TASKS.md` that are directly understandable from `README.md`.

Archive date: 2026-03-13

## README-Evidenced Completed Tasks

| Task(s) | Completed outcome | Where this is evidenced in `README.md` |
|---|---|---|
| 1, 12 | App scaffold and MapLibre shell are in place | `Current Status` (`Vite + React + TypeScript + MapLibre application shell`) |
| 2, 7, 8, 42 | Configurable and generated operational hex grid, with tunable hex radius | `Current Status`, `What You Should See`, `Hex Grid Notes` (`hexRadiusKm`) |
| 4, 47, 47.1, 47.2 | Reproducible raw intake/bootstrap workflow | `Data Workflow` (`npm run data:intake:bootstrap`, listed raw inputs and controls) |
| 5, 6, 15 | Preprocess + processed layers pipeline and app-facing layer outputs | `Data Workflow` and `What You Should See` (thematic layers listed) |
| 9, 10, 11 | Hex analytics and scoring outputs are produced and exported | `Capacity and Analytics` and `Generated Files` |
| 13, 14, 16, 17 | Map sources/layers, operational hex display, controls, and cell inspector interaction | `Current Status`, `What You Should See`, `Current UI` |
| 18 | Overlay architecture exists for future operational overlays | `Current Status`, `Current UI` (`overlay slots`) |
| 19 | Project README covers install/run, workflows, generated files, tuning, and analytics context | README structure itself (`Install and Run`, `Data Workflow`, `Generated Files`, `Hex Grid Notes`, `Capacity and Analytics`) |
| 23, 24 | Settlements and landcover terrain layers are present and rendered | `What You Should See`, processed layer list |
| 25 | Terrain-driven analytics replaced placeholders | `Capacity and Analytics` (terrain/infrastructure summary outputs) |
| 26 | Repository strategy updated for large generated data handling | `Generated Files` (`Repository strategy for generated geodata`) |
| 27, 30 | Public-source caching behavior and refresh model documented | `Data Workflow` (`Public-source cache behavior`, `Refresh expectations`) |
| 28, 29 | Sea-layer integration and sea terrain classification | `What You Should See` (`seas`), `Capacity and Analytics` (`Sea terrain handling`) |
| 40, 50 | Settlement Voronoi layer and generation workflow | `Current Status`, `What You Should See`, `Current UI`, `data:layers:voronoi` command |
| 41 | Settlement display-level selector available | `Current Status`, `Current UI` |
| 44 | Major-city urban areas visibly rendered beneath city labels | `What You Should See`, `Current UI` (`major-city urban extent fills`) |
| 45, 46 | Hillshade generation and terrain elevation workflow wired with GDAL tooling | `OSGeo4W (Windows GDAL/PROJ)`, `Data Workflow` (`--elevation-only`) |
| 48, 49 | Layer controls and preset behavior are implemented and documented | `Current UI` (`layer toggles`, `preset modes`) |
| 52, 52.results | Elevation-threshold investigation completed with report command | `Report Commands` (`npm run data:analytics:elevation-thresholds`) |
| 53, 53.results, 53.1 | DEM resolution/runtime benchmark completed with report command and recommendation | `Report Commands` (`npm run data:analytics:dem-resolutions`) and benchmark summary |
| 54 | Cache-first OSM water-polygon prototype comparison was executed and documented | `Report Commands` (`npm run data:analytics:water-sources`) and output files listed under that command |
| 54.1, 54.2, 54.3 | OSM source-feasibility and OSM-informed shading prototypes are documented with report artifacts and conclusions | `Report Commands` (items 5-7) and listed report outputs (`osm-api-water-source-feasibility`, `poi-overlay-source-feasibility`, `osm-informed-hex-shading-comparison`) |
| 55, 57, 58, 59, 60 | Country-label consolidation, thicker country borders, zoom hierarchy, and ADM2 subdivision overlay are implemented | `Current UI` (single dominant country labels, thicker borders, zoom-based hierarchy, ADM2 overlay) and `What You Should See` (raion-level subdivisions) |
| 22, 39, 43 | Hex/cell interaction and search behavior were refined (unified `Cell Information` + `Detailed`, settlement search centering/highlight behavior) | `Map Interaction Notes` |
| 31, 32, 33 | Priority city star placement and fallback population scaling decisions are captured | `Label and Styling Notes` |
| 34, 35, 36, 37, 38 | Terrain and styling rule refinements (forest fidelity, mixed coastal rule, urban-area color harmonization, village/town tint suppression) are documented | `Label and Styling Notes` |

## Notes

- This file is for archival/readability so active planning in `TASKS.md` can stay shorter.
- If `README.md` changes substantially, this archive should be refreshed to keep evidence mapping accurate.

## Archive Update: 2026-03-14

Moved from `TASKS.md` to archive to keep the active list focused:

- UI/debug/search refinements: 22, 39, 43
- settlement marker/label refinements: 31, 32, 33
- terrain and hex-painting refinements: 34, 35, 36, 37, 38, 56
- elevation/reporting/data-source study tasks: 53.3, 54, 54.1, 54.2, 54.3
- country/administrative labeling and border refinements: 55, 57, 58, 59, 60

Rationale:

- These are complete implementation/history tasks that are unlikely to be needed for immediate planning context.
- Boundary-stack and attribution context remains in `TASKS.md` as recent completed context plus pending work.

### Moved Task Details

#### UI, Debug, and Search

22. [done] Clean up the hex debug panel so it focuses on the true generated center, click position, delta to true center in pixels and kilometers, and removes the noisier derived-centroid fields.

39. [done] Finish the settlement search function for city, town, and village names by keeping the result state coherent after selection, so it centers the map on the match, highlights the containing hex, and does not show a false "No settlements matched" message for the chosen result.

43. [done] Clean up the cell details/debug UI: rename the `Cell Details` button to `Cell Information`, rename the debug toggle to `Detailed`, place the `Detailed` control within the same `Cell Information` header layout, and merge the detailed debug content into the main information panel so there is no separate debug panel.

#### Settlement and Label Refinements

31. [done] Move the Kyiv star marker so it sits on the same location as the Kyiv settlement point instead of the current offset position.

32. [done] Add star markers for the next two biggest Ukrainian cities after Kyiv using the same visual treatment, and make the city marker color read more clearly as red/gray.

33. [done] Add fallback population values for the 50 biggest Ukrainian cities so major-city markers and labels still scale correctly when source settlement records are missing population values.

#### Terrain and Hex-Painting Refinements

34. [done] Restore the forest layer detail to the finer level that existed before the current coarser simplification so forest rendering regains the prior fidelity.

35. [done] Propose and implement a consistent mixed hex terrain dominance rule for part-sea, part-land hexes so urbanized coastal hexes such as `HX-E59-N5` and `HX-E40-N23` do not default to `sea` when city or land terrain should dominate.

36. [done] Adjust the `major-city-urban-areas` polygon fill styling so its color reads closer to the city marker palette instead of looking like a separate older settlement color.

37. [done] Stop village-only settlement presence from turning hex terrain styling reddish so village hexes keep terrain-driven colors unless larger settlements justify an urban tint.

38. [done] Stop town-only settlement presence from turning hex terrain styling reddish so town hexes keep terrain-driven colors unless larger settlements justify an urban tint.

56. [done] Changed operational hex rendering to grid-only overlay by making hex fills fully transparent while preserving hex click interaction, so analytics can use the tiling without terrain color tint.

#### Elevation and Source Feasibility Studies

53.3 [done] Cap hillshade tile max zoom to z10 (from z12) and cap map zoom to z10; remove legacy z11/z12 tile folders from local output. Current per-zoom tile counts before pruning were: z10 `2052`, z11 `7844`, z12 `31017` (total z11+z12 removable: `38861` tiles).

54. [done] Prototyped a cache-first OSM water-polygon layer at `data/processed/layers/water-bodies-osm-prototype.geojson` (Overpass tags: `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`) and generated comparison outputs in `reports/water-bodies-prototype-comparison.{json,md}` versus Natural Earth lakes plus DEM-derived sea-connected near-sea-level corridor checks (`2/5/10m` thresholds).

54.1 [done] Evaluated OpenStreetMap Editing API versus current Overpass sourcing for water features; documented coverage/query/rate-limit/cacheability findings in `reports/osm-api-water-source-feasibility.{md,json}` and concluded OSM API is low-feasibility for theater-scale read extraction (retain Overpass as primary, optional small-bbox debug use only).

54.2 [done] Evaluated OSM suitability for special-POI overlay categories (airfields, mines, large factories, harbours, powerplants) and compared alternatives in `reports/poi-overlay-source-feasibility.{md,json}`. Conclusion: OSM remains the best primary geometry source with category-specific supplemental providers (OurAirports, WRI GPPD, Natural Earth ports, Open Supply Hub / MRDS where applicable).

54.3 [done] Prototyped OSM-informed hex shading inputs (including inland OSM-water signal) with `scripts/analytics/prototype-osm-informed-hex-shading.mjs`, wrote `data/processed/hex-cells-osm-shading-prototype.geojson`, and compared visual/readability impact versus current terrain-driven classes in `reports/osm-informed-hex-shading-comparison.{md,json}`.

#### Country and Administrative Boundary Labeling

55. [done] Updated country labeling to a single dominant arc-label treatment per country by removing fallback duplicate label layers and scaling the line-placed country labels significantly larger; Cyrillic labels keep English on a smaller secondary line.

57. [done] Reworked country labeling to render a single dominant in-theater label per country (including edge-intersecting countries such as Russia and Poland), removed repeated in-country duplicates, and tuned vertical anchor placement to keep labels in visible theater space.

58. [done] Added zoom-behavior label hierarchy: country names remain visible but become more subdued on zoom-in, and oblast names appear inside provinces at a smaller, secondary label size.

59. [done] Increased country-border stroke width to roughly double prior thickness to improve boundary legibility at operational zoom levels.

60. [done] Added province subdivisions (ADM2/raion-level fallback layer) and rendered them as thin dashed boundaries at medium-to-high zoom.

## README Evidence Gaps (for moved tasks)

The moved tasks below are not yet explicitly recoverable from `README.md` alone and currently rely on code/history context:

- 53.3
- 56
