# Changelog

## Unreleased

### Added

- WordPress table-block markup with explicit collapsed borders, cell padding, shaded headers, and full-width layout for Markdown tables.
- Deterministic validation that preserves tracker-advertised counts in plans and requires an explicit `1` through `N` body sequence before final artifact release.
- A mandatory five-execution verification procedure that uses a copied tracker with all statuses reset to `pending`, the real configured LM Studio or LM Link model, correlated logs, and inspection of tracker, checkpoint, Markdown, and PDF results after every `npm run once`.
- One centralized promotional-language policy shared by every blog format, plan, section, repair, and final quality decision.
- Seven explicit structured article-audit decisions for claim support, headline fulfillment, advertised counts, currentness, conclusion scope, heading distinctness, and substantive usefulness.
- A claim-support audit for comparative and superlative claims, implementation-dependent tradeoffs, and cross-section contradictions.
- A holistic LM Studio article-review stage that owns a structured repair list covering factual accuracy, unsupported certainty, requirements versus recommendations, section scope, repetition, practical usefulness, clarity, and conclusion quality.
- Targeted metadata, heading, and section repair prompts that consume every reviewer issue before the complete article is reviewed again.
- Quality-loop checkpoints that preserve the quality phase, last review, pending and completed repair items, issue-attempt history, repaired content, and ordered model-call history across restarts.
- JSON-only `how-to` and `practical-guidance` formats alongside `short`, `medium`, and `long`.
- `tone`, `expertise_level`, `conclusion_guidance`, `avoid`, and ordered section definitions inside every `format.json`.
- 125 SEO-focused Shibey content topics across website development, app development, custom software, technical SEO, and analytics, extending the tracker through Blog #176.
- Extensible blog formats under `config/blog-formats/`. Each format owns its approximate target, editorial guidance, and structure in one JSON definition.
- Tracker-scoped, atomic generation checkpoints that resume a plan and completed sections only when the tracker row and complete format definition still match.
- Formatted PDF review artifacts alongside the authoritative Markdown drafts.
- An optional authenticated iMessage relay for a Windows workflow and a separate Mac signed into Messages.
- A populated, single-sheet editorial tracker and a three-machine operating runbook.

### Changed

- Article review now continues until the article passes, without an arbitrary review-round, total-repair, or per-section repair ceiling.
- Repeat findings progress from targeted correction to reinforced acceptance-condition guidance and then full plan or section replacement; replacement can continue when a material issue genuinely remains.
- Legacy checkpoints stopped by the removed three-round ceiling resume review when their tracker rows are returned to `pending`.
- Repeat escalation now uses stable section-and-audit-family identity, and only the most recent completed repair round is returned to the reviewer.
- Writer factual guidance was consolidated, and repair calls now receive a short correction contract instead of repeating the full generation prompt context.
- A technical `error` remains resumable, while editorial findings remain in the checkpointed review-and-repair loop until resolved.
- Structured reviewer bookkeeping is normalized without another model call when evidence is blank, issue IDs repeat, or repair items and audit verdicts disagree.
- Consequential percentages, currency amounts, pixel values, and time ranges are grouped into one deterministic repair per affected section; explicit examples and verified reader inputs remain allowed.
- Behavioral acceptance now comes from five isolated real-program executions against a copied tracker instead of hard-coded repository tests.
- Production TypeScript compilation now includes only `src/**/*.ts`; repository tests are no longer compiled into `dist/`.
- Tracker topics are now immutable reader assignments: generation and review must preserve and fulfill advertised counts instead of renumbering the headline to match the format's section count.
- Completed-repair history shown to the reviewer now omits obsolete quotes and prior edit instructions while retaining issue identity, problem, and acceptance criteria.
- The reviewer now reserves repairs for material unsupported claims and does not treat ordinary qualitative words or conditional recommendations as defects.
- Long-format heading directions are now topic-adaptive purpose descriptions that cannot be copied as reader-facing headings or expose internal format roles.
- Planning, section writing, and repair prompts now treat titles, excerpts, and introductions as delivery contracts, including coherent advertised counts and usable estimation methods for cost topics, while avoiding unverified changing-product recommendations.
- The holistic reviewer now returns evidence for every explicit audit dimension, and the parser rejects a top-level verdict that conflicts with those audit results.
- Generation now follows plan, section writing, holistic review, targeted repair, and complete re-review before Markdown or PDF review artifacts are released.
- Writer, reviewer, and repair calls now receive distinct task instructions while continuing to use the same configured LM Studio model and structured-output endpoints.
- Generation and review now treat claims such as easier maintenance, lower cost, faster delivery, cleaner output, and a "best" approach as conditional comparisons rather than unsupported defaults.
- Shared factual-quality guidance now requires conditional treatment of variable outcomes, separates official requirements from recommendations, and prohibits invented sources, statistics, guarantees, causal outcomes, and arbitrary thresholds.
- Source-free generation and review now remove external standards, versions, conformance levels, vendor guidelines, and numeric requirements instead of reconstructing them from model memory.
- A repeated problem advances from targeted repair to reinforced targeted feedback and then complete plan or section replacement. Stable section-and-audit identity prevents superficial quote changes from resetting escalation, while exact reviewer quotes are still mapped back to the plan or correct section before repair.
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

