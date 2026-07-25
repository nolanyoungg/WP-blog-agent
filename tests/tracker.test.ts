import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtemp, rm } from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import * as XLSX from 'xlsx';
import { assertTransition, ExcelTracker } from '../src/tracker/excel.js';
test('claims only one pending tracker row and adds operational columns', async () => { const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-')); const file = path.join(dir, 'tracker.xlsx'); try { const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([['blog_id', 'blog_topic', 'blog_status', 'blog_created_date', 'blog_posted_date'], ['2', 'Local-first WordPress', 'pending', '', ''], ['3', 'Already waiting', 'awaiting_review', '', '']]); XLSX.utils.book_append_sheet(book, sheet, 'Blog tracker'); XLSX.writeFile(book, file); const tracker = new ExcelTracker(file); const row = await tracker.claimNext(); assert.equal(row?.blog_id, '2'); assert.equal((await tracker.claimNext()), undefined); await tracker.update('2', { markdown_path: 'data/drafts/2.md', blog_status: 'awaiting_review' }); const rows = await tracker.rows(); assert.equal(rows[0].blog_status, 'awaiting_review'); assert.equal(rows[0].markdown_path, 'data/drafts/2.md'); } finally { await rm(dir, { recursive: true, force: true }); } });

test('allows only legal blocked review delivery transitions', () => {
  assert.doesNotThrow(() => assertTransition('generating', 'blocked_review_delivery'));
  assert.doesNotThrow(() => assertTransition('blocked_review_delivery', 'awaiting_review'));
  assert.doesNotThrow(() => assertTransition('blocked_review_delivery', 'error'));
  assert.throws(() => assertTransition('blocked_review_delivery', 'posted'), /Invalid tracker transition/);
  assert.throws(() => assertTransition('awaiting_review', 'generating'), /Invalid tracker transition/);
});
