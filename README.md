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

The workbook has a `Blog tracker` sheet with `blog_id`, `blog_topic`, `blog_status`, `blog_created_date`, and `blog_posted_date`. The agent safely adds or maintains its operational columns, preserves source topics, atomically writes a validated temporary workbook, and uses an exclusive sidecar lock to prevent two workers claiming the same pending row.

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

`once` handles valid outstanding replies then claims/generates at most one row. `worker` repeats at `POLL_INTERVAL_MS`. Dry-run still uses the real configured LM Studio instance and updates only the supplied tracker/draft, but never sends an iMessage or posts to WordPress. Always use a copy when dry-running.

Markdown source is saved unchanged under `data/drafts/`; JSONL logs are under `data/runs/`. The content is converted to WordPress HTML only at posting time. WordPress post lookup by slug prevents duplicate posting after restart; post ID/URL/date are stored only after WordPress confirms the response.

## Review and macOS permissions

The attached draft asks the recipient to reply exactly `YES <blog_id>` or `NO <blog_id>` (case-insensitive). Messages from other senders and malformed, stale, or ambiguous text are ignored. `NO` records rejection and stops; `YES` posts the matching approved draft. Completion and errors are confirmed by iMessage.

Sign into Messages first. macOS will request permission for the terminal/launch agent to automate Messages; allow it. Reading replies queries `~/Library/Messages/chat.db`, so grant the executing terminal or launch service **Full Disk Access** in System Settings → Privacy & Security. Use `IMESSAGE_ADAPTER=dry-run` before allowing real sends.

Copy `docs/com.nolanyoung.wp-blog-agent.plist.example` to `~/Library/LaunchAgents/`, replace the absolute paths, then bootstrap it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.plist`. Use a wrapper that exports Keychain secrets; never place credentials in the plist.

## Troubleshooting

Before real model work, confirm server/model availability and stream LM Studio logs: `lms server status`, `lms log stream --source server --json`, and `lms log stream --source model --filter input,output --json --stats`. If no usable LM Studio LLM completes, the row becomes `error`, the user is notified, and WordPress is untouched. This repo’s policy prohibits fake model clients and canned model responses, so deterministic tests cover parsing and file behavior; real generation must be verified against LM Studio.

## Full First Instructions

These steps start on the Mac that will run the agent. They create a safe first WordPress **draft**; nothing publishes until you explicitly change `WORDPRESS_POST_STATUS=publish`.

### 1. Clone the repository into a folder

Open **Terminal** and run:

```sh
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/nolanyoungg/WP-blog-agent.git
cd WP-blog-agent
```

Verify that the starter tracker exists:

```sh
ls -l manual-files/wordpress-blog-content-tracker.xlsx
```

It contains a `Blog tracker` sheet and a single pending sample row with `blog_id` `1`.

### 2. Install Node dependencies

Install Node.js 22 or newer if it is not already installed, then run:

```sh
node --version
npm install
npm run lint
npm test
```

The last two commands must pass before continuing.

### 3. Prepare LM Studio

On the computer hosting LM Studio, start the LM Studio server and make it reachable at `http://192.168.1.35:1234`. Confirm `openai/gpt-oss-20b` is installed and loaded. Do not configure Ollama or any cloud provider.

From the Mac running this project, verify the server and preferred model:

```sh
curl --fail http://192.168.1.35:1234/v1/models
```

The JSON output must include `openai/gpt-oss-20b`. If it does not, correct LM Studio before running the agent. The agent may use only another LLM already available on this same server if the preferred model cannot complete; it never downloads a model.

### 4. Configure the local environment

Create your private configuration file:

```sh
cp .env.example .env
nano .env
```

Set these values in `.env` (replace every placeholder):

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

In WordPress, create the Application Password under the dedicated user’s profile. Do not use that user’s normal login password. Save and close the file with `Control-O`, `Return`, then `Control-X`. Never commit `.env`.

### 5. Enter the first topic in the tracker

Open `manual-files/wordpress-blog-content-tracker.xlsx` in Excel or Numbers. On the `Blog tracker` sheet, replace the sample row’s `blog_topic` text with the exact first topic you want. Keep `blog_id` as `1` and `blog_status` as `pending`, then save the workbook.

Do not change the header row. Leave the generated/result columns blank; the agent fills them after each confirmed action.

### 6. Run a safe real-LM-Studio dry-run on a copy

The dry-run calls the real LM Studio server, creates a real Markdown draft, and updates its tracker copy. It never sends iMessage or posts to WordPress.

```sh
cp manual-files/wordpress-blog-content-tracker.xlsx /tmp/wp-blog-agent-first-run.xlsx
npm run once -- --dry-run --tracker /tmp/wp-blog-agent-first-run.xlsx
```

Check the terminal output for a successful LM Studio generation, then inspect the generated Markdown under `data/drafts/`. Because the dry-run used a copy, the real tracker still has its original pending row.

### 7. Enable Messages and macOS permissions

1. Sign into the intended account in the macOS **Messages** app.
2. In `.env`, change `IMESSAGE_ADAPTER=dry-run` to `IMESSAGE_ADAPTER=macos`.
3. Go to **System Settings → Privacy & Security → Full Disk Access** and enable the terminal app you are using.
4. On the first real send, approve macOS’s request to let that terminal automate Messages.

### 8. Generate and send the first review draft

Run this from the repository folder:

```sh
npm run once
```

The agent claims row `1`, generates the draft through LM Studio, saves it in `data/drafts/`, sends it to `IMESSAGE_RECIPIENT` as a `.md` attachment, and changes the row to `awaiting_review`.

### 9. Approve or reject from iMessage

Reply from the configured recipient with exactly one of these messages:

```text
YES 1
NO 1
```

To process the reply immediately, run:

```sh
npm run once
```

`YES 1` posts the Markdown as a WordPress draft and writes its post ID and URL into the tracker only after WordPress confirms success. `NO 1` records rejection and stops without creating a WordPress post.

### 10. Keep it running for future rows (optional)

After the first post succeeds, add a new row to the tracker with a unique `blog_id`, the next `blog_topic`, and `blog_status` set to `pending`. Then leave the worker running:

```sh
npm run worker
```

For automatic macOS startup, use the `launchd` example in `docs/com.nolanyoung.wp-blog-agent.plist.example` after replacing its placeholder paths. Keep credentials in environment variables or macOS Keychain, never in the plist.
