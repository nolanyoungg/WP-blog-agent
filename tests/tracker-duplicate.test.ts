import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { ExcelTracker } from '../src/tracker/excel-tracker.js';

test('refuses duplicate blog IDs before selecting a row', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  const file = path.join(dir, 'tracker.xlsx');
  try {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['blog_id', 'blog_topic', 'blog_type', 'blog_status', 'blog_created_date', 'blog_posted_date'], ['1', 'First', 'short', 'pending', '', ''], ['1', 'Second', 'short', 'pending', '', '']]);
    XLSX.utils.book_append_sheet(book, sheet, 'Blog tracker');
    XLSX.writeFile(book, file);
    await assert.rejects(new ExcelTracker(file).rows(), /duplicate blog_id: 1/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
