import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RelayMessagesAdapter } from '../src/messaging/imessage.js';
import { startRelayServer } from '../src/messaging/relay-server.js';
import type { Message, MessageAdapter } from '../src/messaging/types.js';

class RecordingMessagesAdapter implements MessageAdapter {
  readonly sent: Array<{ text: string; attachment?: string }> = [];
  replies: Message[] = [];
  attachmentContents = '';
  async send(text: string, attachment?: string) { this.sent.push({ text, attachment }); if (attachment) this.attachmentContents = await readFile(attachment, 'utf8'); }
  async latestReplies() { return this.replies; }
}

test('relay transports an attachment and current iMessage replies with bearer authentication', async () => {
  const messages = new RecordingMessagesAdapter();
  messages.replies = [{ text: 'YES 1', sender: '+15185550123', receivedAt: '2026-07-25T12:00:00.000Z' }];
  const relay = await startRelayServer({ adapter: messages, token: 'test-token', port: 0 });
  const directory = await mkdtemp(join(tmpdir(), 'wp-blog-agent-relay-test-'));
  const draft = join(directory, 'draft.md');
  await writeFile(draft, '# Draft\n');
  try {
    const client = new RelayMessagesAdapter(relay.url, 'test-token', 1_000);
    await client.send('Review this draft', draft);
    assert.deepEqual(messages.sent.map(({ text }) => text), ['Review this draft']);
    assert.equal(messages.attachmentContents, '# Draft\n');
    await assert.rejects(readFile(messages.sent[0].attachment!));
    assert.deepEqual(await client.latestReplies(), messages.replies);
    const denied = await fetch(`${relay.url}/v1/replies`);
    assert.equal(denied.status, 401);
  } finally { await relay.close(); await rm(directory, { recursive: true, force: true }); }
});
