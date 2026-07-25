# Three-machine WP Blog Agent runbook

Use this guide for this exact arrangement:

| Machine | What it does | Repository needed | LM Studio needed |
| --- | --- | --- | --- |
| Home Windows PC | Runs the agent, tracker, drafts, logs, and WordPress posting | Yes | No |
| Home Intel Mac | Runs the iMessage relay only | Yes | No |
| Work Mac | Loads and serves openai/gpt-oss-20b | No | Yes |

The Home Windows PC is the only authoritative copy of the tracker. The Home Intel Mac only sends and reads Messages. The Work Mac only performs LM Studio inference.

## The finished layout

~~~
                 one private encrypted Tailscale network

Home Windows PC ───────────────────────> Work Mac
workflow + tracker                      LM Studio API :1234
      │
      └────────────────────────────────> Home Intel Mac
                                          iMessage relay :8787
~~~

This guide uses [Tailscale](https://tailscale.com/docs/how-to/connect-to-devices) only for private network connectivity. It is not a model provider; LM Studio remains the only model provider. Tailscale gives each device a stable private address or MagicDNS name, even if the Work Mac is on another physical network.

Never port-forward either service. Never expose LM Studio or the iMessage relay to the public internet.

If the Work Mac is governed by a policy that does not allow Tailscale, stop and use an employer-approved private network instead. Do not replace LM Studio with another provider or use a public tunnel.

## Before you begin

You need:

- Git and Node.js 22 or newer on Home Windows and the Home Intel Mac.
- LM Studio on the Work Mac, with openai/gpt-oss-20b already downloaded and able to respond locally.
- A dedicated WordPress account and its Application Password. Do not use a normal WordPress password.
- The phone number that will approve the drafts, for example +15186811835.
- The real tracker workbook with the first pending topic.
- Tailscale installed and signed into the same tailnet on all three machines. See the [Tailscale quickstart](https://tailscale.com/kb/1017/install/) and [macOS installation guide](https://tailscale.com/docs/install/mac).

Enable automatic date and time on all three machines. A reply with a timestamp older than the review request is deliberately ignored.

## Record these values securely

Use a password manager or a secure note. Do not commit any of these values or place them in a launchd plist.

| Value | Obtain it from | Used on |
| --- | --- | --- |
| WORK_MAC_TAILSCALE_IP | Work Mac: tailscale ip -4 | Home Windows |
| HOME_MAC_TAILSCALE_IP | Home Intel Mac: tailscale ip -4 | Home Windows and Home Intel Mac |
| RELAY_TOKEN | Generate once on Home Intel Mac | Home Windows and Home Intel Mac |
| LMSTUDIO_API_TOKEN | Work Mac LM Studio server settings, if authentication is enabled | Home Windows |
| WordPress Application Password | Dedicated WordPress user profile | Home Windows |

Start with the private IP addresses. Once the system works, you may use the corresponding MagicDNS names instead.

## 1. Connect the three machines privately

Install Tailscale on all three devices and sign in to the same tailnet. Confirm that every device appears in the Tailscale Machines page.

On both Macs, run:

~~~
tailscale ip -4
~~~

On Windows, confirm that the Tailscale app says Connected, then record the two Mac addresses from the Machines page. Tailscale supports connecting to a service by the device address or name. See [Connect to devices](https://tailscale.com/docs/how-to/connect-to-devices).

There is no router configuration in this design.

## 2. Prepare the Work Mac: LM Studio only

The Work Mac does not need this repository or iMessage permissions.

1. Open LM Studio and load openai/gpt-oss-20b.
2. Open Developer then Local Server, and start the API server on port 1234.
3. In Server Settings, enable Serve on Local Network. This moves the API beyond localhost. LM Studio recommends enabling authentication whenever you do this. See [Serve on Local Network](https://lmstudio.ai/docs/developer/core/server/serve-on-network).
4. Enable Require Authentication and generate an API token. Store it as LMSTUDIO_API_TOKEN in your password manager.
5. Keep the Work Mac awake and connected to Tailscale while a run is in progress.

On the Work Mac, prove the local server and private-network binding work. This prompts for the token without putting it into shell history:

~~~
read -s LMSTUDIO_API_TOKEN
printf '\n'
curl --fail -H "Authorization: Bearer $LMSTUDIO_API_TOKEN" http://127.0.0.1:1234/v1/models
tailscale ip -4
curl --fail -H "Authorization: Bearer $LMSTUDIO_API_TOKEN" http://WORK_MAC_TAILSCALE_IP:1234/v1/models
unset LMSTUDIO_API_TOKEN
~~~

The server controls are described in the official [LM Studio server settings](https://lmstudio.ai/docs/developer/core/server/settings).

If the private-address request fails, confirm Serve on Local Network is enabled, restart the LM Studio server, and accept any macOS firewall prompt for LM Studio. Do not move on until local serving works.

## 3. Prepare the Home Intel Mac: iMessage relay only

On the Home Intel Mac, clone the current main branch:

~~~
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/nolanyoungg/WP-blog-agent.git
cd WP-blog-agent
git switch main
git pull --ff-only origin main
node --version
npm ci
cp .env.example .env
~~~

Node must report version 22 or newer. This Mac does not install LM Studio and never loads a model.

Generate the relay token once:

~~~
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
~~~

Save that output securely as RELAY_TOKEN. The identical value goes in the Home Windows configuration.

Edit the Home Mac .env:

~~~
nano .env
~~~

Set these values. Leave LM Studio and WordPress settings blank or at their harmless example values on this Mac.

~~~
IMESSAGE_RECIPIENT=+15186811835
IMESSAGE_CHAT_DB=$HOME/Library/Messages/chat.db
IMESSAGE_RELAY_TOKEN=RELAY_TOKEN
IMESSAGE_RELAY_LISTEN_HOST=HOME_MAC_TAILSCALE_IP
IMESSAGE_RELAY_LISTEN_PORT=8787
~~~

Before the first real send:

1. Sign in to the intended Apple account in Messages.
2. In System Settings, Privacy & Security, Full Disk Access, add the terminal application that will run the relay.
3. Allow the terminal to automate Messages when macOS prompts on the first actual send.

Start the relay and leave this terminal open:

~~~
npm run relay
~~~

Expected output:

~~~
iMessage relay listening at http://HOME_MAC_TAILSCALE_IP:8787
~~~

From a second Home Mac terminal, verify the relay without displaying the token:

~~~
node --env-file=.env -e 'fetch("http://" + process.env.IMESSAGE_RELAY_LISTEN_HOST + ":" + process.env.IMESSAGE_RELAY_LISTEN_PORT + "/health", {headers: {authorization: "Bearer " + process.env.IMESSAGE_RELAY_TOKEN}}).then(async response => { if (!response.ok) throw new Error(await response.text()); console.log(await response.text()); })'
~~~

Expected result:

~~~
{"ok":true,"data":{"status":"ok"}}
~~~

Do not set IMESSAGE_ADAPTER=relay on the Home Mac. The relay command always uses the native macOS Messages adapter itself.

## 4. Plan the tracker handoff

Home Windows becomes the authoritative location for the tracker, drafts, run logs, and WordPress credentials. After you create the Windows clone in the next step, but before its connection checks, do the following:

1. Copy the real wordpress-blog-content-tracker.xlsx from its current location to Home Windows.
2. Put it at manual-files/wordpress-blog-content-tracker.xlsx inside the Windows clone, replacing the starter workbook.
3. Keep a backup of the original before the first run.
4. Do not edit different copies of the tracker on multiple machines after this point.

The workbook needs a Blog tracker sheet. The first row to run needs a unique blog_id, the desired blog_topic, and blog_status set to pending.

## 5. Prepare Home Windows: workflow and WordPress

In Home Windows PowerShell:

~~~
New-Item -ItemType Directory -Force "$HOME\Developer" | Out-Null
Set-Location "$HOME\Developer"
git clone https://github.com/nolanyoungg/WP-blog-agent.git
Set-Location WP-blog-agent
git switch main
git pull --ff-only origin main
node --version
npm ci
Copy-Item .env.example .env
notepad .env
~~~

Now perform the tracker handoff from step 4 before continuing.

Set these values in the Windows .env. Replace every all-caps placeholder.

~~~
# Work Mac: real LM Studio API through the private tailnet
LMSTUDIO_BASE_URL=http://WORK_MAC_TAILSCALE_IP:1234
LMSTUDIO_API_TOKEN=LMSTUDIO_API_TOKEN_FROM_WORK_MAC
LMSTUDIO_PRIMARY_MODEL=openai/gpt-oss-20b
LMSTUDIO_ALLOW_FALLBACK_LOAD=false
LMSTUDIO_TIMEOUT_MS=120000

# Home Intel Mac: token-protected iMessage relay through the private tailnet
IMESSAGE_ADAPTER=relay
IMESSAGE_RECIPIENT=+15186811835
IMESSAGE_RELAY_URL=http://HOME_MAC_TAILSCALE_IP:8787
IMESSAGE_RELAY_TOKEN=RELAY_TOKEN
IMESSAGE_RELAY_TIMEOUT_MS=30000

# Home Windows owns the operational artifacts and WordPress draft posting
TRACKER_PATH=manual-files/wordpress-blog-content-tracker.xlsx
DRAFTS_DIR=data/drafts
RUNS_DIR=data/runs
WORDPRESS_BASE_URL=https://YOUR-WORDPRESS-SITE.example
WORDPRESS_USERNAME=YOUR_DEDICATED_WORDPRESS_USER
WORDPRESS_APPLICATION_PASSWORD=YOUR_WORDPRESS_APPLICATION_PASSWORD
WORDPRESS_POST_STATUS=draft
WORDPRESS_ALLOW_HTTP=false
~~~

Never place the relay token, LM Studio API token, or WordPress Application Password in source files, Git commits, terminal history, screenshots, or the Home Mac launchd plist.

## 6. Verify both connections from Home Windows

Run deterministic checks first:

~~~
npm run lint
npm test
~~~

Verify the Work Mac model API without displaying its token:

~~~
node --env-file=.env -e 'const headers = process.env.LMSTUDIO_API_TOKEN ? {authorization: "Bearer " + process.env.LMSTUDIO_API_TOKEN} : {}; fetch(process.env.LMSTUDIO_BASE_URL + "/v1/models", {headers}).then(async response => { if (!response.ok) throw new Error(await response.text()); console.log(await response.text()); })'
~~~

The result must include openai/gpt-oss-20b.

Verify the Home Mac relay without displaying its token:

~~~
node --env-file=.env -e 'fetch(process.env.IMESSAGE_RELAY_URL + "/health", {headers: {authorization: "Bearer " + process.env.IMESSAGE_RELAY_TOKEN}}).then(async response => { if (!response.ok) throw new Error(await response.text()); console.log(await response.text()); })'
~~~

Expected result:

~~~
{"ok":true,"data":{"status":"ok"}}
~~~

Do not run the workflow until both requests succeed.

## 7. First safe real-model dry-run

This calls the real Work Mac model and creates a real local Markdown draft. It does not send iMessage or touch WordPress, and it uses a copied tracker.

~~~
$copy = Join-Path $env:TEMP "wp-blog-agent-first-run.xlsx"
Copy-Item manual-files\wordpress-blog-content-tracker.xlsx $copy
npm run once -- --dry-run --tracker $copy
~~~

Wait for completion or a confirmed error. Inspect the generated Markdown under data/drafts. The actual tracker stays pending because the test used a copy.

On the Work Mac, record the start time and stream the LM Studio logs before and during the request:

~~~
date '+%Y-%m-%dT%H:%M:%S%z'
lms server status
lms log stream --source server --json
~~~

In a second Work Mac terminal:

~~~
lms log stream --source model --filter input,output --json --stats
~~~

Do not stop either log stream early. Confirm the model completion reason and the saved Markdown artifact before proceeding.

## 8. First official run and approval

Only do this after the safe dry-run succeeded and the Home Mac relay is still running.

On Home Windows:

~~~
npm run once
~~~

The expected sequence is:

1. Windows claims one pending tracker row.
2. Work Mac generates the article with LM Studio.
3. Windows saves the Markdown under data/drafts.
4. Home Intel Mac sends the Markdown and approval instructions through Messages.
5. The tracker changes to awaiting_review.

Reply from the configured recipient with exactly one of the following, using the actual blog_id:

~~~
YES 1
NO 1
~~~

Then process the reply from Home Windows:

~~~
npm run once
~~~

YES creates a WordPress draft and stores the confirmed ID and URL in the tracker. NO records a rejection and creates no WordPress post.

## 9. Keep the Home Mac relay running

After the first full run works, make the Home Mac relay persistent:

~~~
cd ~/Developer/WP-blog-agent
cp docs/com.nolanyoung.wp-blog-agent.relay.plist.example ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.relay.plist
nano ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.relay.plist
~~~

Replace both ABSOLUTE/PATH/WP-blog-agent values. Replace /usr/local/bin/node with:

~~~
command -v node
~~~

Then load and inspect the service:

~~~
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nolanyoung.wp-blog-agent.relay.plist
launchctl print gui/$(id -u)/com.nolanyoung.wp-blog-agent.relay
~~~

Keep the Home Mac signed into Messages. The ignored .env in the repository supplies secrets; never put secrets in the plist.

## Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| Windows cannot reach Work Mac model API | Tailscale is connected; Work Mac local curl works; LM Studio server is running | Verify the Work Mac address, enable Serve on Local Network, enable LM Studio authentication, and accept the firewall prompt. |
| Windows cannot reach Home Mac relay | npm run relay is still running; token matches; Tailscale is connected | Check the relay terminal, then the Home Mac address and port 8787. Never make this a public service. |
| Relay does not send iMessage | Home Mac is signed into Messages and terminal permissions are granted | Restart the relay and run one official request to trigger and approve the macOS Automation prompt. |
| Reply is ignored | Reply is exact and from the configured recipient | Verify automatic date and time on Home Windows and Home Mac, then run npm run once again on Windows. |
| WordPress posting fails | Windows .env has valid HTTPS URL, user, and Application Password | Keep WORDPRESS_POST_STATUS=draft while correcting the credentials. |

## Ongoing operating rules

- Run npm run once only on Home Windows.
- Keep Work Mac LM Studio, Home Mac relay, and Tailscale connected during every run.
- Keep WORDPRESS_POST_STATUS=draft until you deliberately want publication.
- Add future topics only to the Windows tracker.
- Update a repository clone deliberately with git switch main followed by git pull --ff-only origin main.
- Never replace LM Studio with another model provider or expose either service port to the public internet.
