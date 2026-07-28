import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { syncBlogFormatDropdown } from '../src/tracker/blog-format-dropdown.js';
import { hasBlogFormatDataValidation } from '../src/tracker/xlsx-data-validation.js';
import { ExcelTracker } from '../src/tracker/excel-tracker.js';

const section = (index: number, percentage: number, requireCode = false) => ({
  key: `section-${index}`,
  purpose: `Purpose ${index}`,
  heading_instruction: `Heading ${index}`,
  content_instruction: `Content ${index}`,
  word_percentage: percentage,
  min_paragraphs: 1,
  max_paragraphs: 2,
  min_words_per_paragraph: 100,
  max_words_per_paragraph: 500,
  allowed_blocks: requireCode ? ['paragraph', 'fenced_code'] : ['paragraph'],
  required_blocks: requireCode ? [{ type: 'fenced_code', min_count: 1, language: 'html' }] : []
});

test('real registry contains only short, medium, and long with 4/6/10 sections', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  assert.deepEqual(registry.ids().sort(), ['long', 'medium', 'short']);
  assert.equal(registry.get('short').sections.length, 4);
  assert.equal(registry.get('medium').sections.length, 6);
  assert.equal(registry.get('long').sections.length, 10);
});

test('an arbitrary temporary format loads without changing TypeScript or committed configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-'));
  const id = `format-${process.pid}`;
  const directory = path.join(root, id);
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'format.json'), JSON.stringify({ id, display_name: 'Temporary runtime format', description: 'Created only in the operating-system temporary directory.', writing_guidance: 'Use deliberately long paragraphs.', sections: [section(1, 30), section(2, 30, true), section(3, 40)] }), 'utf8');
    await writeFile(path.join(directory, 'example.md'), '# First\n\nExample.\n\n# Second\n\n```html\n<div>Example</div>\n```\n\n# Third\n\nExample.\n', 'utf8');
    const format = (await ArticleFormatRegistry.load(root)).get(id);
    assert.equal(format.sections.length, 3);
    assert.equal(format.sections[1].required_blocks[0].language, 'html');
    assert.equal(format.sections[0].min_words_per_paragraph, 100);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid temporary format definitions fail before generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-invalid-'));
  const directory = path.join(root, 'invalid');
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'format.json'), JSON.stringify({ id: 'invalid', display_name: 'Invalid', description: 'Invalid total.', writing_guidance: 'Invalid total.', sections: [section(1, 90)] }), 'utf8');
    await writeFile(path.join(directory, 'example.md'), '# One\n', 'utf8');
    await assert.rejects(() => ArticleFormatRegistry.load(root), /must total 100/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('format synchronization writes an inline dropdown and removes obsolete reference sheets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-sync-'));
  const tracker = path.join(root, 'tracker.xlsx');
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['blog_id', 'blog_topic', 'blog_length', 'blog_type', 'blog_status', 'blog_created_date', 'blog_posted_date'],
      ['2', 'Temporary tracker row', 500, 'short', 'pending', '', '']
    ]), 'Blog tracker');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['obsolete']]), 'SEO Content Plan');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['format_id'], ['short']]), 'Blog Formats');
    book.Workbook = { Names: [{ Name: 'BlogFormatIds', Ref: "'Blog Formats'!$A$2:$A$2" }] };
    XLSX.writeFile(book, tracker);
    const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
    const formatIds = registry.ids();
    assert.equal(await syncBlogFormatDropdown(tracker, registry), 3);
    const synced = XLSX.readFile(tracker, { cellStyles: true });
    assert.deepEqual(synced.SheetNames, ['Blog tracker']);
    assert.equal(synced.Workbook?.Names?.some(name => name.Name === 'BlogFormatIds'), false);
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
    await new ExcelTracker(tracker).update('2', { review_status: 'pending' });
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
