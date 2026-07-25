# Changelog

## Unreleased

### Added

- Optional authenticated iMessage relay add-on for a Windows workflow and a separate Mac signed into Messages. It transports review messages, attached Markdown drafts, and current replies without changing LM Studio generation, tracker ownership, or WordPress posting behavior.
- `npm run relay`, relay environment settings, deterministic relay transport coverage, and a launchd example for the home-Mac relay process.
- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Draft normalization for fenced YAML metadata emitted by a real LM Studio model response.
- Timestamped review requests so stale iMessage decisions are ignored.

### Changed

- Expanded the repository from its initial description into a documented application.
- LM Studio fallback selection now uses only typed LLM entries from `/api/v1/models`; embedding models cannot be selected.

### Fixed

- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.
- Resumed `approved` rows after a restart instead of leaving them stranded before WordPress posting.
- Rejected duplicate `blog_id` values before a tracker operation can target the wrong row.

### Removed

- Nothing.

### Tested

- `npm run lint` and `npm test` are the required deterministic validation commands.
- Relay tests verify bearer-token enforcement, temporary attachment transport, and review-reply round trips without invoking a model provider.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, recorded a review timestamp, and left iMessage and WordPress untouched.
- Regression tests prove stale review replies and duplicate tracker IDs are rejected.
