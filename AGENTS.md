## Project rules
- You work on Windows 11, from the Visual Studio Code extension for Codex.
- All explicit project rules from the user must be added to AGENTS.md by Codex, unless they can be trivially deduced from the code, documentation or tasks.md.
- Before starting work, review `TASKS.md`, pick the first unfinished task in order, and attempt to complete that task before starting any later task.
- If an external source is used to provide us with raw data, use it only to populate or refresh a local cache; normal layer builds must read the cache and must not reload them from an external source on every run.

## Git commit message format
- Always use real newlines in commit bodies.
- Never include literal `\n` in commit messages.
- Use multiple `-m` flags for multiline commits.
