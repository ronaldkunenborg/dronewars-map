# Task List

Completed tasks that are no longer needed for day-to-day context have been moved to `archival_tasklist.md`.

## Recent Completed Context

61. [done] Created and expanded `EXTERNAL_SOURCES.md`: includes a full external-source register, per-source usage/consumption and license/fair-use guidance, plus per-source fit-for-purpose conclusions distilled from `reports/osm-api-water-source-feasibility.md`, `reports/poi-overlay-source-feasibility.md`, `reports/water-bodies-prototype-comparison.md`, and `reports/osm-informed-hex-shading-comparison.md`; linked from `README.md`.

62. [done] Finalize the production administrative boundary stack using prototype evidence: choose between the current GeoBoundaries+GADM mix and WBOB, then implement the selected ADM0/ADM1/ADM2 source set in the main pipeline with coherent cross-level boundaries and acceptable detail. Boundary rendering is now switched to a topology-derived stack from cached GADM ADM2 polygons (outer ADM2 edges -> ADM0/Ukraine boundary line, shared cross-oblast edges -> ADM1 lines, shared same-oblast edges -> internal ADM2 lines). Natural Earth fallback rendering for UKR has been removed (it introduced cross-source mismatch and visible zoom-threshold instability), and Natural Earth country-line rendering remains filtered to exclude UKR edges so the Ukraine border is driven by the same ADM2-derived topology across visible zoom levels.

62.1 [done] Suppress ADM0 border rendering where the boundary is maritime: when an ADM0 edge coincides with sea frontage, do not draw the ADM0 line there and let the sea polygon edge function as the visible border. Implemented in boundary build: ADM0 output is split into non-maritime line chunks and segments near/in `seas` geometry are removed from `theater-boundary` output.

62.2 [done] Improve ADM2 (subdivision) border visibility while preserving hierarchy below ADM1: increase contrast and legibility at operational zoom levels without making ADM2 borders visually equivalent to ADM1 borders. Implemented style changes: dashed ADM2 retained; width set to `0.7` (z6.2), `1.05` (z8), `1.3` (z10); opacity set to `0.62` (z6.2), `0.68` (z8), `0.72` (z10); color changed to `#7d8478`; dash pattern tightened to `[1.3, 2.0]`.

62.3 [done] Prototype a coastal sea-geometry correction step that replaces coarse Natural Earth coastline segments with ADM0-derived coastline where geometries are near each other and the ADM0 segment is maritime (not land on both sides). Implemented prototype: derive UKR ADM0 polygon from the GADM ADM2 topology step, correct `seas` by subtracting that ADM0 land geometry (`seas - adm0`), then apply maritime ADM0 segment suppression against the corrected sea layer instead of raw Natural Earth seas. Outcome: not sufficient in complex delta/coastal zones (coastline detail mismatch remains); maritime suppression has been reverted and continuous ADM0 rendering restored.

69. [done] Prototyped World Bank Official Boundaries (WBOB) on a Ukraine subset from the WBOB medium-resolution FeatureServer (item `c030a96882e84205897973ed44b12cf2`, layers ADM0/ADM1/ADM2) and wrote comparison outputs to `reports/wbob-boundary-prototype-comparison.{json,md}`. Result: cross-level coherence passed, but detail parity failed for ADM2 in this source slice (only `24` ADM2 features for Ukraine, with `NAM_2` unavailable across all), so it is not suitable as a production replacement for current ADM2 detail.

## Pending Tasks

62.3.1 [pending] discuss the report of riverhexes to fix before proceeding with any task.

62.4 [pending] Prototype an OSM-derived high-detail coastal water mask (coastline/water polygons) and use it for maritime border handling so coastal sea-land edges align with detailed ADM0/shoreline geometry in problematic zones (for example Danube Delta / Black Sea coast). Attempted prototype: build a hybrid maritime suppression mask by combining Natural Earth seas with OSM water polygons selected near both sea and ADM0 (`nearSea` + `nearBorder` thresholds), then suppress ADM0 maritime segments against this hybrid mask while leaving displayed sea fill source unchanged. Result: still over-suppresses in problematic coastal strips; continuous ADM0 rendering has been restored pending a better coastline source/approach. When we finally fix this, examine AGENTS.md for rules that are no longer required.

62.5 [pending] Improve hydrology/wetland source quality for map rendering: promote higher-detail inland water geometry (OSM water polygons) over coarse Natural Earth inland-water representation, and prototype a wetlands quality upgrade using a hybrid of OSM wetland polygons plus ESA WorldCover wetland support to reduce false/missing extents. Progress: `water-bodies` now prefers local OSM `.pbf` extraction (GDAL/OGR multipolygon pull with caching, simplification, and min-area filtering) with fallback to Overpass prototype; this restores major inland water in problem zones (including Sasyk near Tatarbunary) and keeps normal builds cache-based. Wetlands hybrid prototype still pending.

62.6 [pending] The landborders of the area around the black sea are not correct, just look at hex HX-E75-N12, HX-E77-N12 etc. to see water bodies in the sea area. In hex HX-E72-N11 Kerch is in a location that looks wrong. It seems the ADM0 border is better than the current land/sea border drawing (for instance near Odessa, see hex HX-E36-N22). Please check that and suggest a fix. Suggested fix path: build one theater-wide coastal land mask (Ukraine ADM topology + neighboring ADM0 polygons), recompute `seas` as `rawSeas - coastalLandMask` across the full theater (not only Ukraine), and subtract corrected seas from `water-bodies` to avoid sea/water duplication; keep this architecture compatible with replacing the coastal mask input in Task `62.4` (OSM-derived coastal water mask).

62.7 [pending] The GUI should be changed a bit. The "detailed" button should become part of the Cell information button (just a spacer between them), visually. The search box on the right should be moved to the left, right after the cell information button, and should only contain the text box and a find button right behind it.

62.8 [done] Selecting a hex now highlights it with a thicker yellow border (and subtle yellow fill), clicking outside deselects it, and the cell panel toggle now shows `Hex: <hovered-id>` while preserving stable button width when not hovering (shows `Hex: n/a` without resizing).

63. [pending] Add a typed attribution configuration module (`src/config/attribution.ts`) defining source id, provider name, required attribution text, canonical link, and show/hide conditions for the app.

64. [pending] Implement a centralized layer-to-source attribution mapping so every visible map layer resolves to one or more source attributions from the shared config.

65. [pending] Add an in-app `Data Attribution` UI panel (sidebar section or modal) that lists full attribution entries for currently active/visible layers.

66. [pending] Add a persistent compact attribution footer in the map UI that always shows minimum required attribution for active layers and links to the full `Data Attribution` panel.

67. [pending] Add a reusable attribution export helper that generates a plain-text attribution block for screenshots/exports using the same shared attribution config and layer mapping logic.

68. [pending] Update README with an `Attribution In App` section and add tests for attribution resolution logic (layer visibility -> required attribution set), plus a short manual verification checklist.
