# Task List

3. [done] Define the application data model in TypeScript for hex cells, oblast/reference regions, terrain layers, and future overlay types.

20. [done] Run local verification that `npm install` and `npm run dev` work, all required layers render, toggles function, and hex inspection shows derived attributes.

21. [done] Tune defaults for readability and brigade-scale usability after a first end-to-end run.

22. [done] Clean up the hex debug panel so it focuses on the true generated center, click position, delta to true center in pixels and kilometers, and removes the noisier derived-centroid fields.

31. [done] Move the Kyiv star marker so it sits on the same location as the Kyiv settlement point instead of the current offset position.

32. [done] Add star markers for the next two biggest Ukrainian cities after Kyiv using the same visual treatment, and make the city marker color read more clearly as red/gray.

33. [done] Add fallback population values for the 50 biggest Ukrainian cities so major-city markers and labels still scale correctly when source settlement records are missing population values.

34. [done] Restore the forest layer detail to the finer level that existed before the current coarser simplification so forest rendering regains the prior fidelity.

35. [done] Propose and implement a consistent mixed hex terrain dominance rule for part-sea, part-land hexes so urbanized coastal hexes such as `HX-E59-N5` and `HX-E40-N23` do not default to `sea` when city or land terrain should dominate.

36. [done] Adjust the `major-city-urban-areas` polygon fill styling so its color reads closer to the city marker palette instead of looking like a separate older settlement color.

37. [done] Stop village-only settlement presence from turning hex terrain styling reddish so village hexes keep terrain-driven colors unless larger settlements justify an urban tint.

38. [done] Stop town-only settlement presence from turning hex terrain styling reddish so town hexes keep terrain-driven colors unless larger settlements justify an urban tint.

39. [done] Finish the settlement search function for city, town, and village names by keeping the result state coherent after selection, so it centers the map on the match, highlights the containing hex, and does not show a false "No settlements matched" message for the chosen result.

43. [done] Clean up the cell details/debug UI: rename the `Cell Details` button to `Cell Information`, rename the debug toggle to `Detailed`, place the `Detailed` control within the same `Cell Information` header layout, and merge the detailed debug content into the main information panel so there is no separate debug panel.

53.3 [done] Cap hillshade tile max zoom to z10 (from z12) and cap map zoom to z10; remove legacy z11/z12 tile folders from local output. Current per-zoom tile counts before pruning were: z10 `2052`, z11 `7844`, z12 `31017` (total z11+z12 removable: `38861` tiles).

54. [done] Prototyped a cache-first OSM water-polygon layer at `data/processed/layers/water-bodies-osm-prototype.geojson` (Overpass tags: `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`) and generated comparison outputs in `reports/water-bodies-prototype-comparison.{json,md}` versus Natural Earth lakes plus DEM-derived sea-connected near-sea-level corridor checks (`2/5/10m` thresholds).

54.1 [done] Evaluated OpenStreetMap Editing API versus current Overpass sourcing for water features; documented coverage/query/rate-limit/cacheability findings in `reports/osm-api-water-source-feasibility.{md,json}` and concluded OSM API is low-feasibility for theater-scale read extraction (retain Overpass as primary, optional small-bbox debug use only).

54.2 [done] Evaluated OSM suitability for special-POI overlay categories (airfields, mines, large factories, harbours, powerplants) and compared alternatives in `reports/poi-overlay-source-feasibility.{md,json}`. Conclusion: OSM remains the best primary geometry source with category-specific supplemental providers (OurAirports, WRI GPPD, Natural Earth ports, Open Supply Hub / MRDS where applicable).

54.3 [done] Prototyped OSM-informed hex shading inputs (including inland OSM-water signal) with `scripts/analytics/prototype-osm-informed-hex-shading.mjs`, wrote `data/processed/hex-cells-osm-shading-prototype.geojson`, and compared visual/readability impact versus current terrain-driven classes in `reports/osm-informed-hex-shading-comparison.{md,json}`.

55. [done] Updated country labeling to a single dominant arc-label treatment per country by removing fallback duplicate label layers and scaling the line-placed country labels significantly larger; Cyrillic labels keep English on a smaller secondary line.

56. [done] Changed operational hex rendering to grid-only overlay by making hex fills fully transparent while preserving hex click interaction, so analytics can use the tiling without terrain color tint.

57. [done] Reworked country labeling to render a single dominant in-theater label per country (including edge-intersecting countries such as Russia and Poland), removed repeated in-country duplicates, and tuned vertical anchor placement to keep labels in visible theater space.

58. [done] Added zoom-behavior label hierarchy: country names remain visible but become more subdued on zoom-in, and oblast names appear inside provinces at a smaller, secondary label size.

59. [done] Increased country-border stroke width to roughly double prior thickness to improve boundary legibility at operational zoom levels.

60. [done] Added province subdivisions (ADM2/raion-level fallback layer) and rendered them as thin dashed boundaries at medium-to-high zoom.

61. [done] Created and expanded `EXTERNAL_SOURCES.md`: includes a full external-source register, per-source usage/consumption and license/fair-use guidance, plus per-source fit-for-purpose conclusions distilled from `reports/osm-api-water-source-feasibility.md`, `reports/poi-overlay-source-feasibility.md`, `reports/water-bodies-prototype-comparison.md`, and `reports/osm-informed-hex-shading-comparison.md`; linked from `README.md`.

62. [pending] Improve ADM1/ADM2 boundary alignment and subdivision quality: clipping ADM2 to best-matching ADM1 masks successfully stopped cross-oblast spillover, but GeoBoundaries ADM2 geometry remained too coarse for acceptable map quality; current change switches ADM2 intake to cached local GADM (`data/cache/public-sources/gadm41_UKR_ADM2.geojson`) while keeping ADM1 from GeoBoundaries, then reapplies ADM1 mask clipping for alignment.

63. [pending] Add a typed attribution configuration module (`src/config/attribution.ts`) defining source id, provider name, required attribution text, canonical link, and show/hide conditions for the app.

64. [pending] Implement a centralized layer-to-source attribution mapping so every visible map layer resolves to one or more source attributions from the shared config.

65. [pending] Add an in-app `Data Attribution` UI panel (sidebar section or modal) that lists full attribution entries for currently active/visible layers.

66. [pending] Add a persistent compact attribution footer in the map UI that always shows minimum required attribution for active layers and links to the full `Data Attribution` panel.

67. [pending] Add a reusable attribution export helper that generates a plain-text attribution block for screenshots/exports using the same shared attribution config and layer mapping logic.

68. [pending] Update README with an `Attribution In App` section and add tests for attribution resolution logic (layer visibility -> required attribution set), plus a short manual verification checklist.

69. [pending] Prototype World Bank Official Boundaries (WBOB) as an alternative boundary stack on a small test subset: ingest ADM0/ADM1/ADM2 into local cache, build comparison layers, and evaluate (a) cross-level boundary coherence (same shared boundaries across ADM levels without drift) and (b) geometry detail parity versus the current GeoBoundaries+GADM stack.
