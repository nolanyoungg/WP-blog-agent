# Changelog

## Unreleased

### Added

- JSON-only `how-to` and `practical-guidance` formats alongside `short`, `medium`, and `long`.
- `tone`, `expertise_level`, `conclusion_guidance`, `avoid`, and ordered section definitions inside every `format.json`.
- 125 SEO-focused Shibey content topics across website development, app development, custom software, technical SEO, and analytics, extending the tracker through Blog #176.
- Extensible blog formats under `config/blog-formats/`. Each format owns its approximate target, editorial guidance, and structure in one JSON definition.
- Tracker-scoped, atomic generation checkpoints that resume a plan and completed sections only when the tracker row and complete format definition still match.
- Formatted PDF review artifacts alongside the authoritative Markdown drafts.
- An optional authenticated iMessage relay for a Windows workflow and a separate Mac signed into Messages.
- A populated, single-sheet editorial tracker and a three-machine operating runbook.

### Changed

- `blog_type` is now the only article-size and structure choice. All five bundled formats get their approximate targets, editorial context, and section structures from `format.json`.
- Generation follows the ordered JSON sections and passes the editorial fields to LM Studio as prompt guidance. The model returns ordinary Markdown for each section, so natural paragraphs, lists, quotes, tables, and code are allowed.
- Article length is prompt guidance rather than a deterministic acceptance range. Each section receives a rough share to establish scale, but sections are no longer rejected for missing that share or forced into exact paragraph shapes.
- Structured retries now repair only missing or malformed JSON fields. Error messages no longer report a misleading “best” word-count attempt.
- The configured primary LM Studio model is the only default candidate. Other installed models are neither selected nor loaded unless `LMSTUDIO_ALLOW_FALLBACK_MODELS=true` is explicitly enabled.
- The tracker now contains 12 columns, with `blog_type` directly after `blog_topic`.

### Fixed

- Successful iMessage posting confirmations now show the result, blog ID, and title as three separate blocks.
- Removed the conflicting combination of an independent tracker word count and a `short`/`medium`/`long` format choice.
- Prevented acceptable articles from failing because a section or paragraph was a few words outside a calculated range.
- Bound checkpoints to the complete selected JSON format so guidance or structure changes cannot resume stale generated sections.
- Removed a duplicated plain-text section heading when a model repeats the rendered heading at the start of its body.
- Preserved the inline `blog_type` dropdown after tracker updates.
- Kept posting errors with saved drafts out of generation retries.
- Preserved completed generation work across process exits.

### Removed

- The `example.md` file from every format; `format.json` is now the single source of truth.
- The tracker `blog_length` column.
- Section word-count tolerances, overall word-count rejection, exact paragraph-count rules, paragraph-size rules, required content-block rules, and word-allocation calculations.
- The repository's topic-specific factual-review rules, deterministic claim checks, additional LM Studio quality-review pass, and automated repair rounds.
- Closest-candidate word scoring and per-attempt word-count diagnostics.
- The hard-coded TypeScript format union and fixed heading-count map.

### Tested

- `npm run build`, all 24 deterministic plumbing tests, `npm run formats:validate`, `npm run formats:sync`, and `git diff --check`.
- The production workbook was re-imported and visually rendered with all 177 existing rows preserved, 12 columns, no formulas, and an inline `blog_type` dropdown containing all five discovered format IDs.
- Five isolated real-LM-Studio dry-runs used only the already-loaded `openai/gpt-oss-20b`: `short` produced 4 sections and 787 content words, `medium` 6 sections and 1,089 words, `long` 10 sections and 1,704 words, `how-to` 9 sections and 1,497 words, and `practical-guidance` 8 sections and 1,193 words. Every draft reached `awaiting_review` without editorial or word-count rejection, removed its checkpoint, and created a visually verified PDF.
- A real isolated Blog #18 dry-run used only the already-loaded `openai/gpt-oss-20b`, completed the plan and all 10 sections on their first attempts, produced 1,832 content words from the format's approximate 1,500-word target, removed its checkpoint, created Markdown and a six-page PDF, and moved only the copied tracker to `awaiting_review`.