- Blog #7's conclusion complaint matched a heading stored in the article plan and was incorrectly routed to section `0`, causing two metadata rewrites while the final body section remained unchanged. Issue location now matches headings and body content together and routes conclusion-quality findings to the actual final section.
- Markdown tables posted to WordPress no longer depend on theme defaults for visible borders and readable cell spacing.
- Prevented reviewer paraphrases from resetting issue attempts and producing unbounded 28–30-item repair cycles.
- Prevented repair output from adding a new numeric threshold that was absent from the section being repaired.
- Discarded redundant certainty findings against already conditional claims and currentness findings where the article already directs readers to verify current primary documentation.
- Corrected LM Studio CLI discovery: this Mac has `/Users/dev/.lmstudio/bin/lms`, but that directory was absent from `PATH`.
- Prevented a word-boundary bug from hiding percentages that use `%`, including narrow no-break spaces rendered in PDFs.
- Prevented bare currency ranges from bypassing the source-free numeric-threshold policy.
- Prevented an introduction or conclusion from being selected for an advertised-count repair when an existing partial sequence or dedicated checklist section is available.
- Prevented an otherwise valid advertised sequence from passing while another numbered list competes with it elsewhere in the article.
- Prevented already fulfilled count/checklist complaints from triggering another plan replacement.
- Replaced newly invented repair thresholds with neutral scope-, baseline-, content-, or verified-input language instead of paying for repeated identical structured retries.
- Collapsed exact duplicate reviewer findings before repair so one quoted problem cannot trigger repeated model edits under different issue IDs.
- Prevented empty promotional absolutes such as `perfect`, `unmatched`, `works best`, and `ideal` from surviving a model pass by routing them into the existing editorial repair loop without a structured-output retry.
- Preserved nested unordered-list details in review PDFs instead of rendering only their parent labels.
- Converted em dashes to spaced ASCII punctuation in review PDFs instead of joining adjacent words with bare hyphens.
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

- The three-round article-review ceiling, five-repair-per-round ceiling, two-repairs-per-section truncation, and repeated-issue terminal failure.
- The `tests/` directory, its 44 hard-coded tests, the `npm test` command, and the test-fixture dry-run command.
- `LMSTUDIO_ALLOW_FALLBACK_MODELS`; every writer, reviewer, and repair call now stays on the configured primary model.
- The `example.md` file from every format; `format.json` is now the single source of truth.
- The tracker `blog_length` column.
- Section word-count tolerances, overall word-count rejection, exact paragraph-count rules, paragraph-size rules, required content-block rules, and word-allocation calculations.
- Closest-candidate word scoring and per-attempt word-count diagnostics.
- The hard-coded TypeScript format union and fixed heading-count map.

### Tested

