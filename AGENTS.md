## Project rules
- All explicit project rules from the user must be added to AGENTS.md by Codex.
- Before starting work, review `TASKS.md`, pick the first unfinished task in order, and attempt to complete that task before starting any later task.
- If GeoNames is used for settlement population fallbacks, use it only to populate or refresh a local fallback table on demand; normal layer builds must read the checked-in fallback values and must not repopulate them on every run.

## Git commit message format
- Always use real newlines in commit bodies.
- Never include literal `\n` in commit messages.
- Use multiple `-m` flags for multiline commits.
