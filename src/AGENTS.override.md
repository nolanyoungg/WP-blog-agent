# src/AGENTS.override.md

## Scope

This file applies to the `src` directory and serves as a project-level override for agent behavior in the core implementation area of the WP Blog Agent.

## Operating principles

- Treat `src` as the backbone of the repository: changes here affect application behavior, automation flow, and production output.
- Be deliberate and conservative when editing code in this directory.

## Change safety rules

- Do not edit unrelated areas for convenience.
- Do not introduce new abstractions or architectural patterns without clear justification.
- Do not silently change behavior, contracts, or interfaces used by other modules.
- Do not add speculative features or debug-only logic.
- Do not weaken validation, error handling, or system safety checks.

## Implementation expectations

- Keep logic clear, maintainable, and readable.
- Favor explicit, well-named functions and variables.
- Maintain compatibility with the project's existing automation and agent orchestration approach.
- If a change affects data models, content generation, or external integrations, verify that the downstream consumers still remain consistent.
- When uncertainty exists, prefer the least disruptive fix over a more elegant redesign.