- Reviewed the user's live Blogs #1–#7 run without repeating it. Blog #7 generated all ten sections successfully, then repeated one `conclusion_scope` finding across three reviews because both repair calls were misrouted to article-plan metadata; the retained checkpoint and run log identify the routing error deterministically.
- Deterministic WordPress rendering inspection confirms Markdown tables produce a `wp-block-table` wrapper plus explicit table, header-cell, and body-cell border styling.
- Located the installed LM Studio CLI at `/Users/dev/.lmstudio/bin/lms`, confirmed server port `1234` and loaded `openai/gpt-oss-20b`, and used the documented `lms log stream --source server --json` plus `lms log stream --source model --filter input,output --json --stats` commands. The final isolated Blog #4 confirmation produced 350 valid server-log JSON lines and 34 valid model-log JSON lines.
- The required five executions used a copied 176-row tracker with every status reset to `pending` and every prior result field cleared. Blog #1 used two repairs and passed round 2; the first Blog #2 exposed a bad count-repair section selector and stopped terminally at round 3; Blog #3 passed round 1 with zero repairs instead of the prior 28; Blog #4 passed round 1 but PDF inspection exposed an unsupported `12 months`; and Blog #5 passed round 1 with zero repairs. The exposed Blog #2 and #4 defects were fixed rather than omitted from the evidence.
- A corrected Blog #2 confirmation preserved the assigned title, produced exactly one numbered sequence containing 1 through 15, removed competing numbered lists, passed by round 3, removed its checkpoint, and produced clean six-page Markdown/PDF artifacts. All writer, reviewer, and repair calls in the final confirmation completed on attempt 0.
- A corrected Blog #3 artifact passed in two rounds with three repairs, contains no unsupported consequential thresholds or centrally prohibited promotional wording, and renders cleanly across six PDF pages. A separately log-streamed stochastic repeat stopped as terminal `quality_failed` on a repeated conclusion complaint at round 3, confirming the ceiling fails closed instead of releasing a false pass.
- The final log-streamed Blog #4 confirmation grouped unsupported rates by section, used repair counts of 2 and 1 across rounds 1 and 2, passed round 3, removed its checkpoint, and produced a clean five-page artifact that directs readers to collect current local rates instead of publishing generic prices.
- Final application scans found zero unsupported percentages, currency amounts, pixel/time thresholds, or centralized promotional phrases in the selected Blogs #1–#5 Markdown artifacts. Visual inspection of their final PDFs covered 6, 6, 6, 5, and 5 pages respectively and found no clipping, overlap, broken tables/lists, unreadable glyphs, or footer collisions.
- `npm run build`, `npm run lint`, `npm run formats:validate`, deterministic assignment/threshold probes, and `git diff --check` pass with the bounded review pipeline. The repository intentionally has no hard-coded test suite or format-check script.
- Five required `npm run once -- --dry-run --tracker <copied-tracker>` executions used a separate 176-row workbook with every `blog_status` and `review_status` reset to `pending` and all prior result fields cleared. The configured endpoint `http://192.168.1.35:1234` passed its health check and exposed the configured `openai/gpt-oss-20b` model. LM Studio log streaming was mistakenly skipped because `lms` was absent from `PATH`; later inspection found the installed CLI at `/Users/dev/.lmstudio/bin/lms`.
- Five-run execution 1 generated Blog #1, repaired two centrally prohibited promotional phrases in round 1, passed in round 2, removed its checkpoint, produced Markdown with none of the prohibited phrases, rendered a clean five-page PDF, and moved the copied row to `awaiting_review`.
- Five-run execution 2 generated Blog #2 and failed in round 4 after the same `CLAIM_SUPPORT_001` key accumulated four times. The retained sentence already said the outcome depended on many factors and was not guaranteed. The copied row correctly became `error`, retained its checkpoint, and did not receive a final Markdown or PDF path.
- Five-run execution 3 retried and resumed Blog #2 from the supposedly failed checkpoint, executed the pending round-4 repairs, introduced ten newly worded findings in round 5, and passed in round 6. Artifact inspection rejected that model pass as behaviorally incorrect: a reviewer-directed plan repair removed the immutable `15 Steps` title promise, and the resulting six-page article contained only one five-item numbered sequence.
- Five-run execution 4 generated Blog #3, processed 28 repair findings in round 1, retried one round-2 reviewer response with empty `claim_support` evidence, then passed. Its six-page PDF rendered cleanly and prohibited promotional wording was absent, but repair output introduced prescriptive daily monitoring and a 10–15 percent iteration buffer despite the source-free arbitrary-threshold policy.
- Five-run execution 5 generated Blog #4, processed 4, 14, and 12 repair findings across rounds 1–3, then passed in round 4. The article supplied a usable hours-times-rate budgeting method and its six-page PDF rendered cleanly, but it also introduced unsupported illustrative contingency and maintenance ranges of 10–15 and 10–20 percent.
- The five executions therefore did not verify the current writer-reviewer-repair behavior as correct. They exposed reviewer churn, mutable tracker promises, a nonterminal quality-failure checkpoint, issue-key wording resets, false-positive claim findings, false-positive final passes, and no article-wide review-round ceiling.
- Reviewed the live `npm run worker` session beginning `2026-07-30T18:40:09.864Z`: Blogs #1, #2, #4, and #6 reached `awaiting_review` or were posted, while Blog #3 stalled after four detections of `perfect` inside “pixel-perfect” and Blog #5 stalled after four repeated reviewer demands to remove named tools despite an explicit current-version verification disclaimer.
- `npm run build`, `npm run lint`, all 44 deterministic tests, `npm run formats:validate`, and `git diff --check` for the centralized promotional-language policy, material-claim review boundaries, duplicate repair collapse, immutable tracker promises, stale-history removal, explicit quality audits, headline fulfillment, topic-adaptive headings, and PDF fixes.
- A fresh isolated real-LM-Studio Blog #2 dry run used the configured `openai/gpt-oss-20b`, preserved and delivered the assigned 15-step promise as one 15-item checklist, contained none of the centrally prohibited promotional phrases, removed its checkpoint, created Markdown and a visually verified six-page PDF, and reached `awaiting_review`. The run required nine editorial review rounds and one structured retry for empty audit evidence, so it remains evidence of reviewer churn rather than production readiness.
- `npm run build`, `npm run lint`, all 36 deterministic tests, `npm run formats:validate`, and a scoped `git diff --check` for the writer-reviewer-repair implementation.
- An isolated real-LM-Studio Blog #60 dry run used the configured `openai/gpt-oss-20b`; every model call completed on attempt 0, the reviewer requested nine repairs in round one and passed the article in round two, the checkpoint was removed, the copied tracker reached `awaiting_review`, and the three-page PDF was visually inspected.
- `npm run build`, `npm run lint`, all 31 deterministic tests, `npm run formats:validate`, and `git diff --check`.
- A real production Blog #59 run used the configured, already-loaded `openai/gpt-oss-20b`. Its run log records health checks, first-attempt completion of the plan and all 10 sections, checkpoint removal, Markdown and PDF creation, successful iMessage delivery, and the final `awaiting_review` state.
- Corrected local Blog #55 was checked against current primary Squarespace and WordPress documentation, regenerated without changing WordPress post `28357`, and visually inspected across all six PDF pages. Tables, wrapped list items, section transitions, margins, and footers render cleanly.
- The production workbook was re-imported and visually rendered with all 177 existing rows preserved, 12 columns, no formulas, and an inline `blog_type` dropdown containing all five discovered format IDs.
- Five isolated real-LM-Studio dry-runs used only the already-loaded `openai/gpt-oss-20b`: `short` produced 4 sections and 787 content words, `medium` 6 sections and 1,089 words, `long` 10 sections and 1,704 words, `how-to` 9 sections and 1,497 words, and `practical-guidance` 8 sections and 1,193 words. Every draft reached `awaiting_review` without editorial or word-count rejection, removed its checkpoint, and created a visually verified PDF.
- A real isolated Blog #18 dry-run used only the already-loaded `openai/gpt-oss-20b`, completed the plan and all 10 sections on their first attempts, produced 1,832 content words from the format's approximate 1,500-word target, removed its checkpoint, created Markdown and a six-page PDF, and moved only the copied tracker to `awaiting_review`.
