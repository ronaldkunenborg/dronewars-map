# Task List

Completed tasks that are no longer needed for day-to-day context have been moved to `archival_tasklist.md`.
Pending tasks are listed under ## Pending tasks.

## Recent Completed Context

61. [done] Created and expanded `EXTERNAL_SOURCES.md`: includes a full external-source register, per-source usage/consumption and license/fair-use guidance, plus per-source fit-for-purpose conclusions distilled from `reports/osm-api-water-source-feasibility.md`, `reports/poi-overlay-source-feasibility.md`, `reports/water-bodies-prototype-comparison.md`, and `reports/osm-informed-hex-shading-comparison.md`; linked from `README.md`.

62. [done] Finalize the production administrative boundary stack using prototype evidence: choose between the current GeoBoundaries+GADM mix and WBOB, then implement the selected ADM0/ADM1/ADM2 source set in the main pipeline with coherent cross-level boundaries and acceptable detail. Boundary rendering is now switched to a topology-derived stack from cached GADM ADM2 polygons (outer ADM2 edges -> ADM0/Ukraine boundary line, shared cross-oblast edges -> ADM1 lines, shared same-oblast edges -> internal ADM2 lines). Natural Earth fallback rendering for UKR has been removed (it introduced cross-source mismatch and visible zoom-threshold instability), and Natural Earth country-line rendering remains filtered to exclude UKR edges so the Ukraine border is driven by the same ADM2-derived topology across visible zoom levels.

63. [done] Suppress ADM0 border rendering where the boundary is maritime: when an ADM0 edge coincides with sea frontage, do not draw the ADM0 line there and let the sea polygon edge function as the visible border. Implemented in boundary build: ADM0 output is split into non-maritime line chunks and segments near/in `seas` geometry are removed from `theater-boundary` output.

64. [done] Improve ADM2 (subdivision) border visibility while preserving hierarchy below ADM1: increase contrast and legibility at operational zoom levels without making ADM2 borders visually equivalent to ADM1 borders. Implemented style changes: dashed ADM2 retained; width set to `0.7` (z6.2), `1.05` (z8), `1.3` (z10); opacity set to `0.62` (z6.2), `0.68` (z8), `0.72` (z10); color changed to `#7d8478`; dash pattern tightened to `[1.3, 2.0]`.

65. [done] Prototype a coastal sea-geometry correction step that replaces coarse Natural Earth coastline segments with ADM0-derived coastline where geometries are near each other and the ADM0 segment is maritime (not land on both sides). Implemented prototype: derive UKR ADM0 polygon from the GADM ADM2 topology step, correct `seas` by subtracting that ADM0 land geometry (`seas - adm0`), then apply maritime ADM0 segment suppression against the corrected sea layer instead of raw Natural Earth seas. Outcome: not sufficient in complex delta/coastal zones (coastline detail mismatch remains); maritime suppression has been reverted and continuous ADM0 rendering restored.

66. [done] Applied staged river-gap remediation flow using high-detail OSM river detail as the primary reconstruction input for normal `water-bodies` visibility (not z12-only rendering), with targeted polygon reconstruction retained as a fallback path after review.

67. [done] Created a structured `docs/` documentation set and linked it from `README.md`: `docs/INDEX.md`, `docs/setup/windows-osgeo4w.md`, `docs/pipeline/public-layer-builder.md`, `docs/pipeline/full-local-builder.md`, `docs/hydrology/river-gap-repair.md`, `docs/reports/analytics-reports.md`, `docs/data/external-sources.md`, `docs/ui/map-layers-and-controls.md`, `docs/dev/tasks-and-governance.md`, and ADRs under `docs/decisions/`.

68. [done] Updated the top-left map UI controls: search moved from the separate right panel into the cell-controls row directly after the Cell Information control group, and the `Detailed` control is now visually integrated with the cell toggle (shared grouped styling with a spacer/divider) instead of a separate detached checkbox block.

69. [done] Cell panel toggle widened for current hex identifier lengths and now includes an explicit open/close state indicator (`▲`/`▼`) tied to panel visibility.

70. [done] Search now supports hex IDs in addition to settlements (for example `HX-W19-N50`), including click/submit focus behavior that highlights and centers the selected hex.

