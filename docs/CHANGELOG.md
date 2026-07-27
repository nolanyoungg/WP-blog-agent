# Changelog

## Unreleased

### Added

- A 50-post, service-led Shibey SEO content plan in the versioned tracker. Each pending tracker row has a unique ID, SEO-focused title, target length, and article size; the companion `SEO Content Plan` sheet maps every post to a primary query, intent, funnel stage, relevant Shibey service page, and CTA.
- A reusable three-machine runbook for running the workflow from Home Windows, Messages from a Home Intel Mac, and LM Studio from a Work Mac over a private encrypted network.
- Optional authenticated iMessage relay add-on for a Windows workflow and a separate Mac signed into Messages. It transports review messages, attached Markdown drafts, and current replies without changing LM Studio generation, tracker ownership, or WordPress posting behavior.
- `npm run relay`, relay environment settings, deterministic relay transport coverage, and a launchd example for the home-Mac relay process.
- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Draft normalization for fenced YAML metadata emitted by a real LM Studio model response.
- Timestamped review requests so stale iMessage decisions are ignored.
- `blog_length` word targets and `blog_type` format choices in the tracker. `short`, `medium`, and `long` require exactly 4, 6, and 10 H1 headings respectively.

### Changed

- The versioned tracker is now a populated editorial plan rather than a single pending sample row. The runtime continues to read only the exact `Blog tracker` schema; `SEO Content Plan` is planning context for people.
- Expanded the repository from its initial description into a documented application.
- LM Studio fallback selection now uses only typed LLM entries from `/api/v1/models`; embedding models cannot be selected.
- A successful WordPress draft creation is recorded in the tracker and run log, then confirmed by iMessage with `Draft posted!` and its WordPress link.
- Condensed the tracker to its 13 requested columns and moved `blog_length` and `blog_type` directly after `blog_topic`; removed tracker-only error and timestamp columns in favor of the JSONL run log.

### Fixed

- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.
- Resumed `approved` rows after a restart instead of leaving them stranded before WordPress posting.
- Rejected duplicate `blog_id` values before a tracker operation can target the wrong row.
- Explicitly coerce direct-macOS review attachments to an AppleScript file alias before handing them to Messages.
- Expand `$HOME` as well as `~` in `IMESSAGE_CHAT_DB`, so the documented default opens the real Messages database instead of a literal `$HOME` path.
- Use the WordPress REST API's status-array query format when checking whether an approved draft was already posted, and include the WordPress error body when that check fails.

### Removed

- Nothing.

### Tested

- The workbook was re-imported after writing: `Blog tracker` contains the original posted row plus 50 pending rows (IDs `2`–`51`), `SEO Content Plan` contains all 50 mapped posts, its three summary formulas resolve to 50 posts / 62,600 words / 1,252 average words, and the workbook has no formula errors.
- `npm run lint` and `npm test` are the required deterministic validation commands.
- Relay tests verify bearer-token enforcement, temporary attachment transport, and review-reply round trips without invoking a model provider.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, recorded a review timestamp, and left iMessage and WordPress untouched.
- Regression tests prove stale review replies and duplicate tracker IDs are rejected.
- A real LM Studio dry-run with `openai/gpt-oss-20b` used an isolated 500-word `short` tracker row. Its first five-H1 result was rejected; the automatic retry produced 460 words and exactly four H1 headings, with no iMessage or WordPress activity.
