import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';

test('expands supported home-directory forms in the Messages database path', () => {
  const expected = `${process.env.HOME}/Library/Messages/chat.db`;
  assert.equal(config({ IMESSAGE_CHAT_DB: '$HOME/Library/Messages/chat.db' }).messaging.chatDb, expected);
  assert.equal(config({ IMESSAGE_CHAT_DB: '~/Library/Messages/chat.db' }).messaging.chatDb, expected);
});
