# Changelog

## Unreleased

### Added

- A reusable three-machine runbook for running the workflow from Home Windows, Messages from a Home Intel Mac, and LM Studio from a Work Mac over a private encrypted network.
- Optional authenticated iMessage relay add-on for a Windows workflow and a separate Mac signed into Messages. It transports review messages, attached Markdown drafts, and current replies without changing LM Studio generation, tracker ownership, or WordPress posting behavior.
- `npm run relay`, relay environment settings, deterministic relay transport coverage, and a launchd example for the home-Mac relay process.
- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Timestamped review requests so stale iMessage decisions are ignored.
- Strict Zod response schemas for LM Studio health, native model inventory, model loading, and chat completion responses, with bounded server error details.
- Strict YAML and Zod validation for generated and stored blog drafts, including bounded metadata, required article structure, Markdown token safety checks, and immediate pre-post tamper detection.
- Deterministic Markdown rendering plus a WordPress HTML safety scan and sanitizer that rejects executable tags, active elements, event handlers, and executable URLs before any WordPress request.
- Runtime schemas for WordPress term lookups, duplicate-post lookups, and post-creation responses.

### Changed

- Expanded the repository from its initial description into a documented application.
- LM Studio fallback selection now uses only schema-checked LLM entries from `/api/v1/models`; embedding models cannot be selected, and an installed but unloaded primary is tried before fallback models.
- Chat generation now uses fixed deterministic settings (`temperature=0`, `top_p=1`, `seed=42`, `stream=false`) and an 8,192-token output cap, accepting only nonempty `finish_reason=stop` completions.
- WordPress now receives only schema-validated fields and scanned, sanitized HTML produced from a revalidated stored draft.

### Fixed

- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.
- Resumed `approved` rows after a restart instead of leaving them stranded before WordPress posting.
- Rejected duplicate `blog_id` values before a tracker operation can target the wrong row.
- Prevented truncated, filtered, tool-call, malformed, or empty LM Studio responses from being saved as review drafts.
- Prevented missing or malformed front matter and weak article structure from being silently repaired with inferred title, excerpt, or slug values.
- Prevented on-disk draft tampering and active rendered HTML from reaching any WordPress request.
- Prevented malformed WordPress lookup responses from allowing a subsequent post request.

### Removed

- Fenced-YAML normalization and inferred metadata fallbacks; generated output must now satisfy the literal front matter contract.

### Tested

- `npm run lint` and `npm test` are the required deterministic validation commands.
- Relay tests verify bearer-token enforcement, temporary attachment transport, and review-reply round trips without invoking a model provider.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, recorded a review timestamp, and left iMessage and WordPress untouched.
- Regression tests prove stale review replies and duplicate tracker IDs are rejected.
- Deterministic tests cover LM response envelopes and finish reasons, request determinism and token limits, malformed front matter, unsafe Markdown and HTML, stored-draft tampering, WordPress response schemas, no-request/no-post failure boundaries, and duplicate-slug idempotency without simulating model inference.
- Current hardening changes pass `npm ci`, `npm run build`, `npm run lint`, `npm test` (22 tests), and `git diff --check`.
- Live LM Studio validation is deferred in this environment: the `lms` CLI is not installed and the configured `http://192.168.1.35:1234/v1/models` health check returned `ECONNREFUSED`, so no model request or substitute provider was used.
- `npm audit --omit=dev` continues to report the pre-existing high-severity `xlsx` advisories for which the registry reports no fix.
