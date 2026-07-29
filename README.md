# WP Blog Agent

A local-first blog workflow. It selects one `pending` row—or retries a generation-error row that has no saved draft—from `manual-files/wordpress-blog-content-tracker.xlsx`, generates a Markdown draft using **only LM Studio**, requests an iMessage decision, and posts to WordPress only after an exact approval reply. It never downloads a model or sends prompts to cloud AI providers.

## Requirements and setup

- Node.js 22+ and npm. The direct Messages adapter requires macOS. Windows can run the workflow with the optional remote iMessage relay described below.
- LM Studio server reachable at `http://192.168.1.35:1234`, with `openai/gpt-oss-20b` installed. Set an optional LM Studio API token in the environment.
- WordPress Application Password for a dedicated account that can create and edit posts (normally an Author or Editor); never use a regular password.

```sh
npm install
cp .env.example .env
```

Set the iMessage recipient, tracker location, WordPress URL/user/application password, and keep `WORDPRESS_POST_STATUS=draft` unless intentional publication is required. HTTPS is enforced unless `WORDPRESS_ALLOW_HTTP=true` is explicitly set for local development. Do not commit `.env`, drafts, logs, or ad hoc workbook copies.

The workbook contains only a `Blog tracker` sheet with exactly these columns: `blog_id`, `blog_topic`, `blog_type`, `blog_status`, `blog_created_date`, `blog_posted_date`, `markdown_path`, `review_status`, `review_token`, `model_used`, `wordpress_post_id`, and `wordpress_url`. `blog_type` selects a format discovered from `config/blog-formats/`; it is the only article-size input. The bundled definitions are `short`, `medium`, `long`, `how-to`, and `practical-guidance`. The agent atomically writes a validated temporary workbook, preserves the inline `blog_type` dropdown, and uses an exclusive sidecar lock to prevent two workers claiming the same row. A posting error is never mistaken for a generation retry because any error row with a `markdown_path` is excluded from generation claims.

## Blog format definitions

Each format is one `config/blog-formats/<format-id>/format.json`. That file owns its identity, approximate `target_words`, broad `writing_guidance`, `tone`, `expertise_level`, `conclusion_guidance`, `avoid` guidance, and ordered `sections`. Every section contains a stable `key`, a `heading_example`, and a `content_instruction`.

To add a format, copy an existing format folder, give it a unique lowercase ID, and edit its single JSON file. Section keys must be unique lowercase identifiers; their array order is the final article order. Then run:

```sh
npm run formats:validate
npm run formats:sync
```

Validation is read-only and checks only format plumbing: valid JSON, unique IDs and section keys, required nonempty metadata, a positive approximate target, and at least one usable section. The editorial fields guide generation; they are **never used to reject generated prose**. There are no word-count tolerances, paragraph rules, required lists/examples/tables, tone scoring, conclusion scoring, or factual claim rules. Sync writes the discovered IDs directly into the `blog_type` dropdown without creating a reference worksheet or named range. No TypeScript edit or second template file is needed.

## LM Studio behavior

