# Changelog

## Unreleased

### Added

- A holistic LM Studio article-review stage that owns a structured repair list covering factual accuracy, unsupported certainty, requirements versus recommendations, section scope, repetition, practical usefulness, clarity, and conclusion quality.
- Targeted metadata, heading, and section repair prompts that consume every reviewer issue before the complete article is reviewed again.
- Quality-loop checkpoints that preserve the quality phase, last review, pending and completed repair items, issue-attempt history, repaired content, and ordered model-call history across restarts.
- Deterministic coverage for reviewer pass invariants, metadata and section repair prompts, quality escalation, and resumable repair state.
- Focused PDF layout coverage for measured table rows, full-width text after tables, and wrapped list items near page footers.
- WordPress HTML regression coverage for duplicate-title removal and `<h2>` article sections.
- Posting-notification coverage for the URL returned by WordPress.
- JSON-only `how-to` and `practical-guidance` formats alongside `short`, `medium`, and `long`.
- `tone`, `expertise_level`, `conclusion_guidance`, `avoid`, and ordered section definitions inside every `format.json`.
- 125 SEO-focused Shibey content topics across website development, app development, custom software, technical SEO, and analytics, extending the tracker through Blog #176.
- Extensible blog formats under `config/blog-formats/`. Each format owns its approximate target, editorial guidance, and structure in one JSON definition.
- Tracker-scoped, atomic generation checkpoints that resume a plan and completed sections only when the tracker row and complete format definition still match.
- Formatted PDF review artifacts alongside the authoritative Markdown drafts.
- An optional authenticated iMessage relay for a Windows workflow and a separate Mac signed into Messages.
- A populated, single-sheet editorial tracker and a three-machine operating runbook.

### Changed

- Generation now follows plan, section writing, holistic review, targeted repair, and complete re-review before Markdown or PDF review artifacts are released.
- Writer, reviewer, and repair calls now receive distinct task instructions while continuing to use the same configured LM Studio model and structured-output endpoints.
- Shared factual-quality guidance now requires conditional treatment of variable outcomes, separates official requirements from recommendations, and prohibits invented sources, statistics, guarantees, causal outcomes, and arbitrary thresholds.
- Source-free generation and review now remove external standards, versions, conformance levels, vendor guidelines, and numeric requirements instead of reconstructing them from model memory.
- A repeated problem advances from targeted repair to reinforced targeted feedback, then complete plan or section replacement, and finally fails closed if replacement does not resolve it. Section, category, and normalized-problem identity prevents superficial quote changes from resetting escalation without conflating newly discovered issues, while exact reviewer quotes are still mapped back to the plan or correct section before repair.
- The configured `LMSTUDIO_PRIMARY_MODEL` is now the only model candidate; the workflow no longer offers or loads fallback models.
- Section-generation prompts now identify the current section's exclusive scope, pair the complete rendered heading set with format purposes, and tell LM Studio not to repeat the article title or section labels. Approximate word counts and editorial fields remain guidance only.
- WordPress posting now removes a matching first body title and demotes remaining top-level Markdown headings to `<h2>` only in the generated HTML. Authoritative Markdown and review PDFs retain their original structure.
- PDF tables and wrapped list items now use measured heights before page breaks and restore the normal page cursor after rendering.
- Successful posting notifications now include the generated draft title and the URL returned by WordPress.
- `blog_type` is now the only article-size and structure choice. All five bundled formats get their approximate targets, editorial context, and section structures from `format.json`.
- Generation follows the ordered JSON sections and passes the editorial fields to LM Studio as prompt guidance. The model returns ordinary Markdown for each section, so natural paragraphs, lists, quotes, tables, and code are allowed.
- Article length is prompt guidance rather than a deterministic acceptance range. Each section receives a rough share to establish scale, but sections are no longer rejected for missing that share or forced into exact paragraph shapes.
- Structured retries now repair only missing or malformed JSON fields. Error messages no longer report a misleading “best” word-count attempt.
- A passing review is checkpointed before artifact creation, and the checkpoint is removed only after both Markdown and PDF artifacts are saved.
- The tracker now contains 12 columns, with `blog_type` directly after `blog_topic`.

