import { config } from '../config/index.js';
import { BlogWorkflow } from '../workflow/agent.js';
import { DryRunMessageAdapter, MacOSMessagesAdapter, RelayMessagesAdapter } from '../messaging/imessage.js';
const args = process.argv.slice(2); const command = args.find(a => !a.startsWith('--')) ?? 'once'; const dryRun = args.includes('--dry-run'); const trackerIndex = args.indexOf('--tracker'); const overrides: Record<string, string> = trackerIndex >= 0 && args[trackerIndex + 1] ? { TRACKER_PATH: args[trackerIndex + 1] } : {}; const settings = config(overrides);
const messages = dryRun || settings.messaging.adapter === 'dry-run' ? new DryRunMessageAdapter()
  : settings.messaging.adapter === 'macos' ? new MacOSMessagesAdapter(settings.messaging.recipient, settings.messaging.chatDb, settings.messaging.attachmentOutbox, settings.messaging.deliveryTimeoutMs, settings.messaging.deliveryPollMs)
    : settings.messaging.adapter === 'relay' ? new RelayMessagesAdapter(settings.messaging.relayUrl, settings.messaging.relayToken, settings.messaging.relayTimeoutMs)
      : (() => { throw new Error('IMESSAGE_ADAPTER must be macos, relay, or dry-run'); })();
const workflow = new BlogWorkflow(settings, messages, dryRun);
if (command === 'once') await workflow.processNext(); else if (command === 'worker') { for (;;) { try { await workflow.processNext(); } catch (error) { console.error(error); } await new Promise(resolve => setTimeout(resolve, settings.pollIntervalMs)); } } else throw new Error('Usage: wp-blog-agent <once|worker> [--dry-run] [--tracker path]');
