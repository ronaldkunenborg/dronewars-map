# ADR-0001: Ukraine Boundary Stack from ADM2 Topology

- Status: Accepted
- Date: 2026-03-18

## Context

Cross-source boundary mixing produced visible mismatch and instability between ADM0/ADM1/ADM2 rendering levels.

## Decision

Render Ukraine boundary hierarchy from one coherent topology derived from cached GADM ADM2 polygons:

- ADM0: outer ADM2 edges
- ADM1: shared cross-oblast ADM2 edges
- ADM2: shared same-oblast internal edges

Natural Earth fallback rendering for UKR was removed, and Natural Earth country boundary rendering excludes UKR edges.

## Consequences

- Improved cross-level coherence
- Reduced zoom-threshold instability
- Single-source topology for Ukraine boundary hierarchy