71. [done] Selecting a hex now highlights it with a thicker yellow border (and subtle yellow fill), clicking outside deselects it, and the cell panel toggle now shows `Hex: <hovered-id>` while preserving stable button width when not hovering (shows `Hex: n/a` without resizing). Follow-up fix: selection now writes canonical plain GeoJSON hex features (instead of rendered-feature objects) so MapLibre serialization errors are avoided and click-selection remains stable.

72. [done] Parallelized expensive `data:layers:public` stages with bounded concurrency (`--workers=<n>`): tiled Overpass area fetches now run with a capped worker pool while preserving deterministic merge order, and local OSM PBF water/river extraction now runs in parallel with the network-bound layer fetch stage.

73. [done] Prototyped World Bank Official Boundaries (WBOB) on a Ukraine subset from the WBOB medium-resolution FeatureServer (item `c030a96882e84205897973ed44b12cf2`, layers ADM0/ADM1/ADM2) and wrote comparison outputs to `reports/wbob-boundary-prototype-comparison.{json,md}`. Result: cross-level coherence passed, but detail parity failed for ADM2 in this source slice (only `24` ADM2 features for Ukraine, with `NAM_2` unavailable across all), so it is not suitable as a production replacement for current ADM2 detail.

74. [done] Fix Black Sea / Sea of Azov coastal land-sea mismatch in production layers (priority implementation task): reproduced and resolved the Odessa/Crimea coastal sea-over-land and inland-water-in-sea issues through the operational coastal correction track (theater coastal land mask, corrected `seas`, `water-bodies` cleanup, curated lockstep/sea-completion hex controls), with user-validated visual outcome.

74.1 [done] Prototyped and implemented bounded compute-worker parallelization for post-elevation vector assembly prefilter work (bbox clipping + country/urban/settlement/clipped-ADM prep) with deterministic output and serial fallback on worker failure.

86. [done] Added generated coastal lockstep eligibility diagnostics report outputs (`reports/coastal-lockstep-eligibility.{json,md}`) and command (`npm run data:analytics:coastal-lockstep`) to audit per-hex inclusion logic (Ukraine membership, boundary test, sea/neighbor-sea test, auto-eligibility, manual override, and exclusion reasons).

74.2 [done] Parallelized coastal `corrected water-bodies` subtraction in `data:layers:public` (including `--coastal-only`) using bounded compute workers with deterministic merge order and serial fallback on worker failure.

76. [done] Improve inland hydrology and wetland quality (non-coastal scope): continue promoting higher-detail inland OSM water geometry quality and implement wetlands upgrade using OSM wetlands + ESA WorldCover support. Keep this task focused on inland rivers/lakes/wetlands quality and exclude sea-land border reconciliation (handled by `74`/`75`).
Findings summary (current pipeline):
- Wetland tag coverage is broad enough (`natural=wetland` + `wetland=*`, including marsh/swamp/bog/fen/reedbed/wet_meadow), so missing coverage is primarily not a tag-selection problem.
- Main loss is filtering/simplification: `minApproxAreaKm2=2` and `maxVertices=32` drop most fragmented wetlands (especially in floodplains).
- Merge-only at small radii has limited effect theater-wide (`100m`/`250m` minimal gain), while `500m` begins to recover meaningful area.
- For operational intent (mechanized mobility), the user priority is more wetland indicators near river/water corridors; non-river inland fragments are lower priority.
Intended solution:
- Use processed `water-bodies` as the primary corridor mask for wetland enhancement.
- Keep existing large wetlands (`>=2 km²`) as baseline.
- Add a second pass from raw small wetlands (`<2 km²`) constrained to a corridor around processed `water-bodies`, then merge nearby fragments and retain corridor clusters via lower threshold.
- Make corridor/merge/threshold values configurable (initial tuning target: corridor `~500m`, merge `250-500m`, lower retained-area threshold for corridor clusters).
Implementation status:
- Implemented globally in `data:layers:public`: wetlands are split into baseline (`>=2 km²`) and small candidates, then small candidates near processed `water-bodies` are merged and appended using configurable corridor parameters.
- User-validated visual outcome across pilot and broader scopes; task is complete.

77. [done] Introduce a minimal attribution documentation source at `docs/ATTRIBUTION.md` and link it from both `README.md` and `docs/INDEX.md`.

78. [done] Added a simple in-app attribution footer/link (static text + link to `docs/ATTRIBUTION.md`) without per-layer dynamic resolution.

