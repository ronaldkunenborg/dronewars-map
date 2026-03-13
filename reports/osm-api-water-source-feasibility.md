# OSM API Water-Source Feasibility (Task 54.1)

Generated: 2026-03-13

## Scope

Evaluate OpenStreetMap Editing API (`api.openstreetmap.org`) as an additional source path for water features, compared against the current Overpass-based approach used by this project.

## Inputs Observed

- Current theater bbox: `22.0,44.0` to `40.5,52.5` (area `157.25 deg²`).
- OSM API capabilities (live): `https://api.openstreetmap.org/api/0.6/capabilities`
  - `area maximum="0.25"`
  - `timeout seconds="300"`
- OSM API usage policy: `https://operations.osmfoundation.org/policies/api/`
  - Editing API is not intended for read-only projects.
  - Large/frequent users should use `planet.osm` / extracts or another provider.
  - Technical requirement includes max `2` download threads.
- OSM API v0.6 docs: `https://wiki.openstreetmap.org/wiki/API_v0.6`
  - API is primarily intended for editing; read-only projects should follow API usage policy.
- Overpass status sample (live at evaluation time): `https://overpass-api.de/api/status`
  - Reported `Rate limit: 2` slots for this endpoint instance.

## Practicality Comparison

### Coverage

- OSM Editing API can return map primitives and therefore has raw coverage potential.
- However, `/api/0.6/map` is bounded by `0.25 deg²` max request area.
- For this theater (`157.25 deg²`), minimum tiling is:
  - `ceil(157.25 / 0.25) = 629` bbox requests (best-case lower bound).

### Query Model

- OSM Editing API does not provide Overpass-style thematic filtering (`natural=water`, `water=*`, etc.) at query time.
- Result: client must fetch broad primitive data and filter locally, which is substantially heavier for water-layer extraction.
- Overpass supports server-side thematic filters directly in query language, which matches this pipeline design.

### Rate Limits / Operational Risk

- OSM policy explicitly discourages heavy read-only extraction from the Editing API.
- 629+ requests per theater refresh is high-risk for throttling/blocking and conflicts with policy intent.
- Overpass is explicitly a read-only extraction API designed for this type of thematic pull (with its own limits).

### Cacheability

- Both sources can be cache-first in our pipeline.
- But with OSM Editing API, cache misses are expensive due to very high request fan-out and large unfiltered payloads.
- Overpass yields smaller, theme-focused payloads per request and is therefore more practical for cache refresh cycles.

## Feasibility Verdict

- **Direct OSM Editing API source path for water features is low-feasibility for this project’s theater-scale refreshes.**
- **Overpass remains the preferred source path** for water polygons in this pipeline.
- OSM Editing API is only reasonable as a narrow fallback for very small, targeted bbox reads or diagnostics.

## Recommendation

1. Keep Overpass as the primary water-feature acquisition path.
2. Do not add OSM Editing API as a normal refresh source for theater-wide water layers.
3. If needed, add an explicitly scoped emergency/debug mode using OSM API for small bbox windows only, still cache-first and low-frequency.
