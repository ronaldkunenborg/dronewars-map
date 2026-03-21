## Project rules
- You work on Windows 11, from the Visual Studio Code extension for Codex.
- All explicit project rules from the user must be added to AGENTS.md by Codex, unless they can be trivially deduced from the code, documentation or tasks.md.
- Before starting work, review `TASKS.md`, pick the first unfinished task in order, and attempt to complete that task before starting any later task.
- If an external source is used to provide us with raw data, use it only to populate or refresh a local cache; normal layer builds must read the cache and must not reload them from an external source on every run.
- When invoking GDAL/OSGeo tools on this machine, use explicit binaries from `C:\OSGeo4W\bin` (or from `OSGEO4W_BIN` when set).
- Prefer OpenStreetMap-derived data for thematic overlays where useful (including airfields and other special features), and prioritize OSM-informed terrain/landuse inputs when improving hex-cell shading quality; do not treat this as overriding the current administrative boundary stack unless a task explicitly requests boundary-source changes.
- Model airports/airfields as points of interest (POI) rather than logistics-network links; keep logistics layers focused on ground-interdictable networks.
- For targeted river reconstruction during processing, prefer elevation-guided path selection; if elevation data is unavailable, use river-line shape and dominant direction as the fallback guide (not exact centerline placement).
- For river-gap remediation, use high-detail river detail as reconstruction input for the regular hydrology output (`water-bodies`) so fixes are visible at normal map zoom levels; do not introduce z12-only river-fix visibility unless explicitly requested.
- Defer long-term sea-border reconciliation work (including non-Ukraine areas where rough ADM0 terrain borders conflict with improved waterbody geometry) to Task `62.4`; avoid ad-hoc interim fixes unless explicitly requested.
- Apply a hex-specific country-fill exception for the Kerch coastal dispute case: in `HX-E72-N11`, suppress non-Ukraine `country-boundaries` fill (keep `UKR` if present) so coarse country-fill polygons do not override the theater boundary interpretation in that hex.
- Documentation wording rule: for decisions and fix descriptions, use operational plain language that states (1) where the rule applies, (2) which boundary/source determines the decision, and (3) what map result is produced (for example: “inside hex X, areas outside the ADM2-derived border are rendered as sea”). Avoid abstract phrasing when a direct map-behavior sentence is possible.
- Coastal visual consistency rule: for any reviewed hex where land appears outside the ADM2-derived Ukraine border, enforce lockstep rendering in that hex by clipping land to the ADM2-derived border and treating all remaining hex area as sea; target this first via curated hex lists and expand by analysis/manual review.
- Keep the river-gap checklist report exclusions aligned with user review decisions: currently exclude `HX-E54-N31`, `HX-E55-N31`, `HX-E55-N32`, `HX-E46-N42`, `HX-E64-N44`, `HX-E65-N45`, `HX-E69-N42`, `HX-E71-N41`, `HX-E71-N43`, `HX-W17-N58`, `HX-W16-N50`, `HX-W10-N47`, `HX-W6-N45`, `HX-W4-N44`, `HX-W4-N40`, `HX-E7-N42`, `HX-E13-N39`, `HX-E16-N37`, `HX-E53-N31`, `HX-E51-N52`, `HX-E52-N53`, `HX-E53-N54`, `HX-E54-N53`, `HX-E11-N46`, `HX-E16-N63`, `HX-E16-N64`, `HX-E20-N68`, `HX-E20-N69`, `HX-E22-N69`, `HX-E22-N70`, `HX-E24-N74`, `HX-E51-N51`, `HX-E51-N57`, and `HX-E55-N49` from `reports/river-water-gap-checklist.*` outputs unless explicitly requested otherwise.
- When moving tasks to `archival_tasklist.md`, preserve enough structured detail (using the existing archive format) so each archived task can be recreated from `README.md` and/or the codebase evidence.
- When moving tasks to `archival_tasklist.md`, omit tasks that are trivially verifiable by running the app/build/tests or by inspecting currently running code paths (for example environment-verification/bootstrap checks), unless the user explicitly asks to archive them.

## Git commit message format
- Always use real newlines in commit bodies.
- Never include literal `\n` in commit messages.
- Use multiple `-m` flags for multiline commits.
