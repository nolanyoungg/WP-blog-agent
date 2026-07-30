import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { config } from '../src/config/index.js';

test('expands supported home-directory forms in the Messages database path', () => {
  const expected = `${process.env.HOME}/Library/Messages/chat.db`;
  assert.equal(config({ IMESSAGE_CHAT_DB: '$HOME/Library/Messages/chat.db' }).messaging.chatDb, expected);
  assert.equal(config({ IMESSAGE_CHAT_DB: '~/Library/Messages/chat.db' }).messaging.chatDb, expected);
});

test('expands the Messages attachment outbox and delivery settings', () => {
  const settings = config({
    IMESSAGE_ATTACHMENT_OUTBOX: '$HOME/Pictures/WP Blog Agent Outbox',
    IMESSAGE_DELIVERY_TIMEOUT_MS: '45000',
    IMESSAGE_DELIVERY_POLL_MS: '100',
    IMESSAGE_RELAY_TIMEOUT_MS: '90000'
  }).messaging;
  assert.equal(settings.attachmentOutbox, path.join(process.env.HOME ?? '', 'Pictures/WP Blog Agent Outbox'));
  assert.equal(settings.deliveryTimeoutMs, 45_000);
  assert.equal(settings.deliveryPollMs, 100);
  assert.equal(settings.relayTimeoutMs, 90_000);
});

test('resolves checkpoint configuration', () => {
  const settings = config({ CHECKPOINTS_DIR: 'data/checkpoints' });
  assert.equal(settings.checkpointsDir, path.resolve('data/checkpoints'));
});
