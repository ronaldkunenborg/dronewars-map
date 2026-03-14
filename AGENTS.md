## Project rules
- You work on Windows 11, from the Visual Studio Code extension for Codex.
- All explicit project rules from the user must be added to AGENTS.md by Codex, unless they can be trivially deduced from the code, documentation or tasks.md.
- Before starting work, review `TASKS.md`, pick the first unfinished task in order, and attempt to complete that task before starting any later task.
- If an external source is used to provide us with raw data, use it only to populate or refresh a local cache; normal layer builds must read the cache and must not reload them from an external source on every run.
- When invoking GDAL/OSGeo tools on this machine, use explicit binaries from `C:\OSGeo4W\bin` (or from `OSGEO4W_BIN` when set).
- Prefer OpenStreetMap-derived data for thematic overlays where useful (including airfields and other special features), and prioritize OSM-informed terrain/landuse inputs when improving hex-cell shading quality; do not treat this as overriding the current administrative boundary stack unless a task explicitly requests boundary-source changes.
- When moving tasks to `archival_tasklist.md`, preserve enough structured detail (using the existing archive format) so each archived task can be recreated from `README.md` and/or the codebase evidence.
- When moving tasks to `archival_tasklist.md`, omit tasks that are trivially verifiable by running the app/build/tests or by inspecting currently running code paths (for example environment-verification/bootstrap checks), unless the user explicitly asks to archive them.

## Git commit message format
- Always use real newlines in commit bodies.
- Never include literal `\n` in commit messages.
- Use multiple `-m` flags for multiline commits.
