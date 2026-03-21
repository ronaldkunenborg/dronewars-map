# POI Source Selection (Task 81)

## Scope

Prototype points of interest for:

- bridges
- dams
- power plants
- military bases
- airports

## Source options considered

1. OpenStreetMap (Overpass / local OSM PBF)
   - Pros: best thematic coverage for all required categories, high detail, updatable, category tags map directly to needed POI classes.
   - Cons: larger extracts than Natural Earth, tag consistency varies and needs normalization.
2. Natural Earth
   - Pros: lightweight and stable.
   - Cons: does not provide full coverage for military bases, dams, and operational bridge POIs at needed detail.
3. Mixed category-specific datasets
   - Pros: can improve one category at a time.
   - Cons: inconsistent schema/provenance, higher maintenance, harder attribution and refresh workflows.

## Decision

Use OSM as primary POI source.

- Prototype stage: static review file (`public/overlays/poi-prototype.geojson`) rendered directly in the app.
- Production stage (later): derive POIs from cached OSM sources in the builder with normalization and category rules.

This gives the best accuracy/coverage tradeoff while keeping the first review loop fast.
