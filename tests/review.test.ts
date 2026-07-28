import test from 'node:test'; import assert from 'node:assert/strict';
import { macOSReviewAttachment, parseReview } from '../src/messaging/imessage.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('accepts only an exact review instruction', () => { assert.deepEqual(parseReview(' yes 2 '), { decision: 'approved', blogId: '2' }); assert.deepEqual(parseReview('NO abc-2'), { decision: 'rejected', blogId: 'abc-2' }); assert.equal(parseReview('YES 2 please'), undefined); assert.equal(parseReview('maybe YES 2'), undefined); });

test('uses a text attachment for Markdown review drafts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-review-'));
  try {
    const draft = path.join(dir, 'review.md');
    await writeFile(draft, '# Review\n');
    const attachment = await macOSReviewAttachment(draft);
    assert.equal(attachment, path.join(dir, 'review.txt'));
    assert.equal(await readFile(attachment, 'utf8'), '# Review\n');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
