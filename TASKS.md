# Task List

1. [done] Create the project scaffold with Vite, TypeScript, MapLibre, and the base folder structure: `src`, `components`, `map`, `data`, `config`, `scripts`, `data/raw`, `data/processed`.

2. [done] Add core configuration files for Ukraine theater extent, default map view, local data paths, and a configurable `HEX_RADIUS_KM`.

3. [done] Define the application data model in TypeScript for hex cells, oblast/reference regions, terrain layers, and future overlay types.

4. [done] Build the raw-data intake scripts to place source files into `data/raw` and document the expected source inputs.

5. [done] Build preprocessing scripts to clip and normalize geographic layers to the Ukraine theater boundary.

6. [done] Produce processed map layers for theater boundary, oblasts, rivers, water bodies, wetlands, forests, roads, railways, settlements, and terrain-related inputs.

7. [done] Implement hex-grid generation using the configurable radius and clip the hexes to the theater extent.

8. [done] Compute hex metadata such as `id`, centroid, area, adjacency, and parent oblast/reference region.

9. [done] Implement terrain and infrastructure intersection logic to calculate per-hex summaries like forest coverage, wetlands, water barriers, road density, rail presence, settlement score, and elevation roughness.

10. [done] Implement scoring modules for `base_capacity`, `effective_capacity`, `mobility_score`, and `defensibility_score` using configurable heuristics.

11. [done] Export the enriched operational cell dataset into `data/processed` in a format the frontend can load directly.

12. [done] Build the MapLibre map shell with a terrain-first visual style and offline-local data loading.

13. [done] Add map sources and layers in the correct visual order so terrain remains primary and oblasts remain secondary.

14. [done] Implement the operational hex layer with subtle default styling and zoom-dependent border visibility.

15. [done] Generate the missing app-facing processed thematic layers and `layers.json` so the map renders real terrain/reference content instead of only the hex grid.

16. [done] Build UI controls for layer toggles, preset view modes, reset-to-Ukraine, legend, scale bar, and optional coordinate readout.

17. [done] Implement hover/click interaction for hexes with a popup or side panel showing the required cell analytics.

18. [done] Add a lightweight overlay architecture so future frontlines, artillery, logistics, and force placement can be added without refactoring the basemap.

19. [done] Write the README covering install/run steps, the import and preprocessing workflow, generated files, hex-size tuning, capacity logic, and future overlay extension points.

20. [done] Run local verification that `npm install` and `npm run dev` work, all required layers render, toggles function, and hex inspection shows derived attributes.

21. [done] Tune defaults for readability and brigade-scale usability after a first end-to-end run.

22. [done] Clean up the hex debug panel so it focuses on the true generated center, click position, delta to true center in pixels and kilometers, and removes the noisier derived-centroid fields.

23. [done] Add actual cities, towns, villages, and other populated places to the map with their names shown in Ukrainian.

24. [done] Add real forest, swamp, wetland, and related landcover layers so those terrain types are visibly rendered on the map instead of remaining fallback-empty.

25. [done] Replace the current placeholder terrain assumptions in the hex analytics by deriving each hex's attributes from the real terrain and landcover layers so mobility, defensibility, and related fields reflect actual terrain.

26. [done] Make the repository check-in friendly again by reducing or restructuring oversized generated geospatial JSON outputs so Git can handle normal commits reliably.

27. [done] Add caching for public geospatial source retrieval so stable downloads are stored locally and reruns only fetch missing or explicitly refreshed source data instead of requerying everything.

28. [done] Complete the sea-layer integration by generating and publishing `data/processed/layers/seas.geojson`, updating `layers.json`, rerunning analytics, and republishing the live hex dataset.

29. [done] Update the map and inspector verification for the new sea terrain class so the Black Sea renders in a sea color and maritime hexes report `sea` instead of `open`.

30. [done] Update `README.md` to document the geospatial caching behavior, cache locations, refresh expectations, the repository strategy for large generated outputs, and the new sea terrain handling.

31. [done] Move the Kyiv star marker so it sits on the same location as the Kyiv settlement point instead of the current offset position.

32. [done] Add star markers for the next two biggest Ukrainian cities after Kyiv using the same visual treatment, and make the city marker color read more clearly as red/gray.

33. [done] Add fallback population values for the 50 biggest Ukrainian cities so major-city markers and labels still scale correctly when source settlement records are missing population values.

34. [done] Restore the forest layer detail to the finer level that existed before the current coarser simplification so forest rendering regains the prior fidelity.

35. [done] Propose and implement a consistent mixed hex terrain dominance rule for part-sea, part-land hexes so urbanized coastal hexes such as `HX-E59-N5` and `HX-E40-N23` do not default to `sea` when city or land terrain should dominate.

36. [done] Adjust the `major-city-urban-areas` polygon fill styling so its color reads closer to the city marker palette instead of looking like a separate older settlement color.

37. [done] Stop village-only settlement presence from turning hex terrain styling reddish so village hexes keep terrain-driven colors unless larger settlements justify an urban tint.