The agent uses native `GET /api/v1/models` and `POST /api/v1/models/load` to find/load already-installed models, and OpenAI-compatible `GET /v1/models` to health-check. Generation gives `openai/gpt-oss-20b` forced function schemas through LM Studio’s [Responses API](https://lmstudio.ai/docs/developer/openai-compat/responses), the API LM Studio documents with GPT-OSS and its Harmony format. Other eligible LM Studio LLMs use the documented [`json_schema` Chat Completions structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output).

Generation is staged so a long article can resume section by section. First, a format-derived schema produces metadata and one topic-specific heading for every JSON-defined section. The plan prompt asks LM Studio to keep those sections distinct and use the configured conclusion as synthesis or a next step instead of another body topic. Each later call receives the complete format guidance, every rendered heading paired with its format purpose, and an explicit boundary that it owns only the current section. It returns the Markdown content for that section without repeating the article title or any section heading. The call also receives a rough share of the format's target to establish scale. `target_words` and the `avoid` list remain writing guidance, never deterministic pass/fail rules.

After each valid plan or nonempty section, an atomic checkpoint is saved beneath `CHECKPOINTS_DIR`, scoped to the tracker path and the complete JSON format definition. If generation stops, the next claim resumes completed sections instead of discarding them. A successful Markdown draft removes its checkpoint. Retry feedback is limited to returning valid structured JSON with the required fields; it does not critique article length, style, or prose.

The agent uses only `LMSTUDIO_PRIMARY_MODEL` (default `openai/gpt-oss-20b`) and makes up to three structured-output retries per stage. It will load that configured primary model if necessary, but it will not use or load a different model by default. Set `LMSTUDIO_ALLOW_FALLBACK_MODELS=true` only when you explicitly want other installed LLMs advertised by the same LM Studio server to be tried and, when necessary, loaded into memory. This never downloads a model; embeddings, Ollama, hosted OpenAI, Anthropic, and other providers remain excluded. Selected model, section progress, checkpoint activity, retry errors, and completion are written to the run log and tracker. `LMSTUDIO_TIMEOUT_MS` defaults to five minutes, while `LMSTUDIO_MAX_TOKENS` defaults to 6,000 to bound a runaway response and produce an explicit completion error.

## Commands

```sh
npm run once
npm run worker
npm run once -- --dry-run
npm run relay
npm run formats:validate
npm run formats:sync
npm run lint
npm test
```

`once` handles valid outstanding replies then claims/generates at most one row. A generation-error row without a draft has priority so failed work is retried promptly and can resume its checkpoint; otherwise the first pending row is claimed. `worker` repeats at `POLL_INTERVAL_MS`. Dry-run still uses the real configured LM Studio instance and updates only the supplied tracker/draft, but never sends an iMessage or posts to WordPress. Always use a copy when dry-running; checkpoint namespaces are isolated by the tracker’s absolute path.

Markdown source and formatted PDF review copies are saved under `data/drafts/`; resumable generation state is under `data/checkpoints/`; JSONL logs are under `data/runs/`. LM Studio returns a structured article plan and one Markdown body per JSON-defined section; application code assembles them with YAML front matter and names new drafts as `blog-<padded-id>-<slug>.md`. A same-basename `.pdf` preserves the title, headings, paragraphs, lists, tables, code blocks, links, and page numbers for editorial review. Table rows and wrapped list items are measured before pagination, and the normal left margin and text width are restored after tables.

The Markdown remains the authoritative source and is converted to WordPress HTML only at posting time. If its first body heading matches the post title, that duplicate heading is omitted from the posted HTML; remaining top-level Markdown section headings are published as `<h2>` elements. The saved Markdown and review PDF are unchanged by this WordPress-only normalization. WordPress post lookup by slug prevents duplicate posting after restart; post ID/URL/date are stored only after WordPress confirms the response.

## Review adapters and macOS permissions

The PDF review draft asks the recipient to reply exactly `YES <blog_id>` or `NO <blog_id>` (case-insensitive). On the Mac that controls Messages, the PDF is copied temporarily to `IMESSAGE_ATTACHMENT_OUTBOX` (default: `~/Pictures/WP Blog Agent Outbox`) because current Messages releases can silently fail to transfer files from development or temporary directories. The adapter sends the PDF first, waits for the matching `chat.db` row to report sent or delivered with no error, cleans up the temporary outbox copy, and only then sends `Blog draft #<blog_id> is ready...`. An AppleScript return alone is not treated as delivery. Messages from other senders and malformed, stale, or ambiguous text are ignored. `NO` records rejection and sends a confirmation; `YES` posts the matching approved Markdown draft, then sends `Draft Posted!`, `#<blog_id>`, the generated title, and the returned WordPress URL as separate blocks.

Set `IMESSAGE_ADAPTER=macos` to use Messages directly on the machine running the workflow. Sign into Messages first. macOS will request permission for the terminal/launch agent to automate Messages; allow it. Reading replies and confirming attachment sends query `~/Library/Messages/chat.db`, so grant the executing terminal or launch service **Full Disk Access** in System Settings → Privacy & Security. `IMESSAGE_CHAT_DB` and `IMESSAGE_ATTACHMENT_OUTBOX` accept either `$HOME/...` or `~/...`. `IMESSAGE_DELIVERY_TIMEOUT_MS` defaults to 60 seconds and `IMESSAGE_DELIVERY_POLL_MS` to 250 milliseconds. Use `IMESSAGE_ADAPTER=dry-run` before allowing real sends.

Set `IMESSAGE_ADAPTER=relay` on a non-macOS workflow machine to send and receive through a separate Mac that is signed into Messages. The relay is an add-on transport only: generation still uses LM Studio, and the Windows workflow still owns the tracker and WordPress posting state.

Copy `docs/com.nolanyoung.wp-blog-agent.plist.example` to `~/Library/LaunchAgents/`, replace the absolute paths, then bootstrap it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.plist`. Use a wrapper that exports Keychain secrets; never place credentials in the plist.

## Troubleshooting

Before real model work, confirm server/model availability and stream LM Studio logs: `lms server status`, `lms log stream --source server --json`, and `lms log stream --source model --filter input,output --json --stats`. If no usable LM Studio LLM returns the required structured fields, the row becomes `error`, its valid checkpoint is retained, the final structured-output error is reported, and WordPress is untouched. The next `npm run once` retries that row before a pending row. This repo’s policy prohibits fake model clients and canned model responses, so deterministic tests cover parsing and file behavior; real generation must be verified against LM Studio.

## Full First Instructions

These steps start on the Mac that will run the agent. They create a safe first WordPress **draft**; nothing publishes until you explicitly change `WORDPRESS_POST_STATUS=publish`.

### 1. Clone the repository into a folder

```sh
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/nolanyoungg/WP-blog-agent.git
cd WP-blog-agent
ls -l manual-files/wordpress-blog-content-tracker.xlsx
```

The starter tracker contains only `Blog tracker`, including the existing content queue (IDs `1`–`176`) and a format-ID dropdown sourced from `config/blog-formats/`.

### 2. Install Node dependencies

Install Node.js 22 or newer if needed, then run:

```sh
node --version
npm install
npm run lint
npm test
npm run formats:validate
```

The type check and tests must pass before continuing.

### 3. Prepare LM Studio

On the computer hosting LM Studio, start the server and make it reachable at `http://192.168.1.35:1234`. Confirm `openai/gpt-oss-20b` is installed and loaded. Do not configure Ollama or any cloud provider.

From the Mac running this project:

```sh
curl --fail http://192.168.1.35:1234/v1/models
```

The JSON must include `openai/gpt-oss-20b`. The agent may use only another LLM already on that same LM Studio server if the preferred model cannot complete; it never downloads a model.

### 4. Configure the local environment

```sh
cp .env.example .env
nano .env
```

Set these values, replacing all placeholders:

```dotenv
LMSTUDIO_BASE_URL=http://192.168.1.35:1234
LMSTUDIO_PRIMARY_MODEL=openai/gpt-oss-20b
IMESSAGE_ADAPTER=dry-run
IMESSAGE_RECIPIENT=+15555550123
WORDPRESS_BASE_URL=https://your-wordpress-site.example
WORDPRESS_USERNAME=your-dedicated-wordpress-user
WORDPRESS_APPLICATION_PASSWORD=your-wordpress-application-password
WORDPRESS_POST_STATUS=draft
```

Create the Application Password under the dedicated WordPress user’s profile. That user must be able to create and edit posts (normally Author or Editor); a Subscriber account cannot post through the REST API. Never use its normal login password. Save Nano with `Control-O`, `Return`, then `Control-X`. Never commit `.env`.

### 5. Enter the first topic in the tracker

Open `manual-files/wordpress-blog-content-tracker.xlsx` in Excel or Numbers. In `Blog tracker`, add a new unique `blog_id`, enter the exact topic, and select a `blog_type` ID from the inline dropdown. That single choice supplies the approximate length, editorial guidance, and ordered structure from its `format.json`. Keep `blog_status` as `pending`, then save. Do not change the header row; leave generated/result columns blank. Run `npm run formats:sync` after adding or removing a definition.

### 6. Run a safe real-LM-Studio dry-run on a copy

This calls real LM Studio and creates real Markdown and PDF review artifacts, but never sends iMessage or posts to WordPress:

```sh
cp manual-files/wordpress-blog-content-tracker.xlsx /tmp/wp-blog-agent-first-run.xlsx
npm run once -- --dry-run --tracker /tmp/wp-blog-agent-first-run.xlsx
```

Confirm successful generation in the terminal and inspect `data/drafts/`. The real tracker stays pending because the dry-run used a copy.

### 7. Enable Messages and macOS permissions

1. Sign into the intended account in macOS **Messages**.
2. Change `IMESSAGE_ADAPTER=dry-run` to `IMESSAGE_ADAPTER=macos` in `.env`.
3. Enable the terminal app under **System Settings → Privacy & Security → Full Disk Access**.
4. Approve the terminal’s first request to automate Messages.

### 8. Generate and send the first review draft

```sh
npm run once
```

The agent retries the first generation-error row without a draft, or claims the first pending row when no generation retry is waiting. It generates through LM Studio, saves authoritative `.md` and review `.pdf` files in `data/drafts/`, confirms the PDF attachment was sent to `IMESSAGE_RECIPIENT`, sends the approval instructions, and changes the row to `awaiting_review`.

### 9. Approve or reject from iMessage

Reply from the configured recipient with exactly:

```text
YES 2
NO 2
```

Then process the reply immediately:

```sh
npm run once
```

`YES 2` posts the WordPress draft and writes its ID/URL to the tracker only after confirmed success. `NO 2` records rejection and creates no post.

### 10. Keep it running for future rows (optional)

After the first post, add a row with a unique `blog_id`, next `blog_topic`, selected `blog_type`, and `blog_status` `pending`, then run:

```sh
npm run worker
```

For automatic startup, use `docs/com.nolanyoung.wp-blog-agent.plist.example` after replacing placeholder paths. Keep credentials in environment variables or macOS Keychain, never in the plist.

## Add-on: Windows workflow with a home-Mac iMessage relay

Use this add-on when Windows runs LM Studio and the workflow, while a Mac at home must send the iMessage review request and read its reply. It preserves the normal direct-macOS workflow; select it only by setting `IMESSAGE_ADAPTER=relay` on the Windows machine.

For the complete Home Windows + Home Intel Mac + Work Mac setup, including the first safe and official runs, follow [the three-machine runbook](docs/THREE-MACHINE-RUNBOOK.md).

```text
Windows PC                                      Home Intel Mac
──────────                                      ──────────────
LM Studio + this workflow ── private network ── token-protected relay + Messages
tracker, drafts, WordPress                      sends draft and reads YES/NO reply
```

The Mac needs Node.js and this repository, but does **not** need LM Studio. Keep the relay off the public internet. Bind it only to a private encrypted network address, or keep it on loopback behind an authenticated private tunnel. The shared bearer token is required even on that private network.

### 1. Prepare the home Mac relay

On the Mac signed into the intended iMessage account, clone or copy this repository, install dependencies, and make its own ignored `.env`:

```sh
cd /path/to/WP-blog-agent
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
nano .env
```

Set `IMESSAGE_RECIPIENT` to the phone number that will approve drafts. Paste the generated random value into `IMESSAGE_RELAY_TOKEN`; it must be identical on both machines. Set `IMESSAGE_RELAY_LISTEN_HOST` to the Mac's private-network address (or leave it as `127.0.0.1` when using a private tunnel), and leave the port at `8787` unless the private network requires another unused port.

```dotenv
IMESSAGE_RECIPIENT=+15186811835
IMESSAGE_CHAT_DB=$HOME/Library/Messages/chat.db
IMESSAGE_ATTACHMENT_OUTBOX=$HOME/Pictures/WP Blog Agent Outbox
IMESSAGE_DELIVERY_TIMEOUT_MS=60000
IMESSAGE_DELIVERY_POLL_MS=250
IMESSAGE_RELAY_TOKEN=paste-the-same-long-random-token-on-both-machines
IMESSAGE_RELAY_LISTEN_HOST=YOUR_PRIVATE_MAC_ADDRESS
IMESSAGE_RELAY_LISTEN_PORT=8787
```

Sign into Messages, grant the terminal **Automation** permission for Messages and **Full Disk Access**, then start the relay:

```sh
npm run relay
```

`IMESSAGE_ADAPTER` is not used by the relay command; it always uses the Mac-only Messages adapter. For persistent operation, copy `docs/com.nolanyoung.wp-blog-agent.relay.plist.example` into `~/Library/LaunchAgents/`, replace the absolute paths, then bootstrap it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.relay.plist`.

### 2. Configure Windows

Install LM Studio on the Windows PC, load the approved local model, and start its server. The workflow and LM Studio run on the same Windows machine, so use `127.0.0.1`, not a LAN address. Copy the same random relay token into Windows' ignored `.env` and set the relay URL to the home Mac's private address:

```dotenv
LMSTUDIO_BASE_URL=http://127.0.0.1:1234
LMSTUDIO_PRIMARY_MODEL=openai/gpt-oss-20b
IMESSAGE_ADAPTER=relay
IMESSAGE_RECIPIENT=+15186811835
IMESSAGE_RELAY_URL=http://YOUR_PRIVATE_MAC_ADDRESS:8787
IMESSAGE_RELAY_TOKEN=paste-the-same-long-random-token-on-both-machines
WORDPRESS_POST_STATUS=draft
```

If the private transport supplies HTTPS, use its `https://` URL instead. Do not forward the relay port from a public router or put the bearer token in a command history, shell profile, commit, log, or launchd plist.

### 3. Verify and run the first official draft

On Windows, confirm its real LM Studio server and start its logs before the first model request:

```powershell
Get-Date -Format o
lms server status
lms log stream --source server --json
```

Start this in another terminal too, and leave both streams running until the model finishes or returns a confirmed error:

```powershell
lms log stream --source model --filter input,output --json --stats
```

In a second PowerShell window, verify the model and the private relay without exposing the token in a reusable command:

```powershell
curl.exe --fail http://127.0.0.1:1234/v1/models
node --env-file=.env -e 'fetch(process.env.IMESSAGE_RELAY_URL + "/health", {headers: {authorization: "Bearer " + process.env.IMESSAGE_RELAY_TOKEN}}).then(async response => { if (!response.ok) throw new Error(await response.text()); console.log(await response.text()); })'
```

Once both checks succeed and the tracker has its pending topic, run:

```powershell
npm run once
```

The Windows workflow generates through real LM Studio, preserves the Markdown source, renders a PDF review copy, transfers that PDF to the Mac relay, and waits for the home Mac to confirm that Messages sent it before sending the approval instructions. Reply `YES <blog_id>` or `NO <blog_id>` from the configured recipient, then run `npm run once` on Windows again to process it. A `YES` creates a WordPress **draft** unless you intentionally change `WORDPRESS_POST_STATUS`.
