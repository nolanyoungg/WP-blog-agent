import { config } from '../config/index.js';
import { MacOSMessagesAdapter } from '../messaging/imessage.js';
import { startRelayServer } from '../messaging/relay-server.js';

const settings = config();
const relay = await startRelayServer({
  adapter: new MacOSMessagesAdapter(settings.messaging.recipient, settings.messaging.chatDb),
  token: settings.messaging.relayToken,
  host: settings.messaging.relayListenHost,
  port: settings.messaging.relayListenPort
});
process.stdout.write(`iMessage relay listening at ${relay.url}\n`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void relay.close().finally(() => process.exit(0)); });