38. [done] Stop town-only settlement presence from turning hex terrain styling reddish so town hexes keep terrain-driven colors unless larger settlements justify an urban tint.

39. [done] Finish the settlement search function for city, town, and village names by keeping the result state coherent after selection, so it centers the map on the match, highlights the containing hex, and does not show a false "No settlements matched" message for the chosen result.

40. [done] Add a Voronoi cell layer centered on settlements that can be toggled in place of the hex layer, while still respecting country and oblast borders.

41. [done] Under the settlements layer control, add a selector (dropdown or equivalent) for display level: cities only, cities+towns, or cities+towns+villages.

42. [done] Increase the operational hex size by a factor of two and regenerate the derived hex datasets so the map and analytics use the larger cells consistently.

43. [done] Clean up the cell details/debug UI: rename the `Cell Details` button to `Cell Information`, rename the debug toggle to `Detailed`, place the `Detailed` control within the same `Cell Information` header layout, and merge the detailed debug content into the main information panel so there is no separate debug panel.

44. [done] Increase the visual strength of built-up area colors so major-city urban area fills are clearly visible and no longer too subtle.

45. [done] Implement the hillshade layer end-to-end by generating hillshade from elevation inputs, wiring it into the processed layer manifest and map layer registry, and activating the Hillshade toggle in the UI.

46. [done] For elevation and hillshade processing, clip to the full currently displayed operational hex/theater extent (including neighboring border regions) rather than clipping to Ukraine boundaries only.

47. [done] Implement a reproducible raw-data acquisition task that fetches or prepares the minimum required inputs (`theater-boundary`, `oblast-boundaries`, `osm-extract`, `elevation`, `landcover`) into `data/raw/*` so `data:preprocess` and `data:layers` can run on a clean checkout, using FABDEM 30m as the preferred elevation source and Copernicus GLO-30 as fallback.

47.1 [done] Add a single bootstrap intake command (`data:intake:bootstrap`) that stages the required raw sources into `data/raw/*` with cache-aware refresh behavior and skip controls for heavy sources.

47.2 [done] Wire the bootstrap flow and source details into project docs (`README.md` and `scripts/README.md`) so clean-checkout setup is reproducible without manual source registration.

48. [done] Redesign the layer GUI into four sections: `Terrain` (water, wetlands, forests, contours, hillshade), `Logistics` (roads, railways, and `airports` shown greyed/disabled for now), `Settlements` (keep current behavior and controls), and `Boundaries` (oblasts, hexes, voronoi).

49. [done] After completing the layer GUI redesign, update the `View Modes` presets and labels so they align with the new section structure and expected visibility behavior.

50. [done] Review and correct Voronoi generation logic so seed cities and rendered cells use the same country-scope input set (including cross-border consistency), and replace oblast-based clipping with nation-border clipping for Voronoi cells.

51. [done] Add one dominant country-name label per country (not multiple repeated labels), rendered much larger and spanning most of the country with arc-like placement similar to stylized fantasy-map labels; for Cyrillic country names, show the English name directly below in a smaller secondary line.

52. [done] Investigate the impact of excluding low-elevation cells at thresholds below 10m, 50m, and 100m (with sea-level focus), including effects on map coverage, connectivity, analytics outputs, and operational usability.
52.results [done] Current dataset (`7960` cells) centroid-sampled against `terrain/elevation-clipped.tif` shows:
 - `<10m`: remove `1062` cells (`13.34%`), remove `59` city/town-like cells, `5` kept-cell components.
 - `<50m`: remove `1535` cells (`19.28%`), remove `182` city/town-like cells, `11` kept-cell components.
 - `<100m`: remove `2345` cells (`29.46%`), remove `357` city/town-like cells, `23` kept-cell components.
 - Conclusion: `<10m` is the least disruptive cutoff; `<50m` and `<100m` remove substantial inhabited lowlands.

53. [pending] Investigate and benchmark options to reduce terrain generation runtime and output size, then recommend defaults with quality/performance tradeoffs documented.

53.1 [pending] Benchmark reduced cached DEM resolutions (for example 60m and 90m) against current 30m for build time, file size, and visual quality.

53.2 [pending] Evaluate compressed GeoTIFF outputs for cached theater DEM and derivatives (for example `COMPRESS=DEFLATE`, `PREDICTOR=2`, `TILED=YES`) and compare read/write performance.

53.3 [done] Cap hillshade tile max zoom to z10 (from z12) and cap map zoom to z10; remove legacy z11/z12 tile folders from local output. Current per-zoom tile counts before pruning were: z10 `2052`, z11 `7844`, z12 `31017` (total z11+z12 removable: `38861` tiles).

53.4 [pending] Evaluate theater extent reduction strategies (tighter bbox) and quantify impact on processing cost versus border-context loss.

53.5 [pending] Prototype a two-tier terrain workflow: keep full raw elevation cache, but derive a smaller display DEM optimized for hillshade generation and map rendering.
