# ADR-0004: Parallel Coastal Water Subtraction

- Status: Accepted
- Date: 2026-03-21

## Context

During `data:layers:public`, the coastal correction stage subtracts corrected sea polygons from `water-bodies` and `country-boundaries`.

In practice, the slowest step was:

- `Coastal-only stage: corrected water-bodies`

This step runs polygon difference against a large feature set (often tens of thousands of water polygons). The previous implementation processed features in a single-threaded loop.

## Decision

For coastal subtraction, run feature-level polygon differences in parallel worker threads, bounded by `--compute-workers`.

Where this applies:

- `data:layers:public --coastal-only`
- normal `data:layers:public` coastal correction stage

How it works:

1. Build one shared sea-subtraction mask geometry (serial).
2. Split input polygon features into deterministic chunks.
3. Run per-feature `difference(feature, mask)` in worker threads.
4. Merge worker results in deterministic order and reassign sequential IDs.
5. If worker execution fails, fall back to serial subtraction automatically.

## Consequences

Positive:

- Reduces wall-clock time for the heavy coastal water subtraction stage on multi-core CPUs.
- Keeps output stable across runs due to deterministic merge order.
- Preserves robustness through serial fallback.

Tradeoffs:

- Higher peak memory from worker payload transfer.
- Worker startup/IPC overhead can outweigh gains for small feature sets.

Mitigations:

- Use a minimum feature threshold before parallel mode is used.
- Keep worker count bounded by available CPU (`--compute-workers`).

## Implementation Notes

- The worker model follows the existing hydrology compute-worker pattern.
- Core implementation is in:
  - `scripts/layers/fetch-public-layers.mjs`
- Parallel helper:
  - `subtractPolygonMaskFromPolygonLayerWithWorkers(...)`
- Worker task:
  - `polygon-mask-subtract-chunk`

## Scope Boundaries

This ADR parallelizes coastal subtraction only. It does not change geometry rules for:

- which hexes are selected for lockstep/coastal completion,
- how sea/land masks are computed,
- targeted hydrology reconstruction logic.
