# Changelog

## Unreleased

### Added

- Recoverable `blocked_review_delivery` tracker state, legal transition enforcement, retry-first workflow handling, and starter-workbook validation support for the new state.
- A reusable three-machine runbook for running the workflow from Home Windows, Messages from a Home Intel Mac, and LM Studio from a Work Mac over a private encrypted network.
- Optional authenticated iMessage relay add-on for a Windows workflow and a separate Mac signed into Messages. It transports review messages, attached Markdown drafts, and current replies without changing LM Studio generation, tracker ownership, or WordPress posting behavior.
- `npm run relay`, relay environment settings, deterministic relay transport coverage, and a launchd example for the home-Mac relay process.
- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Draft normalization for fenced YAML metadata emitted by a real LM Studio model response.
- Timestamped review requests so stale iMessage decisions are ignored.

### Changed

- Review delivery now persists the generated draft and metadata while the row remains `generating`, then records a fresh `review_requested_at` and enters `awaiting_review` only after the message adapter succeeds.
- Later live runs retry a blocked row's existing draft before reply processing, approved-post resumption, or new generation; successful retry clears `last_error`, while failed retry remains recoverable.
- Expanded the repository from its initial description into a documented application.
- LM Studio fallback selection now uses only typed LLM entries from `/api/v1/models`; embedding models cannot be selected.

### Fixed

- Prevented failed review delivery from being overwritten as a generic generation `error` and from triggering a misleading secondary “could not be generated” message through the same unavailable channel.
- Preserved draft/model/token/creation metadata across review delivery failures and prevented blocked retries from regenerating content or creating WordPress posts.
- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.
- Resumed `approved` rows after a restart instead of leaving them stranded before WordPress posting.
- Rejected duplicate `blog_id` values before a tracker operation can target the wrong row.

### Removed

- Nothing.

### Tested

- `npm run lint` and `npm test` are the required deterministic validation commands.
- Deterministic workflow tests use failing and recording message adapters to verify blocked-state persistence, preserved draft bytes and metadata, retry success, fresh timestamps, cleared errors, stale-reply rejection, one successful delivery, and no LM Studio generation or WordPress posting during retry.
- Tracker tests cover the legal `generating -> blocked_review_delivery -> awaiting_review` recovery path and reject unsafe transitions.
- Relay tests verify bearer-token enforcement, temporary attachment transport, and review-reply round trips without invoking a model provider.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, recorded a review timestamp, and left iMessage and WordPress untouched.
- Regression tests prove stale review replies and duplicate tracker IDs are rejected.
