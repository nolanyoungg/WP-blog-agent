# src

This directory is the core implementation area for the WP Blog Agent project. It contains the application logic, data models, automation workflows, and supporting modules that drive the blog generation pipeline.

The structure under `src` is organized by responsibility so that the project remains maintainable as features grow. Each child folder below contains a distinct layer of the system, from agent orchestration and content generation to storage and infrastructure integration.

## Child folders

### `agents/`
Contains the autonomous agent implementations and orchestration logic that coordinate the blog-generation process. This is where the system decides how to plan content, draft posts, validate them, and move work through the pipeline. If a workflow is driven by an "agent" or a multi-step task chain, it likely lives here.

### `components/`
Holds reusable UI or functional building blocks used across the project. This directory typically contains modular pieces such as smaller React/JSX components, shared widgets, rendering helpers, or logic fragments that are composed into larger screens or workflows.

### `config/`
Stores configuration files, environment settings, and project defaults. This folder keeps secrets, runtime options, and app behavior toggles isolated from business logic so the system can be configured without code changes.

### `lib/`
A general-purpose support layer for shared utility code, helper functions, and cross-cutting services. This is where code that is broadly reusable across the app—formatting, parsing, validation, filesystem access, or general platform helpers—should live.

### `models/`
Defines the data structures and domain types used throughout the application. These models represent the business entities, workflow inputs/outputs, and typed objects that allow the rest of the project to communicate consistently.

### `routes/`
Contains API route handlers or endpoint definitions. This area is responsible for receiving requests, validating inputs, and dispatching work to the underlying services or agent logic. In a web app, this is typically the HTTP-facing entry point for the project.

### `services/`
Contains the core application services and integration logic. This is where external systems are wrapped, orchestration logic is implemented, and business workflows are translated into concrete operations such as publishing content, interacting with APIs, or managing data.

### `store/`
Holds state management code, including context providers, reducers, selectors, and centralized application state. This folder is responsible for managing the flow of data between UI and services while keeping state transitions predictable and testable.

### `types/`
Contains shared TypeScript type definitions and interfaces. This directory centralizes contract definitions so components, routes, services, and agents all use the same structure and avoid drift between modules.

### `utils/`
Stores small, focused helper functions that do not belong to a broader service or library abstraction. These utilities often handle common operations like transformations, sanitization, time/date helpers, or formatting logic.

### `views/`
Contains page-level or feature-level UI views and screens. This folder is where the end-user experience is assembled, combining components, state, and service calls into the actual user-facing interface.

## How to think about the codebase

The `src` directory is the operational heart of the project: the place where the product is actually built. Most code changes should be made here, and most new features will naturally fit into one of these folders based on responsibilities:

- Business logic and orchestration: `agents/`, `services/`, `lib/`
- Data shape and contracts: `models/`, `types/`
- User-facing behavior: `components/`, `views/`, `routes/`
- Config and environment: `config/`
- Shared helpers: `utils/`
- State management: `store/`

This README is intentionally high-level so that the source tree is easy to navigate. For deeper implementation details, inspect the child folders and the code that is closest to the feature you are changing.
