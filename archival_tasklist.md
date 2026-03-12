# Archival Task List

This archive contains completed tasks from `TASKS.md` that are directly understandable from `README.md`.

Archive date: 2026-03-13

## README-Evidenced Completed Tasks

| Task(s) | Completed outcome | Where this is evidenced in `README.md` |
|---|---|---|
| 1, 12 | App scaffold and MapLibre shell are in place | `Current Status` (`Vite + React + TypeScript + MapLibre application shell`) |
| 2, 7, 8, 42 | Configurable and generated operational hex grid, with tunable hex radius | `Current Status`, `What You Should See`, `Hex Grid Notes` (`hexRadiusKm`) |
| 4, 47, 47.1, 47.2 | Reproducible raw intake/bootstrap workflow | `Data Workflow` (`npm run data:intake:bootstrap`, listed raw inputs and controls) |
| 5, 6, 15 | Preprocess + processed layers pipeline and app-facing layer outputs | `Data Workflow` and `What You Should See` (thematic layers listed) |
| 9, 10, 11 | Hex analytics and scoring outputs are produced and exported | `Capacity and Analytics` and `Generated Files` |
| 13, 14, 16, 17 | Map sources/layers, operational hex display, controls, and cell inspector interaction | `Current Status`, `What You Should See`, `Current UI` |
| 18 | Overlay architecture exists for future operational overlays | `Current Status`, `Current UI` (`overlay slots`) |
| 19 | Project README covers install/run, workflows, generated files, tuning, and analytics context | README structure itself (`Install and Run`, `Data Workflow`, `Generated Files`, `Hex Grid Notes`, `Capacity and Analytics`) |
| 23, 24 | Settlements and landcover terrain layers are present and rendered | `What You Should See`, processed layer list |
| 25 | Terrain-driven analytics replaced placeholders | `Capacity and Analytics` (terrain/infrastructure summary outputs) |
| 26 | Repository strategy updated for large generated data handling | `Generated Files` (`Repository strategy for generated geodata`) |
| 27, 30 | Public-source caching behavior and refresh model documented | `Data Workflow` (`Public-source cache behavior`, `Refresh expectations`) |
| 28, 29 | Sea-layer integration and sea terrain classification | `What You Should See` (`seas`), `Capacity and Analytics` (`Sea terrain handling`) |
| 40, 50 | Settlement Voronoi layer and generation workflow | `Current Status`, `What You Should See`, `Current UI`, `data:layers:voronoi` command |
| 41 | Settlement display-level selector available | `Current Status`, `Current UI` |
| 44 | Major-city urban areas visibly rendered beneath city labels | `What You Should See`, `Current UI` (`major-city urban extent fills`) |
| 45, 46 | Hillshade generation and terrain elevation workflow wired with GDAL tooling | `OSGeo4W (Windows GDAL/PROJ)`, `Data Workflow` (`--elevation-only`) |
| 48, 49 | Layer controls and preset behavior are implemented and documented | `Current UI` (`layer toggles`, `preset modes`) |
| 52, 52.results | Elevation-threshold investigation completed with report command | `Report Commands` (`npm run data:analytics:elevation-thresholds`) |
| 53, 53.results, 53.1 | DEM resolution/runtime benchmark completed with report command and recommendation | `Report Commands` (`npm run data:analytics:dem-resolutions`) and benchmark summary |

## Notes

- This file is for archival/readability so active planning in `TASKS.md` can stay shorter.
- If `README.md` changes substantially, this archive should be refreshed to keep evidence mapping accurate.