79. [done] Added a lightweight manual attribution checklist for app/docs updates only in `docs/ATTRIBUTION.md`: verify in-app attribution footer/link visibility, docs link integrity, and source-list freshness (no export workflow scope).

80. [done] Reworked map UI information density: attribution moved to a compact on-map chip, map status notices reduced in footprint, hex panel width reduced, and inspector content switched to collapsible sections (`Summary`, `Terrain`, `Infrastructure`, `Capacity`, `Debug`) so the separate `Detailed` toggle is no longer needed.

81. [done] Created POI prototype track: selected OSM as the primary source after tradeoff analysis (`docs/data/poi-source-selection.md`), then added a non-builder prototype overlay loaded from `public/overlays/poi-prototype.geojson` and rendered in-app with category-colored icons/labels (bridges, dams, power plants, military bases, airports) behind a dedicated `POI (Prototype)` layer toggle for review.

87. [done] Replaced POI prototype marker styling with a custom icon set and category mapping, switched icon loading to PNG-first with SVG fallback, and validated readability/overlap behavior at operational zooms.

83. [done] Created a layer-by-layer technical documentation set under `docs/layers/` with one concise spec per major layer (boundary stack, settlements/urban, hydrology layers, forests, roads, railways, and POI prototype): each sheet now records source(s), cache behavior, processing steps, transformation rules, known failure modes, and solved issues. Added index links from `docs/INDEX.md` to keep navigation centralized and avoid duplicating long narrative text in `README.md`.

89. [done] Improve visual separation between wetlands and forests in map styling: shifted wetlands towards a browner tone and forests slightly greener in map rendering and layer-panel legend colors; user validated the result.

88. [done] Replaced the manual POI prototype dataset with a full theater-wide processed POI pipeline from cached OSM data in `data:layers:public`, including first-attempt scoped inclusion rules (military/major airfields, nuclear plants, strategic bridges, civilian ports near 100k+ settlements, major industrial excluding sugar, missile/ballistic strategic facilities, and Azovstal override), deterministic deduplication, retained source tag metadata (including `aerodrome:type`), and rapid iteration support via `--poi-only`. Follow-up refinements applied after review: one civilian port indicator per qualifying city and stricter anti-noise filtering for Azovstal-name and rocket-site overtrigger cases.

## Pending Tasks

82. [pending] Rework elevation hillshade visual balance: current terrain appears too shadowed while mountain forms remain insufficiently legible. Increase relief contrast while making low-elevation areas near-transparent. Run controlled experiments on small map sections first (style/raster parameter sweeps and side-by-side comparisons), then apply the best-performing configuration theater-wide.

90. [pending] Research whether dams should be represented as a dedicated map layer instead of POI markers: compare map readability, operational usefulness, and overlap with hydro/power semantics; propose source mapping, style behavior, and toggle strategy if split into a separate layer.

## Refinements

84. [pending] Investigate targeted river-reconstruction scope inflation after broad river-gap checklist runs (`--include-all-hexes`): prevent `buildTargetedHexRiverSystemReconstructionLayer` from ingesting very large `flaggedHexes` sets unintentionally, and implement deterministic scope control (for example theater-only default, curated include list, and/or max-target guard with explicit override logging).

85. [pending] Investigate and fix zoom-dependent polygon shape shifts where water/body geometries appear to drop vertices when zooming out (visible geometry changes between zoom levels in some hexes). Scope should include geometry hygiene, simplification/tolerance behavior, and renderer/source settings so polygon silhouettes remain stable across operational zoom transitions. Include current clipping examples `HX-E58-N8`, `HX-E51-N13` and `HX-E68-N10` in the investigation set.

## Possible Future Tasks

75. [future] Prototype and evaluate an OSM-derived high-detail coastal water mask as the long-term coastal source upgrade: design a replacement-quality mask pipeline (coastline/water polygons), compare against the current Natural Earth coastal behavior in problematic strips, and define integration criteria so Task `74` can swap to this source without architectural changes. When finalized, re-check AGENTS.md and remove no-longer-needed temporary coastal rules.

86. [future] Once we have fixed the water bodies, at zoomlevel 7.5 and lower the rivers look better than the water bodies. You can keep the water bodies but the rivers should be enabled at that point when water bodies are on. But we should only do this when all water issues are fixed.
