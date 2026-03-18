# External Sources Policy

Canonical source register:

- [`EXTERNAL_SOURCES.md`](../../EXTERNAL_SOURCES.md)

## Policy Summary

- Use external sources primarily to populate/refresh local cache.
- Normal builds should read cached local artifacts rather than refetching on every run.
- Keep source usage, fit-for-purpose notes, and license/fair-use considerations documented.
- Prefer OSM-derived thematic overlays where useful, unless a task explicitly requires a different boundary source strategy.

See also [Public Layer Builder](../pipeline/public-layer-builder.md) for cache/refresh behavior.
