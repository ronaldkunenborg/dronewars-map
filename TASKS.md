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

Note: the current public fallback layer set leaves `forests` and `wetlands` empty. Full generation of those layers still needs the intended landcover/OSM processing pipeline.
