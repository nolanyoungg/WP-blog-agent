# Changelog

## Unreleased

### Added

- Tracker-scoped, atomic generation checkpoints under `data/checkpoints/`, allowing a stopped or failed article to resume its validated plan and completed sections.
- `config/editorial-guidance.json` with universal factual-safety constraints and authoritative Google Analytics source notes for current GA4 bounce-rate, key-event, and internal-traffic behavior.
- A real LM Studio structured quality-review stage that flags material factual/safety issues, repairs affected sections once, and re-reviews the completed article before any draft is saved.
- Per-attempt section word metrics, paragraph counts, best-attempt metadata, selected editorial rule/source IDs, checkpoint events, and quality-review results in JSONL run logs.
- Deterministic coverage for canonical paragraph contracts, fixed section schemas, generation-error retry selection, checkpoint identity/removal, GA4 source matching, quality-review parsing, and new environment paths.
- Formatted PDF review artifacts alongside authoritative Markdown drafts, including readable headings, paragraphs, lists, tables, code blocks, link destinations, document metadata, and page-numbered footers.
- A configurable macOS Messages attachment outbox under Pictures plus database-backed attachment send confirmation and bounded polling settings.
- Extensible blog format definitions under `config/blog-formats/`, with authoritative `format.json` rules and readable `example.md` files for the real `short`, `medium`, and `long` formats.
- A validated runtime format registry, generated LM Studio plan and section schemas, structured article renderer, and deterministic enforcement for section allocation, paragraphs, block rules, metadata, word tolerance, and exact H1 count.
- `npm run formats:validate` for read-only definition checks and `npm run formats:sync` for writing discovered format IDs directly into the workbook’s inline `blog_type` dropdown.
- Regression coverage that creates an arbitrary three-section format only in the operating-system temporary directory, exercises long-paragraph and required fenced-code rules, and removes it afterward.
- A 50-post, service-led Shibey editorial queue in the versioned tracker. Each planned row has a unique ID, SEO-focused title, target length, and article size.
- A reusable three-machine runbook for running the workflow from Home Windows, Messages from a Home Intel Mac, and LM Studio from a Work Mac over a private encrypted network.
- Optional authenticated iMessage relay add-on for a Windows workflow and a separate Mac signed into Messages. It transports review messages, attached PDF drafts, and current replies without changing LM Studio generation, tracker ownership, or WordPress posting behavior.
- `npm run relay`, relay environment settings, deterministic relay transport coverage, and a launchd example for the home-Mac relay process.
- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Draft normalization for fenced YAML metadata emitted by a real LM Studio model response.
- Timestamped review requests so stale iMessage decisions are ignored.
- `blog_length` word targets and `blog_type` format choices in the tracker. `short`, `medium`, and `long` require exactly 4, 6, and 10 H1 headings respectively.

### Changed

