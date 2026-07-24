# WP Blog Agent

A macOS-hosted, local-first blog workflow. It selects one `pending` row from `manual-files/wordpress-blog-content-tracker.xlsx`, generates a Markdown draft using **only LM Studio**, requests an iMessage decision, and posts to WordPress only after an exact approval reply. It never downloads a model or sends prompts to cloud AI providers.

## Requirements and setup

- Node.js 22+ and npm; macOS for the real Messages adapter.
- LM Studio server reachable at `http://192.168.1.35:1234`, with `openai/gpt-oss-20b` installed. Set an optional LM Studio API token in the environment.
- WordPress Application Password for a dedicated account; never use a regular password.

```sh
npm install
cp .env.example .env
```

Set the iMessage recipient, tracker location, WordPress URL/user/application password, and keep `WORDPRESS_POST_STATUS=draft` unless intentional publication is required. HTTPS is enforced unless `WORDPRESS_ALLOW_HTTP=true` is explicitly set for local development. Do not commit `.env`, drafts, logs, or workbooks.

The workbook must contain a sheet named `Blog tracker` with `blog_id`, `blog_topic`, `blog_status`, `blog_created_date`, and `blog_posted_date`. The agent safely adds its operational columns, preserves source topics, atomically writes a validated temporary workbook, and uses an exclusive sidecar lock to prevent two workers claiming the same pending row.

## LM Studio behavior

The agent uses native `GET /api/v1/models` and `POST /api/v1/models/load` to find/load already-installed models, and OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions` to health-check and generate. It tries `openai/gpt-oss-20b` first and retries one transient failure. Only another LLM advertised by that same LM Studio server is eligible as a fallback; embeddings, downloads, Ollama, hosted OpenAI, Anthropic, and other providers are excluded. Actual selected model and errors are written to the run log and tracker.

## Commands

```sh
npm run once
npm run worker
npm run once -- --dry-run
npm run lint
npm test
```

`once` handles valid outstanding replies then claims/generates at most one row. `worker` repeats at `POLL_INTERVAL_MS`. Dry-run still uses the real configured LM Studio instance and updates only the supplied tracker/draft, but never sends an iMessage or posts to WordPress. Always use a copy when dry-running:

```sh
cp manual-files/wordpress-blog-content-tracker.xlsx /tmp/wp-blog-agent-test.xlsx
npm run once -- --dry-run --tracker /tmp/wp-blog-agent-test.xlsx
```

Markdown source is saved unchanged under `data/drafts/`; JSONL logs are under `data/runs/`. The content is converted to WordPress HTML only at posting time. WordPress post lookup by slug prevents duplicate posting after restart; post ID/URL/date are stored only after WordPress confirms the response.

## Review and macOS permissions

The attached draft asks the recipient to reply exactly `YES <blog_id>` or `NO <blog_id>` (case-insensitive). Messages from other senders and malformed, stale, or ambiguous text are ignored. `NO` records rejection and stops; `YES` posts the matching approved draft. Completion and errors are confirmed by iMessage.

Sign into Messages first. macOS will request permission for the terminal/launch agent to automate Messages; allow it. Reading replies queries `~/Library/Messages/chat.db`, so grant the executing terminal or launch service **Full Disk Access** in System Settings → Privacy & Security. Use `IMESSAGE_ADAPTER=dry-run` before allowing real sends.

Copy `docs/com.nolanyoung.wp-blog-agent.plist.example` to `~/Library/LaunchAgents/`, replace the absolute paths, then bootstrap it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.plist`. Use a wrapper that exports Keychain secrets; never place credentials in the plist.

## Troubleshooting

Before real model work, confirm server/model availability and stream LM Studio logs: `lms server status`, `lms log stream --source server --json`, and `lms log stream --source model --filter input,output --json --stats`. If no usable LM Studio LLM completes, the row becomes `error`, the user is notified, and WordPress is untouched. This repo’s policy prohibits fake model clients and canned model responses, so deterministic tests cover parsing and file behavior; real generation must be verified against LM Studio.
