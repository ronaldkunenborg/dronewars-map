# Task List

Completed tasks that are no longer needed for day-to-day context have been moved to `archival_tasklist.md`.

## Recent Completed Context

61. [done] Created and expanded `EXTERNAL_SOURCES.md`: includes a full external-source register, per-source usage/consumption and license/fair-use guidance, plus per-source fit-for-purpose conclusions distilled from `reports/osm-api-water-source-feasibility.md`, `reports/poi-overlay-source-feasibility.md`, `reports/water-bodies-prototype-comparison.md`, and `reports/osm-informed-hex-shading-comparison.md`; linked from `README.md`.

62. [done] Finalize the production administrative boundary stack using prototype evidence: choose between the current GeoBoundaries+GADM mix and WBOB, then implement the selected ADM0/ADM1/ADM2 source set in the main pipeline with coherent cross-level boundaries and acceptable detail. Boundary rendering is now switched to a topology-derived stack from cached GADM ADM2 polygons (outer ADM2 edges -> ADM0/Ukraine boundary line, shared cross-oblast edges -> ADM1 lines, shared same-oblast edges -> internal ADM2 lines). Natural Earth fallback rendering for UKR has been removed (it introduced cross-source mismatch and visible zoom-threshold instability), and Natural Earth country-line rendering remains filtered to exclude UKR edges so the Ukraine border is driven by the same ADM2-derived topology across visible zoom levels.

62.1 [done] Suppress ADM0 border rendering where the boundary is maritime: when an ADM0 edge coincides with sea frontage, do not draw the ADM0 line there and let the sea polygon edge function as the visible border. Implemented in boundary build: ADM0 output is split into non-maritime line chunks and segments near/in `seas` geometry are removed from `theater-boundary` output.

62.2 [done] Improve ADM2 (subdivision) border visibility while preserving hierarchy below ADM1: increase contrast and legibility at operational zoom levels without making ADM2 borders visually equivalent to ADM1 borders. Implemented style changes: dashed ADM2 retained; width set to `0.7` (z6.2), `1.05` (z8), `1.3` (z10); opacity set to `0.62` (z6.2), `0.68` (z8), `0.72` (z10); color changed to `#7d8478`; dash pattern tightened to `[1.3, 2.0]`.

69. [done] Prototyped World Bank Official Boundaries (WBOB) on a Ukraine subset from the WBOB medium-resolution FeatureServer (item `c030a96882e84205897973ed44b12cf2`, layers ADM0/ADM1/ADM2) and wrote comparison outputs to `reports/wbob-boundary-prototype-comparison.{json,md}`. Result: cross-level coherence passed, but detail parity failed for ADM2 in this source slice (only `24` ADM2 features for Ukraine, with `NAM_2` unavailable across all), so it is not suitable as a production replacement for current ADM2 detail.

## Pending Tasks

62.3 [pending] Prototype a coastal sea-geometry correction step that replaces coarse Natural Earth coastline segments with ADM0-derived coastline where geometries are near each other and the ADM0 segment is maritime (not land on both sides). Goal: preserve detailed coastal border coherence without clipping away valid land-border segments.

63. [pending] Add a typed attribution configuration module (`src/config/attribution.ts`) defining source id, provider name, required attribution text, canonical link, and show/hide conditions for the app.

64. [pending] Implement a centralized layer-to-source attribution mapping so every visible map layer resolves to one or more source attributions from the shared config.

65. [pending] Add an in-app `Data Attribution` UI panel (sidebar section or modal) that lists full attribution entries for currently active/visible layers.

66. [pending] Add a persistent compact attribution footer in the map UI that always shows minimum required attribution for active layers and links to the full `Data Attribution` panel.

67. [pending] Add a reusable attribution export helper that generates a plain-text attribution block for screenshots/exports using the same shared attribution config and layer mapping logic.

68. [pending] Update README with an `Attribution In App` section and add tests for attribution resolution logic (layer visibility -> required attribution set), plus a short manual verification checklist.
