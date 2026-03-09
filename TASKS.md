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

27. [pending] Add caching for public geospatial source retrieval so stable downloads are stored locally and reruns only fetch missing or explicitly refreshed source data instead of requerying everything.

28. [pending] Complete the sea-layer integration by generating and publishing `data/processed/layers/seas.geojson`, updating `layers.json`, rerunning analytics, and republishing the live hex dataset.

29. [pending] Update the map and inspector verification for the new sea terrain class so the Black Sea renders in a sea color and maritime hexes report `sea` instead of `open`.

30. [pending] Update `README.md` to document the geospatial caching behavior, cache locations, refresh expectations, the repository strategy for large generated outputs, and the new sea terrain handling.