- Section generation now uses fixed required paragraph fields backed by one canonical ±15% word contract shared by prompts and deterministic validation. This avoids the previously problematic block-array maximum while making paragraph count structural.
- Validation retries now preserve the closest structured candidate across models and ask LM Studio to repair that JSON as untrusted article data instead of independently resampling every attempt.
- Generation-error rows without a saved draft now have claim priority so failed work is retried before new pending work; posting errors with a `markdown_path` are never regenerated.
- Format-level `writing_guidance` now reaches both the plan and every section prompt, and `npm run formats:validate` also loads and validates editorial guidance.
- Section validation messages now state the accepted range, received count, and minimum number of words to add or remove. Final failures and iMessage notifications identify the best attempt instead of only the last attempt.
- The versioned tracker now records Blog #18's confirmed generation error and Blog #21's completed real-model draft as awaiting review, without changing the SEO plan or format reference sheets.
- Review delivery now preserves Markdown for WordPress, renders a same-basename PDF for the recipient, sends the PDF before the ready text, and records `imessage.sent` only after Messages reports that attachment as sent or delivered.
- The relay request timeout now defaults to 90 seconds so it remains longer than the Mac's 60-second attachment confirmation window.
- Replaced the hard-coded `short | medium | long` TypeScript union and heading-count map with format IDs discovered from definition files. Future formats and section counts require no TypeScript change.
- Split generation, tracker, blog-domain, and messaging responsibilities into descriptive modules; new drafts use predictable `blog-<padded-id>-<slug>.md` names while existing paths remain readable.
- GPT-OSS generation now uses generated forced-function schemas through LM Studio’s `/v1/responses` Harmony-compatible path. Other eligible LM Studio models use the documented `/v1/chat/completions` `json_schema` response format. Validation failures are returned as precise correction feedback on retry, and application code—not model Markdown—renders headings and content blocks.
- Long-form generation is staged into one exact format-keyed metadata/heading plan followed by one structured call per section. Every section is validated before the next begins, then the assembled article is revalidated for total words and exact H1 count before a draft can be saved.
- Structured block schemas expose paragraphs plus explicitly required special block types, reject empty metadata strings in-schema, lower sampling temperature, and cap responses at 6,000 tokens; the default request timeout is five minutes for long local-model generations.
- Section prompts now recommend a concrete paragraph count and per-paragraph word target, with up to three validation-guided retries per stage for local-model convergence. Adjacent undersized paragraph fragments are merged deterministically and then checked against the original definition limits.
- Format synchronization now removes obsolete reference sheets and named ranges, then derives an inline `blog_type` dropdown directly from the validated JSON format registry.
- The versioned tracker is a populated, single-sheet editorial queue rather than a single pending sample row.
- Expanded the repository from its initial description into a documented application.
- LM Studio fallback selection now uses only typed LLM entries from `/api/v1/models`; embedding models cannot be selected.
- A successful WordPress draft creation is recorded in the tracker and run log, then confirmed by iMessage with `Draft posted!` and its WordPress link.
- Condensed the tracker to its 13 requested columns and moved `blog_length` and `blog_type` directly after `blog_topic`; removed tracker-only error and timestamp columns in favor of the JSONL run log.

### Fixed

- Prevent systematic one-paragraph under-generation by requiring every calculated paragraph field in the LM Studio schema and enforcing the identical paragraph count and word range after parsing.
- Eliminate prompt/schema/validator disagreement: section targets, accepted ranges, paragraph counts, and per-paragraph limits are now calculated once.
- Preserve completed generation work across process exits and section failures instead of abandoning the entire article.
- Prevent outdated GA4 definitions, obsolete conversion-event terminology, unsupported universal thresholds, and unqualified irreversible-filter advice from passing without a source-grounded review opportunity.
- Avoid silent macOS Messages attachment loss by staging PDFs under Pictures, passing a real POSIX file reference, detecting native transfer errors in `chat.db`, and withholding the ready text when attachment delivery fails.
- Keep a confirmed WordPress post recorded as `posted` if its optional iMessage confirmation cannot be delivered.
- Persist the inline `blog_type` data-validation rule in the actual XLSX package, including after atomic tracker updates, rather than setting an in-memory worksheet property that the writer does not serialize.
- Prevent model-supplied Markdown, HTML heading tags, setext markers, and fenced-code comments from creating or being miscounted as article H1 headings.
- Reject malformed format arrays, duplicate block requirements, invalid language requirements, empty metadata values, and invalid structured sections with actionable validation messages.
- Avoid premature long-article cancellation caused by the previous two-minute LM Studio request timeout.
- Avoid an LM Studio completion hang triggered by a nested `oneOf` block schema by using a flat, bounded block object instead.
- Avoid GPT-OSS Harmony channel fragments corrupting Chat Completions structured output by routing that model through the Responses API’s schema-enforced function arguments.
- Avoid GPT-OSS malformed or compressed ten-section tool arguments by keeping the exact section-key contract in a small plan call and generating validated body blocks one section at a time.
- Avoid expensive LM Studio grammar behavior from per-string `maxLength` constraints; content lengths remain enforced deterministically by the renderer.
- Leave content-block array maxima out of the grammar after real logs showed block-level `maxItems` delayed LM Studio schema compilation; the renderer still validates each block’s required structure.
- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.
- Resumed `approved` rows after a restart instead of leaving them stranded before WordPress posting.
- Rejected duplicate `blog_id` values before a tracker operation can target the wrong row.
- Expand `$HOME` as well as `~` in `IMESSAGE_CHAT_DB`, so the documented default opens the real Messages database instead of a literal `$HOME` path.
- Use the WordPress REST API's status-array query format when checking whether an approved draft was already posted, and include the WordPress error body when that check fails.

