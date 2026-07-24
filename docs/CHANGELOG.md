# Changelog

## Unreleased

### Added

- Local-first TypeScript workflow with Excel tracking, LM Studio generation, iMessage review, and WordPress REST publishing.
- Atomic workbook updates, structured logs, Markdown drafts, dry-run mode, worker commands, a launchd example, and deterministic unit tests.
- A versioned starter tracker at `manual-files/wordpress-blog-content-tracker.xlsx` with the required sheet, columns, state dropdowns, and first pending row.
- A bottom-of-README `Full First Instructions` walkthrough from cloning through first iMessage approval and WordPress draft creation.
- Draft normalization for fenced YAML metadata emitted by a real LM Studio model response.

### Changed

- Expanded the repository from its initial description into a documented application.

### Fixed

- Corrected CLI script paths to use TypeScript’s emitted `dist/src/cli/index.js` entry point.

### Removed

- Nothing.

### Tested

- `npm run lint` and `npm test` are the required deterministic validation commands.
- The built application successfully reads the starter workbook and its pending first row.
- A real dry-run against a copied workbook completed with `openai/gpt-oss-20b`, created a draft, and left iMessage and WordPress untouched.
