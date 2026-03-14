# WBOB Boundary Prototype Comparison

Generated: 2026-03-14T11:18:46.098Z

## Scope

Small-scope prototype of World Bank Official Boundaries (WBOB) for Ukraine ADM0/ADM1/ADM2, compared against the current map stack for:

- cross-level coherence (ADM2 inside ADM1)
- detail parity (ADM2 granularity and vertex density)

## WBOB Intake

- Item id: `c030a96882e84205897973ed44b12cf2`
- Service: `https://services.arcgis.com/iQ1dY19aHwbSDYIF/arcgis/rest/services/WB_GAD_Medium_Resolution/FeatureServer`
- Query filter: `ISO_A3 = 'UKR'`

## Feature Counts

| Stack | ADM0 | ADM1 | ADM2 |
|---|---:|---:|---:|
| WBOB (medium) | 1 | 24 | 24 |
| Current (GeoBoundaries+GADM) | 1 | 27 | 629 |

## Coherence (ADM2 inside ADM1)

| Stack | Min overlap ratio | P50 | P90 | Perfect containment share |
|---|---:|---:|---:|---:|
| WBOB (medium) | 1 | 1 | 1 | 100.00% |
| Current | 1 | 1 | 1 | 100.00% |

## Detail Parity

| Metric | WBOB | Current | Ratio (WBOB / Current) |
|---|---:|---:|---:|
| ADM2 feature count | 24 | 629 | 0.038 |
| ADM2 median vertices | 315 | 276 | 1.141 |
| ADM2 p90 vertices | 370 | 803 | 0.461 |

## Key Finding

- WBOB ADM2 in this medium-resolution service returned only 24 features for Ukraine, and 100.00% had `NAM_2 = "Administrative unit not available"`.
- Cross-level containment is coherent, but ADM2 granularity is far below current map detail.

## Verdict

- Coherence check: **pass**
- Detail parity check: **fail**
- Recommendation: Do not switch to WBOB medium-resolution ADM0/ADM1/ADM2 for production in current form; ADM2 granularity for Ukraine is too coarse versus current stack.
