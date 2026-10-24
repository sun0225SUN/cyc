# Commit workflow

- Stage only the intended changes and review them with `git diff --cached` before committing.
- Agents must create commits non-interactively; do not start the Commitizen/cz-git prompt.
- Follow the cz-git configuration when composing the message: use `:emoji: type(scope): subject`, with an optional scope and optional `!` before the colon for breaking changes.
- Keep the emoji at the left of the header. Use cz-git's default mapping: `feat` → `:sparkles:`, `fix` → `:bug:`, `docs` → `:memo:`, `style` → `:lipstick:`, `refactor` → `:recycle:`, `perf` → `:zap:`, `test` → `:white_check_mark:`, `build` → `:package:`, `ci` → `:ferris_wheel:`, `chore` → `:hammer:`, and `revert` → `:rewind:`.
- Write a short, imperative, lower-case subject without a trailing period. Example: `:sparkles: feat(map): add activity heatmap`.
- Let Lefthook run normally: `pre-commit` formats supported staged frontend files with Biome and re-stages the fixes, and runs Ruff and Black on staged Python files. `commit-msg` uses Commitlint and `@commitlint/config-conventional` to validate the final message. `pre-push` runs `bun run test`, and runs `pytest` in `backend/` when the push includes files there.
- Never bypass hooks with `--no-verify`. Run the checks relevant to the changed files before committing.
