import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.js';
import { DryRunMessageAdapter } from '../src/messaging/imessage.js';
import { BlogWorkflow } from '../src/workflow/agent.js';
import type { BlogRow } from '../src/types.js';

test('only accepts a reply sent after its review request', () => {
  const workflow = new BlogWorkflow(config({ TRACKER_PATH: 'tests/fixtures/unused.xlsx', IMESSAGE_RECIPIENT: '+15555550123' }), new DryRunMessageAdapter(), true) as unknown as { replyIsCurrent(row: BlogRow, receivedAt: string): boolean };
  const row: BlogRow = { row: 2, blog_id: '1', blog_topic: 'Topic', blog_status: 'awaiting_review', blog_created_date: '2026-07-24T15:00:00.000Z' };
  assert.equal(workflow.replyIsCurrent(row, '2026-07-24T14:59:59.999Z'), false);
  assert.equal(workflow.replyIsCurrent(row, '2026-07-24T15:00:00.000Z'), true);
  assert.equal(workflow.replyIsCurrent(row, '2026-07-24T15:00:01.000Z'), true);
  assert.equal(workflow.replyIsCurrent({ ...row, blog_created_date: '' }, '2026-07-24T15:00:01.000Z'), false);
});
