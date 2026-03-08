Build an offline, terrain-first operational map application for Ukraine.

Core objective
- Create a geographic map that can later support war-game or operational overlays.
- The map must NOT use provinces as the lowest-level unit.
- Provinces/oblasts should be shown only as reference and aggregation boundaries.
- The true lowest-level simulation unit must be a custom operational cell system sized for brigade-scale aggregation.

Scale requirement
- Lowest-level areas should be designed to hold approximately 5,000–10,000 soldiers in one area.
- Treat this as an operational planning scale, not a literal population-density model.
- Capacity must be adjustable by terrain and infrastructure.
- Do not assume equal capacity for equal land area.

Recommended spatial model
- Use a hex grid as the default lowest-level geometry.
- Clip the hex grid to the Ukraine theater extent.
- Keep the architecture flexible so hexes can later be replaced or supplemented by terrain-informed sectors.
- Provinces/oblasts remain a separate overlay and parent grouping layer.

Why hexes
- Better adjacency logic than square grids
- Better for movement, control, support, and influence modeling
- Cleaner future use for force allocation, frontage, supply, and combat resolution

Functional requirements
1. Build a terrain-first basemap
- Terrain and geography come first.
- No frontline overlay yet.
- The map should emphasize:
  - rivers
  - lakes/reservoirs
  - wetlands/swamps
  - forests
  - hillshade / relief
  - contour lines
  - roads
  - railways
  - settlements

2. Add operational cell layer
- Overlay a hex grid across the theater.
- Each hex is the lowest-level simulation unit.
- Hexes must be styled subtly by default so the terrain remains readable.
- Hex borders should become more visible as the user zooms in.

3. Add hierarchical aggregation
- Support multiple levels:
  - theater
  - oblast/reference region
  - operational sector
  - local operational cell (hex)
- Hexes should belong to a parent aggregation unit.
- Parent units should be computable rather than purely decorative.

4. Add per-cell analytics
Each hex should have at least:
- id
- centroid
- parent oblast/reference region
- area_km2
- terrain summary
- forest coverage
- wetland coverage
- water barrier presence
- road density
- rail presence
- settlement score
- elevation variability / roughness
- estimated base capacity
- estimated effective capacity
- current assigned force count (default 0)
- mobility score
- defensibility score

Capacity logic
- Each hex should have a configurable base capacity and effective capacity.
- Effective capacity must be derived from terrain and infrastructure.
- Capacity should be reduced by:
  - major rivers
  - wetlands/swamps
  - dense forests
  - steep or broken terrain
  - weak road access
- Capacity can be increased by:
  - road density
  - rail access
  - nearby settlements
  - open terrain
- The 5,000–10,000 soldiers target is for a reasonably usable operational cell under average conditions, not a strict hard-coded number.

Design rule for cell sizing
- Choose a hex size that makes sense for brigade-scale representation.
- Do not use province-sized cells.
- Do not make cells so small that the map becomes cluttered or battalion-scale by default.
- Use a configurable hex radius so the scale can be tuned after testing.
- Include a short explanation in the README for how to increase or decrease hex size.

Suggested implementation approach
- Start with one default hex size appropriate for operational planning.
- Add a config constant for hex radius in kilometers.
- Generate the hex grid programmatically and clip it to the theater boundary.
- Compute per-hex terrain/infrastructure summaries from the imported geographic layers.

Rendering and stack
- Use MapLibre GL JS as the main renderer.
- Build the app to work offline after one-time data import.
- Use OpenStreetMap-derived geographic data.
- Use local or packaged terrain sources where possible.
- Use vector data and local processed files instead of live online APIs.
- The app should run locally with:
  - npm install
  - npm run dev

Data pipeline
- Import geographic data once.
- Preprocess it locally.
- Keep the data workflow explicit and reproducible.

Recommended pipeline:
- source geographic data from OpenStreetMap extract(s)
- preprocess geometry into app-usable layers
- build operational hex cells
- intersect hex cells with terrain/infrastructure layers
- compute per-cell attributes
- store processed outputs locally

Expected geographic layers
- theater boundary
- oblast/province boundaries for reference
- rivers
- lakes/water bodies
- wetlands
- forests
- roads
- railways
- settlements
- terrain/hillshade
- optional contours

UI requirements
- Smooth pan and zoom
- Layer toggles for:
  - rivers/water
  - wetlands
  - forests
  - roads
  - railways
  - contours
  - hillshade
  - oblast boundaries
  - operational hexes
- Preset view modes:
  - Terrain
  - Hydrology
  - Mobility
  - Operational Cells
- Reset-to-Ukraine button
- Legend
- Scale bar
- Optional coordinate readout

Operational cell interactions
On hover or click, show a panel/popup with:
- hex id
- parent region
- area
- terrain summary
- mobility score
- defensibility score
- base capacity
- effective capacity
- assigned force count

Visual design
- Low-saturation terrain-cartography look
- More like an operational planning map than a consumer road map
- Terrain must remain readable under the hex overlay
- Hexes should not dominate the visual hierarchy
- Province/oblast borders should be visible but clearly secondary to hexes as simulation units

Code structure
Organize code cleanly:
- src/
- components/
- map/
- data/
- config/
- scripts/

Suggested separation:
- map setup
- style/layer definitions
- hex generation
- terrain analysis
- scoring/capacity logic
- UI controls
- data import/preprocessing scripts

Important architecture requirement
- The application must be prepared for future overlays, including:
  - frontlines
  - zones of control
  - artillery ranges
  - logistics routes
  - force placement
- Structure the map so these overlays can be added later without rewriting the basemap or cell system.
- If custom military graphics are needed later, leave room for an optional Canvas overlay on top of MapLibre, but do not build the basemap as raw Canvas.

README requirements
Include:
- how to install and run
- how data is imported and processed
- what files are generated
- how hex size is configured
- how capacity is computed
- how to add future overlays
- how to swap map/data sources later if needed

Implementation notes
- Do not over-engineer live data or streaming updates.
- This is a static/offline-first map after initial import.
- Focus on correctness of geography, clarity of terrain, and a usable operational cell model.
- Favor simple, maintainable code over fancy effects.

Acceptance criteria
- I can open the app locally and see a terrain-first map of Ukraine.
- I can toggle rivers, wetlands, forests, roads, railways, settlements, hillshade, and hexes.
- Provinces/oblasts are visible only as reference boundaries.
- The true lowest-level unit is a custom hex cell layer.
- Each hex has derived attributes suitable for brigade-scale aggregation.
- The map structure is ready for future DeepState-style overlays, but none are required yet.