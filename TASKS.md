# Task List

Completed tasks that are no longer needed for day-to-day context have been moved to `archival_tasklist.md`.
Pending tasks are listed under ## Pending tasks.

## Recent Completed Context

74. [done] Fix Black Sea / Sea of Azov coastal land-sea mismatch in production layers (priority implementation task): resolved Odessa/Crimea coastal sea-over-land and inland-water-in-sea issues through the coastal correction track (coastal land mask, corrected `seas`, `water-bodies` cleanup, curated lockstep/sea-completion hex controls), with user-validated visual outcome.

76. [done] Improve inland hydrology and wetland quality (non-coastal scope): implemented wetland corridor enhancement near processed `water-bodies` plus merge/threshold tuning for small wetland recovery near river/water corridors.

82. [done] Reworked the implemented elevation hillshade baseline and style controls: completed elevation-gated hillshade generation (low-elevation suppression ramp with stronger high-terrain contribution), multi-azimuth hillshade blending (Option 2), post-mask tonal/contrast curve application (Option 1), masked hillshade normalization to 8-bit (`Byte`) for readable tile/PNG contrast, and style-level raster paint tuning in app render config (Option 4).

88. [done] Replaced the manual POI prototype dataset with a full theater-wide processed POI pipeline from cached OSM data in `data:layers:public`, with scoped inclusion rules, deterministic deduplication, retained source tag metadata, and `--poi-only` iteration path; follow-up refinements include one civilian port indicator per qualifying city and stricter anti-noise filtering for Azovstal/rocket overtrigger cases.

89. [done] Improve visual separation between wetlands and forests in map styling: shifted wetlands towards a browner tone and forests slightly greener in map rendering and layer-panel legend colors; user validated the result.

91. [done] Added runtime resource preflight log in `data:layers:public` before worker-concurrency output: prints available cores and available system memory (GB).

92. [done] Defined and versioned a shared hypsometric elevation color-ramp specification in `src/config/hypsometric-ramp.json` and wired it as the single source of truth for build-time color classes and UI legend labels.

93. [done] Extended `scripts/layers/fetch-public-layers.mjs` to build cached `terrain-hypsometric-relief` output from local DEM cache: generated color-relief, produced fused color+relief raster, and emitted PNG/tiled outputs alongside existing hillshade products.

94. [done] Published `terrain-hypsometric-relief` in processed layer manifest and integrated mount support as an additive terrain raster while retaining existing hillshade output for comparison/fallback.

95. [done] Added map rendering + layer-panel controls for the elevation-relief layer (`src/map/layerRegistry.ts`, `src/components/LayerPanel.tsx`) with zoom-aware raster paint settings and default visibility enabled.

96. [done] Added an in-app vertical elevation legend (meter classes + swatches) in the layer panel, wired to the same shared ramp definition used by raster generation.

97. [done] Validated the new elevation map in two stages: (1) nearby `--hex-only=HX-E72-N11,HX-E73-N11,HX-E72-N12` build run, (2) full theater `data:layers:public` build run; both completed successfully and produced `terrain-hypsometric-relief` outputs in `layers.json`.

102. [done] Improved runtime memory reporting accuracy in `data:layers:public` preflight output: now logs both `System memory (total)` and `System memory (currently available/free)` with explicit labels, so operator-facing capacity signals are actionable instead of relying on total memory alone.

## Pending Tasks

98. [done] Finalized hypsometric coverage variants in one build pass so mode outputs are distinct: removed hillshade-mask coupling for `100m+` and `100% land` alpha generation, kept `current` tied to the existing mask, and confirmed distinct variant artifacts for `current`, `100m+`, `100% land`, and `100% land+sea` plus runtime `off` mode toggle.

98.1. [done] Added explicit sea-render behavior for `100% land + sea` mode: `sea-fill` is suppressed while that mode is active so hypsometric sea classes are visible, and normal sea visibility is restored when switching to other elevation modes.

98.2. [done] Closed variant-alpha/interpolation follow-up with an explicit product decision: removed runtime multi-variant hypsometric modes and retained only `100% land coverage` (plus `off`), while keeping hillshade out of web runtime loading to reduce memory pressure. Observation: prior multi-mode behavior increased complexity and did not yield reliable operator value versus a single stable land mode.

98.3. [done] Closed sea bathymetry ingestion as intentionally out-of-scope for now: evaluated available local candidate (`Bathymetric-map-of-the-Black-Sea.ppm`) and found it non-georeferenced image-only input, not suitable for direct ingestion without manual georeferencing + legend calibration. Decision: do not pursue sea bathymetry pipeline at this time (`overkill` for current objective); keep the active elevation product land-only.

105. [pending] If you create links they have the form "https://file+.vscode-resource.vscode-cdn.net/c%3A/Users/RonaldKunenborg/.vscode/extensions/openai.chatgpt-26.323.20928-win32-x64/webview/" - but they don't work. 

## Refinements

99. [pending] Investigate targeted river-reconstruction scope inflation after broad river-gap checklist runs (`--include-all-hexes`): prevent `buildTargetedHexRiverSystemReconstructionLayer` from ingesting very large `flaggedHexes` sets unintentionally, and implement deterministic scope control (for example theater-only default, curated include list, and/or max-target guard with explicit override logging).

100. [pending] Investigate and fix zoom-dependent polygon shape shifts where water/body geometries appear to drop vertices when zooming out (visible geometry changes between zoom levels in some hexes). Scope should include geometry hygiene, simplification/tolerance behavior, and renderer/source settings so polygon silhouettes remain stable across operational zoom transitions. Include current clipping examples `HX-E58-N8`, `HX-E51-N13` and `HX-E68-N10` in the investigation set.

101. [pending] Research whether dams should be represented as a dedicated map layer instead of POI markers: compare map readability, operational usefulness, and overlap with hydro/power semantics; propose source mapping, style behavior, and toggle strategy if split into a separate layer.

## Possible Future Tasks

103. [future] Prototype and evaluate an OSM-derived high-detail coastal water mask as the long-term coastal source upgrade: design a replacement-quality mask pipeline (coastline/water polygons), compare against the current Natural Earth coastal behavior in problematic strips, and define integration criteria so Task `74` can swap to this source without architectural changes. When finalized, re-check AGENTS.md and remove no-longer-needed temporary coastal rules.

104. [future] Once we have fixed the water bodies, at zoomlevel 7.5 and lower the rivers look better than the water bodies. You can keep the water bodies but the rivers should be enabled at that point when water bodies are on. But we should only do this when all water issues are fixed.
