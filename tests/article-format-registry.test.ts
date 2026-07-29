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

test('real formats own their target lengths and Markdown template sections', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  assert.deepEqual(registry.ids().sort(), ['long', 'medium', 'short']);
  assert.deepEqual(
    registry.list().map(format => [format.id, format.target_words, format.sections.length]).sort(),
    [['long', 1500, 10], ['medium', 1100, 6], ['short', 900, 4]]
  );
  assert.match(registry.get('short').template_markdown, /^# Clear Article Title/m);
});

test('an arbitrary Markdown template becomes the runtime structure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-'));
  const id = `format-${process.pid}`;
  const directory = path.join(root, id);
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'format.json'), JSON.stringify({
      id,
      display_name: 'Temporary comparison',
      description: 'A temporary template.',
      target_words: 700,
      writing_guidance: 'Keep the comparison direct.'
    }), 'utf8');
    await writeFile(path.join(directory, 'example.md'), '# Opening\n\nIntroduce the choice.\n\n# Comparison\n\nCompare the options in a table when useful.\n', 'utf8');
    const format = (await ArticleFormatRegistry.load(root)).get(id);
    assert.equal(format.target_words, 700);
    assert.deepEqual(format.sections.map(section => section.heading_example), ['Opening', 'Comparison']);
    assert.match(format.sections[1].content_instruction, /table when useful/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid format metadata or an empty template section fails before generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-invalid-'));
  const directory = path.join(root, 'invalid');
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'format.json'), JSON.stringify({ id: 'invalid', display_name: 'Invalid', description: 'Invalid.', target_words: 0, writing_guidance: 'Invalid.' }), 'utf8');
    await writeFile(path.join(directory, 'example.md'), '# One\n\n', 'utf8');
    await assert.rejects(() => ArticleFormatRegistry.load(root), /target_words must be a positive whole number/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('format synchronization writes the discovered IDs into the blog_type dropdown', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-sync-'));
  const tracker = path.join(root, 'tracker.xlsx');
  try {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['blog_id', 'blog_topic', 'blog_type', 'blog_status', 'blog_created_date', 'blog_posted_date'],
      ['2', 'Temporary tracker row', 'short', 'pending', '', '']
    ]), 'Blog tracker');
    XLSX.writeFile(book, tracker);
    const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
    const formatIds = registry.ids();
    assert.equal(await syncBlogFormatDropdown(tracker, registry), 3);
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
    await new ExcelTracker(tracker).update('2', { review_status: 'pending' });
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
