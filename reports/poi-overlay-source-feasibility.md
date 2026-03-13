# POI Overlay Source Feasibility (Task 54.2)

Generated: 2026-03-13

## Scope

Evaluate whether OpenStreetMap is suitable as the primary source for a special-POI overlay containing:

- airfields
- mines
- large factories
- harbours
- powerplants (nuclear or conventional)

If OSM is not sufficiently suitable for a category, identify the most suitable alternative provider(s).

## Theater Coverage Signal (Ukraine theater bbox used by project)

BBox: `22.0,44.0` to `40.5,52.5`  
Method: live Overpass `out count` queries across the same theater envelope used in this repo.

- airfields: total `1030`, named `949` (`~92.14%` named)
- mines (quarry/mine/resource tags): total `5825`, named `1470` (`~25.24%` named)
- factories (`industrial` / `man_made=works`): total `8793`, named `5241` (`~59.6%` named)
- harbours: total `79`, named `62` (`~78.48%` named)
- powerplants: total `2586`, named `1058` (`~40.91%` named)

Interpretation:

- OSM has strong quantity and naming for airfields and harbours.
- Mines and powerplants have substantial coverage but weaker naming/completeness.
- “Factories” in OSM are broad and noisy; large-factory precision requires stronger filtering/ranking.

## OSM Suitability by Category

### Airfields

- **OSM suitability: High**
- Why: strong tag ecosystem (`aeroway=*`, `military=airfield`) and high named ratio in theater.
- Best use: OSM as primary source.

Potential complement:

- OurAirports open dataset (public domain) for reconciliation/backfill.

### Mines

- **OSM suitability: Medium**
- Why: many candidates but weak naming/completeness consistency; tag semantics vary (`quarry`, `mine`, `resource=*`).
- Best use: OSM primary + confidence scoring.

Potential complement:

- USGS MRDS for known mines/prospects (global coverage focus but variable record quality/age by region).

### Large Factories

- **OSM suitability: Medium-Low (for “large” precision)**
- Why: high object count but “industrial” tags are heterogeneous and often not size-ranked.
- Best use: OSM only if you apply strict filters (named, area thresholds, selected `industrial=*` classes).

Potential complement:

- Open Supply Hub for factory-location enrichment where sector coverage applies.

### Harbours

- **OSM suitability: High for local-detail mapping**
- Why: good tags and high named ratio in theater.
- Best use: OSM as primary.

Potential complement:

- Natural Earth `ne_10m_ports` for major-port fallback/global baseline.

### Powerplants (nuclear + conventional)

- **OSM suitability: Medium**
- Why: useful coverage but naming completeness is moderate; fuel/technology tagging is not fully consistent.
- Best use: OSM for map-native geometry + external catalog for authoritative plant metadata.

Potential complement:

- WRI Global Power Plant Database (open CC BY 4.0), noting repo states no planned updates since early 2022.

## Recommended Provider Strategy

No single alternative provider beats OSM across all five categories.

Recommended architecture:

1. Keep **OSM (Overpass, cache-first)** as primary geometry source for all categories.
2. Add category-specific secondary sources only where OSM quality is weaker:
   - airfields: OurAirports (backfill/verification)
   - powerplants: WRI GPPD (attribute enrichment and QA), optionally newer GEM trackers if licensing/access constraints are acceptable
   - harbours: Natural Earth ports as major-port fallback
   - mines/factories: treat alternates as supplemental only; retain OSM primary
3. Persist all secondary-source pulls into local cache and reconcile into one normalized POI layer build.

## Feasibility Verdict

- OSM is suitable as the **primary** source for this POI overlay, with category-dependent confidence.
- OSM is weakest for “large factory” precision and mine/powerplant metadata consistency.
- Best result is a **hybrid cache-first pipeline**: OSM-first geometry + targeted secondary-source enrichment.

## Sources

- OSM API usage policy: https://operations.osmfoundation.org/policies/api/
- OSM API v0.6 docs: https://wiki.openstreetmap.org/wiki/API_v0.6
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- Overpass status endpoint: https://overpass-api.de/api/status
- OurAirports data (public domain): https://ourairports.com/data/
- WRI Global Power Plant Database repo: https://github.com/wri/global-power-plant-database
- Natural Earth 10m cultural vectors (ports): https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
- Open Supply Hub: https://info.opensupplyhub.org/
