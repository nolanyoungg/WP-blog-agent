# Changelog

## Unreleased

### Added

- Extensible blog formats under `config/blog-formats/`. Each format owns an approximate `target_words` value and an `example.md` structural template.
- Tracker-scoped, atomic generation checkpoints that resume a plan and completed sections only when the tracker row and template contents still match.
- Formatted PDF review artifacts alongside the authoritative Markdown drafts.
- An optional authenticated iMessage relay for a Windows workflow and a separate Mac signed into Messages.
- A populated, single-sheet editorial tracker and a three-machine operating runbook.

### Changed

- `blog_type` is now the only article-size choice. `short`, `medium`, and `long` get their approximate targets and section structures from their format folders.
- Generation follows the H1 sections and instructions in each format's `example.md`. The model returns ordinary Markdown for each section, so natural paragraphs, lists, quotes, tables, and code are allowed.
- Article length is prompt guidance rather than a deterministic acceptance range. Each section receives a rough share to establish scale, but sections are no longer rejected for missing that share or forced into exact paragraph shapes.
- Structured retries now repair only missing or malformed JSON fields. Error messages no longer report a misleading “best” word-count attempt.
- The configured primary LM Studio model is the only default candidate. Other installed models are neither selected nor loaded unless `LMSTUDIO_ALLOW_FALLBACK_MODELS=true` is explicitly enabled.
- The tracker now contains 12 columns, with `blog_type` directly after `blog_topic`.

### Fixed

- Successful iMessage posting confirmations now identify the posted blog by ID and title.
- Removed the conflicting combination of an independent tracker word count and a `short`/`medium`/`long` format choice.
- Prevented acceptable articles from failing because a section or paragraph was a few words outside a calculated range.
- Bound checkpoints to the selected template contents so format changes cannot resume stale generated sections.
- Removed a duplicated plain-text section heading when a model repeats the rendered heading at the start of its body.
- Preserved the inline `blog_type` dropdown after tracker updates.
- Kept posting errors with saved drafts out of generation retries.
- Preserved completed generation work across process exits.

### Removed

- The tracker `blog_length` column.
- Section word-count tolerances, overall word-count rejection, exact paragraph-count rules, paragraph-size rules, required content-block rules, and word-allocation calculations.
- The repository's topic-specific factual-review rules, deterministic claim checks, additional LM Studio quality-review pass, and automated repair rounds.
- Closest-candidate word scoring and per-attempt word-count diagnostics.
- The hard-coded TypeScript format union and fixed heading-count map.

### Tested

- `npm run build`, all 24 deterministic plumbing tests, `npm run formats:validate`, and `git diff --check`.
- The migrated workbook was re-imported and visually rendered with all existing rows preserved, 12 columns, the `blog_type` dropdown in column C, and no formulas.
- A real isolated Blog #18 dry-run used only the already-loaded `openai/gpt-oss-20b`, completed the plan and all 10 sections on their first attempts, produced 1,832 content words from the format's approximate 1,500-word target, removed its checkpoint, created Markdown and a six-page PDF, and moved only the copied tracker to `awaiting_review`.
