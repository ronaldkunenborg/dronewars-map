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

54. [pending] Prototype an OSM water-polygon based `water-bodies` layer (for example `natural=water`, `water=*`, `waterway=riverbank`, `landuse=reservoir`) and compare map accuracy against the current Natural Earth lake-based layer; also compare against hillshade/elevation-derived near-sea-level corridors for sea-connected inland water plausibility.

54.1 [pending] Evaluate OpenStreetMap API as an additional source path for water features (coverage, query practicality, rate limits, and cacheability) and compare feasibility versus current Overpass-based sourcing.

54.2 [pending] Prototype broader OSM feature ingestion for operational overlays/reference layers (starting with airfields and selected special features) using cache-first sourcing.

54.3 [pending] Prototype OSM-informed terrain/landuse styling inputs to improve hex-cell shading quality, and compare visual/readability impact against the current terrain-driven hex styling.

55. [pending] Add one dominant country-name label per country (not multiple repeated labels), rendered much larger and spanning most of the country with arc-like placement similar to stylized fantasy-map labels; for Cyrillic country names, show the English name directly below in a smaller secondary line.