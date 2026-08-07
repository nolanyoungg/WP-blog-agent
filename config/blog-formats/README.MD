# Blog Formats

This directory contains the blog format definitions for the blog generation system.

The expected structure is:
- Each blog format is stored as its own child JSON file in this folder.
- Configuration should include things such as blog length, structure, tone, sections, formatting rules, and any other generation settings.
- All format definitions should remain machine-readable and consistent with the rest of the project.

## Standard blog lengths

The system is expected to support three primary blog length options:

- 750 words: short-form article
- 2000 words: baseline article length
- 5000 words: standard / majority article length

## Expected format behavior

- 2000 words is the base line for regular content.
- 5000 words is the most common target length for standard posts.
- 750 words may be used for a short version or quick-read article.
- Blog structure, section order, heading strategy, CTA placement, and other content rules should all live in the relevant child JSON file.

## Example file pattern

- `standard-5000.json`
- `baseline-2000.json`
- `short-750.json`

Each JSON file should define the blog format for that specific article length and structure.