### Fixed

- Prevented articles with unresolved reviewer repair items from being saved, rendered, or sent for human approval.
- Prevented a process interruption during post-pass PDF creation from discarding the resumable checkpoint.
- Prevented a surviving issue from bypassing no-progress escalation by changing only its quoted wording.
- Prevented distinct reviewer findings in the same section and category from being misclassified as one stalled issue.
- Allowed unique repair locators to tolerate Markdown punctuation differences while discarding stale findings.
- Allowed the quality loop to repair title, excerpt, slug, taxonomy, and planned headings instead of trapping metadata problems in a section-only repair cycle.
- Prevented table cells from leaving the PDF cursor at the final cell width, which narrowed or misplaced following text.
- Prevented variable-height table rows and wrapped list items from crossing the review PDF footer.
- Prevented a duplicate article title and top-level `<h1>` section headings in posted WordPress content.
- Restored the WordPress URL to successful iMessage posting confirmations.
- Removed the conflicting combination of an independent tracker word count and a `short`/`medium`/`long` format choice.
- Prevented acceptable articles from failing because a section or paragraph was a few words outside a calculated range.
- Bound checkpoints to the complete selected JSON format so guidance or structure changes cannot resume stale generated sections.
- Removed a duplicated plain-text section heading when a model repeats the rendered heading at the start of its body.
- Preserved the inline `blog_type` dropdown after tracker updates.
- Kept posting errors with saved drafts out of generation retries.
- Preserved completed generation work across process exits.

### Removed

- `LMSTUDIO_ALLOW_FALLBACK_MODELS`; every writer, reviewer, and repair call now stays on the configured primary model.
- The `example.md` file from every format; `format.json` is now the single source of truth.
- The tracker `blog_length` column.
- Section word-count tolerances, overall word-count rejection, exact paragraph-count rules, paragraph-size rules, required content-block rules, and word-allocation calculations.
- Closest-candidate word scoring and per-attempt word-count diagnostics.
- The hard-coded TypeScript format union and fixed heading-count map.

### Tested

- `npm run build`, `npm run lint`, all 36 deterministic tests, `npm run formats:validate`, and a scoped `git diff --check` for the writer-reviewer-repair implementation.
- An isolated real-LM-Studio Blog #60 dry run used the configured `openai/gpt-oss-20b`; every model call completed on attempt 0, the reviewer requested nine repairs in round one and passed the article in round two, the checkpoint was removed, the copied tracker reached `awaiting_review`, and the three-page PDF was visually inspected.
- `npm run build`, `npm run lint`, all 31 deterministic tests, `npm run formats:validate`, and `git diff --check`.
- A real production Blog #59 run used the configured, already-loaded `openai/gpt-oss-20b`. Its run log records health checks, first-attempt completion of the plan and all 10 sections, checkpoint removal, Markdown and PDF creation, successful iMessage delivery, and the final `awaiting_review` state.
- Corrected local Blog #55 was checked against current primary Squarespace and WordPress documentation, regenerated without changing WordPress post `28357`, and visually inspected across all six PDF pages. Tables, wrapped list items, section transitions, margins, and footers render cleanly.
- The production workbook was re-imported and visually rendered with all 177 existing rows preserved, 12 columns, no formulas, and an inline `blog_type` dropdown containing all five discovered format IDs.
- Five isolated real-LM-Studio dry-runs used only the already-loaded `openai/gpt-oss-20b`: `short` produced 4 sections and 787 content words, `medium` 6 sections and 1,089 words, `long` 10 sections and 1,704 words, `how-to` 9 sections and 1,497 words, and `practical-guidance` 8 sections and 1,193 words. Every draft reached `awaiting_review` without editorial or word-count rejection, removed its checkpoint, and created a visually verified PDF.
- A real isolated Blog #18 dry-run used only the already-loaded `openai/gpt-oss-20b`, completed the plan and all 10 sections on their first attempts, produced 1,832 content words from the format's approximate 1,500-word target, removed its checkpoint, created Markdown and a six-page PDF, and moved only the copied tracker to `awaiting_review`.