### Removed

- Independent retry resampling that discarded every rejected section candidate and reported only the final model response.
- The hard-coded format union, fixed heading-count map, vague `generation/blog.ts`, `tracker/excel.ts`, and combined `types.ts` modules.
- Accidental macOS `.DS_Store` metadata from version control; the ignore rules now prevent it from being recommitted.
- The `SEO Content Plan` and generated `Blog Formats` worksheets, plus the `BlogFormatIds` named range; the versioned workbook now contains only `Blog tracker`.

### Tested

- `npm run lint`, all 23 deterministic tests, `npm run formats:validate`, direct JSON parsing for every format plus editorial guidance, and `git diff --check` pass with the new reliability and quality pipeline.
- Merged the PDF iMessage attachment work into `main`; `npm run lint` completed successfully and all 20 deterministic tests passed.
- Before the single-sheet migration, the final tracker snapshot was stable after the worker stopped, re-imported successfully, retained all three sheets and the `BlogFormatIds` name, and contained no formula-error values.
- A real LM Studio run for Blog #21 completed all ten sections, created 10,195-byte Markdown and 11,670-byte PDF artifacts, delivered the PDF through Messages, and finished at `awaiting_review`; the run log and tracker agree on the completion timestamp and selected models.
- A real Blog #12 PDF was rendered to three letter-size pages and every page was visually inspected for clipping, overlap, heading orphans, blank pages, and footer correctness.
- A controlled send to the configured recipient produced an `application/pdf` Messages row with `error=0`, `is_sent=1`, `is_delivered=1`, and a clean temporary outbox; the earlier `.txt` attempts remain recorded as `error=25`, `is_sent=0`.
- A real isolated 1,500-word `long` dry-run with `openai/gpt-oss-20b` completed all ten sections, rendered matching Markdown and a four-page PDF, logged the PDF as the skipped dry-run attachment, and left the copied tracker at `awaiting_review` without sending iMessage or touching WordPress.
- Deterministic validation covers the real 4/6/10-section definitions, invalid temporary definitions, arbitrary temporary format discovery, structured schema sizing, block rendering, exact semantic H1 counts, predictable draft names, single-sheet tracker synchronization, and inline dropdown persistence after tracker updates.
- The versioned workbook was re-imported and visually rendered after synchronization: `Blog tracker` is the only sheet, its current operational rows are preserved, its inline dropdown contains every discovered format ID, obsolete named ranges are absent, and no formula-error values were found.
- A real isolated 500-word `short` dry-run completed with `openai/gpt-oss-20b`: all four sections passed deterministic validation, section 2 corrected its initial word-allocation failure on retry, matching Markdown and PDF artifacts were created, the copied single-sheet tracker reached `awaiting_review`, iMessage was skipped, and WordPress was untouched.
- `npm run lint` and `npm test` are the required deterministic validation commands.
- Relay tests verify bearer-token enforcement, temporary attachment transport, and review-reply round trips without invoking a model provider.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, recorded a review timestamp, and left iMessage and WordPress untouched.
- A real 1,500-word `long` dry-run against an isolated tracker copy completed with `openai/gpt-oss-20b`: all 10 sections passed, section 9 corrected a 114-word allocation failure on retry, the saved draft contained 1,533 content words and exactly 10 H1 headings, the copy moved to `awaiting_review`, iMessage was logged as skipped, and no WordPress event occurred.
- Regression tests prove stale review replies and duplicate tracker IDs are rejected.
- A real LM Studio dry-run with `openai/gpt-oss-20b` used an isolated 500-word `short` tracker row. Its first five-H1 result was rejected; the automatic retry produced 460 words and exactly four H1 headings, with no iMessage or WordPress activity.
