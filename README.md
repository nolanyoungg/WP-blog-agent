# WP Blog Agent

A local-first blog workflow. It selects one `pending` row from `manual-files/wordpress-blog-content-tracker.xlsx`, generates a Markdown draft using **only LM Studio**, requests an iMessage decision, and posts to WordPress only after an exact approval reply. It never downloads a model or sends prompts to cloud AI providers.

## Requirements and setup

- Node.js 22+ and npm. The direct Messages adapter requires macOS. Windows can run the workflow with the optional remote iMessage relay described below.
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
npm run relay
npm run lint
npm test
```

`once` handles valid outstanding replies then claims/generates at most one row. `worker` repeats at `POLL_INTERVAL_MS`. Dry-run still uses the real configured LM Studio instance and updates only the supplied tracker/draft, but never sends an iMessage or posts to WordPress. Always use a copy when dry-running.

Markdown source is saved under `data/drafts/`; JSONL logs are under `data/runs/`. Draft metadata is normalized whether LM Studio emits literal YAML front matter or a fenced YAML block, and the article content is converted to WordPress HTML only at posting time. WordPress post lookup by slug prevents duplicate posting after restart; post ID/URL/date are stored only after WordPress confirms the response.

## Review adapters and macOS permissions

The attached draft asks the recipient to reply exactly `YES <blog_id>` or `NO <blog_id>` (case-insensitive). Messages from other senders and malformed, stale, or ambiguous text are ignored. `NO` records rejection and stops; `YES` posts the matching approved draft. Completion and errors are confirmed by iMessage.

Set `IMESSAGE_ADAPTER=macos` to use Messages directly on the machine running the workflow. Sign into Messages first. macOS will request permission for the terminal/launch agent to automate Messages; allow it. Reading replies queries `~/Library/Messages/chat.db`, so grant the executing terminal or launch service **Full Disk Access** in System Settings → Privacy & Security. Use `IMESSAGE_ADAPTER=dry-run` before allowing real sends.

Set `IMESSAGE_ADAPTER=relay` on a non-macOS workflow machine to send and receive through a separate Mac that is signed into Messages. The relay is an add-on transport only: generation still uses LM Studio, and the Windows workflow still owns the tracker and WordPress posting state.

Copy `docs/com.nolanyoung.wp-blog-agent.plist.example` to `~/Library/LaunchAgents/`, replace the absolute paths, then bootstrap it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.plist`. Use a wrapper that exports Keychain secrets; never place credentials in the plist.

## Troubleshooting

Before real model work, confirm server/model availability and stream LM Studio logs: `lms server status`, `lms log stream --source server --json`, and `lms log stream --source model --filter input,output --json --stats`. If no usable LM Studio LLM completes, the row becomes `error`, the user is notified, and WordPress is untouched. This repo’s policy prohibits fake model clients and canned model responses, so deterministic tests cover parsing and file behavior; real generation must be verified against LM Studio.

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

The starter tracker contains a `Blog tracker` sheet and one pending sample row with `blog_id` `1`.

### 2. Install Node dependencies

Install Node.js 22 or newer if needed, then run:

```sh
node --version
npm install
npm run lint
npm test
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

Create the Application Password under the dedicated WordPress user’s profile; never use its normal login password. Save Nano with `Control-O`, `Return`, then `Control-X`. Never commit `.env`.

### 5. Enter the first topic in the tracker

Open `manual-files/wordpress-blog-content-tracker.xlsx` in Excel or Numbers. In `Blog tracker`, replace the sample row’s `blog_topic` with the exact first topic. Keep `blog_id` as `1` and `blog_status` as `pending`, then save. Do not change the header row; leave generated/result columns blank.

### 6. Run a safe real-LM-Studio dry-run on a copy

This calls real LM Studio and creates a real Markdown draft, but never sends iMessage or posts to WordPress:

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

The agent claims row `1`, generates through LM Studio, saves a `.md` draft in `data/drafts/`, sends it to `IMESSAGE_RECIPIENT`, and changes the row to `awaiting_review`.

### 9. Approve or reject from iMessage

Reply from the configured recipient with exactly:

```text
YES 1
NO 1
```

Then process the reply immediately:

```sh
npm run once
```

`YES 1` posts the WordPress draft and writes its ID/URL to the tracker only after confirmed success. `NO 1` records rejection and creates no post.

### 10. Keep it running for future rows (optional)

After the first post, add a row with a unique `blog_id`, next `blog_topic`, and `blog_status` `pending`, then run:

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

The Windows workflow generates through real LM Studio, writes the draft locally, transfers a temporary copy of the Markdown to the Mac relay, and sends the review message from the home Mac. Reply `YES <blog_id>` or `NO <blog_id>` from the configured recipient, then run `npm run once` on Windows again to process it. A `YES` creates a WordPress **draft** unless you intentionally change `WORDPRESS_POST_STATUS`.
