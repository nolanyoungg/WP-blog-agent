import test from 'node:test'; import assert from 'node:assert/strict'; import { mkdtemp, rm } from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import * as XLSX from 'xlsx';
import { ExcelTracker } from '../src/tracker/excel-tracker.js';
test('retries generation errors before pending rows and never regenerates posting errors with drafts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  const file = path.join(dir, 'tracker.xlsx');
  try {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['blog_id', 'blog_topic', 'blog_length', 'blog_type', 'blog_status', 'blog_created_date', 'blog_posted_date', 'markdown_path'],
      ['2', 'Local-first WordPress', 500, 'short', 'pending', '', '', ''],
      ['3', 'Retry generation', 1500, 'long', 'error', '', '', ''],
      ['4', 'Posting failed', 500, 'short', 'error', '', '', 'data/drafts/4.md']
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'Blog tracker');
    XLSX.writeFile(book, file);
    const tracker = new ExcelTracker(file);
    const formats = new Set(['short', 'long']);
    const retry = await tracker.claimNext(formats);
    assert.equal(retry?.blog_id, '3');
    await tracker.update('3', { blog_status: 'error', markdown_path: 'data/drafts/3.md' });
    const pending = await tracker.claimNext(formats);
    assert.equal(pending?.blog_id, '2');
    assert.equal(pending?.blog_length, 500);
    assert.equal(pending?.blog_type, 'short');
    await tracker.update('2', { markdown_path: 'data/drafts/2.md', blog_status: 'awaiting_review' });
    assert.equal(await tracker.claimNext(formats), undefined);
    const rows = await tracker.rows();
    assert.equal(rows[0].blog_status, 'awaiting_review');
    assert.equal(rows[0].markdown_path, 'data/drafts/2.md');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
