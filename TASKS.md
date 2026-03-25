# Task List

Completed tasks that are no longer needed for day-to-day context have been moved to `archival_tasklist.md`.
Pending tasks are listed under ## Pending tasks.

## Recent Completed Context

74. [done] Fix Black Sea / Sea of Azov coastal land-sea mismatch in production layers (priority implementation task): resolved Odessa/Crimea coastal sea-over-land and inland-water-in-sea issues through the coastal correction track (coastal land mask, corrected `seas`, `water-bodies` cleanup, curated lockstep/sea-completion hex controls), with user-validated visual outcome.

76. [done] Improve inland hydrology and wetland quality (non-coastal scope): implemented wetland corridor enhancement near processed `water-bodies` plus merge/threshold tuning for small wetland recovery near river/water corridors.

88. [done] Replaced the manual POI prototype dataset with a full theater-wide processed POI pipeline from cached OSM data in `data:layers:public`, with scoped inclusion rules, deterministic deduplication, retained source tag metadata, and `--poi-only` iteration path; follow-up refinements include one civilian port indicator per qualifying city and stricter anti-noise filtering for Azovstal/rocket overtrigger cases.

89. [done] Improve visual separation between wetlands and forests in map styling: shifted wetlands towards a browner tone and forests slightly greener in map rendering and layer-panel legend colors; user validated the result.

91. [done] Added runtime resource preflight log in `data:layers:public` before worker-concurrency output: prints available cores and available system memory (GB).

## Pending Tasks

82. [pending] Rework elevation hillshade visual balance: current terrain appears too shadowed while mountain forms remain insufficiently legible. Coverage is currently in a good/acceptable range and should be preserved; remaining work is tonal tuning. Current approach implemented: generate elevation-gated hillshade (low-elevation suppression ramp, stronger contribution on higher terrain), blend multi-azimuth hillshades (Option 2) for orientation-robust relief readability, apply a post-mask tonal/contrast curve in hillshade generation (Option 1), then normalize masked hillshade to 8-bit (`Byte`) before tile/PNG output to recover useful source contrast. Option 4 (style-only raster paint tuning in app render config) is completed. Next implementation step is Option 3: blend a modest slope-derived component into hillshade for ridge/valley separation (terrain rebuild required), then retune the post-mask curve to reduce low-zoom dark mass while preserving high-zoom landform contrast. First-pass style/raster adjustments are working, but the result still needs additional tuning (opacity/contrast/brightness and threshold calibration) before theater-wide finalization.

## Refinements

84. [pending] Investigate targeted river-reconstruction scope inflation after broad river-gap checklist runs (`--include-all-hexes`): prevent `buildTargetedHexRiverSystemReconstructionLayer` from ingesting very large `flaggedHexes` sets unintentionally, and implement deterministic scope control (for example theater-only default, curated include list, and/or max-target guard with explicit override logging).

85. [pending] Investigate and fix zoom-dependent polygon shape shifts where water/body geometries appear to drop vertices when zooming out (visible geometry changes between zoom levels in some hexes). Scope should include geometry hygiene, simplification/tolerance behavior, and renderer/source settings so polygon silhouettes remain stable across operational zoom transitions. Include current clipping examples `HX-E58-N8`, `HX-E51-N13` and `HX-E68-N10` in the investigation set.

90. [pending] Research whether dams should be represented as a dedicated map layer instead of POI markers: compare map readability, operational usefulness, and overlap with hydro/power semantics; propose source mapping, style behavior, and toggle strategy if split into a separate layer.
92. [pending] Investigate runtime memory reporting accuracy in `data:layers:public`: current preflight log reports total system memory, which can overstate practically available memory. Update reporting to include truly available/free memory (and clear labeling for total vs available) so operator-facing capacity signals are actionable.

## Possible Future Tasks

75. [future] Prototype and evaluate an OSM-derived high-detail coastal water mask as the long-term coastal source upgrade: design a replacement-quality mask pipeline (coastline/water polygons), compare against the current Natural Earth coastal behavior in problematic strips, and define integration criteria so Task `74` can swap to this source without architectural changes. When finalized, re-check AGENTS.md and remove no-longer-needed temporary coastal rules.

86. [future] Once we have fixed the water bodies, at zoomlevel 7.5 and lower the rivers look better than the water bodies. You can keep the water bodies but the rivers should be enabled at that point when water bodies are on. But we should only do this when all water issues are fixed.
