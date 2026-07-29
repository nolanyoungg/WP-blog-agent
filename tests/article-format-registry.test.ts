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

test('real formats own their targets, editorial guidance, and ordered JSON sections', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  assert.deepEqual(registry.ids().sort(), ['how-to', 'long', 'medium', 'practical-guidance', 'short']);
  assert.deepEqual(
    registry.list().map(format => [format.id, format.target_words, format.sections.length]).sort(),
    [['how-to', 1400, 9], ['long', 1500, 10], ['medium', 1100, 6], ['practical-guidance', 1100, 8], ['short', 900, 4]]
  );
  assert.equal(registry.get('short').sections[0].key, 'introduction');
  assert.match(registry.get('how-to').tone, /practical/i);
  assert.match(registry.get('practical-guidance').conclusion_guidance, /next step/i);
});

test('an arbitrary JSON format becomes the runtime guidance and structure', async () => {
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
      writing_guidance: 'Keep the comparison direct.',
      tone: 'Candid and useful.',
      expertise_level: 'General reader.',
      conclusion_guidance: 'Help the reader choose.',
      avoid: ['filler'],
      sections: [
        { key: 'opening', heading_example: 'Opening', content_instruction: 'Introduce the choice.' },
        { key: 'comparison', heading_example: 'Comparison', content_instruction: 'Compare the options in a table when useful.' }
      ]
    }), 'utf8');
    const format = (await ArticleFormatRegistry.load(root)).get(id);
    assert.equal(format.target_words, 700);
    assert.deepEqual(format.sections.map(section => section.heading_example), ['Opening', 'Comparison']);
    assert.match(format.sections[1].content_instruction, /table when useful/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid format metadata or an empty JSON section fails before generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-format-invalid-'));
  const directory = path.join(root, 'invalid');
  try {
    await mkdir(directory);
    await writeFile(path.join(directory, 'format.json'), JSON.stringify({
      id: 'invalid',
      display_name: 'Invalid',
      description: 'Invalid.',
      target_words: 0,
      writing_guidance: 'Invalid.',
      tone: 'Invalid.',
      expertise_level: 'Invalid.',
      conclusion_guidance: 'Invalid.',
      avoid: ['invalid'],
      sections: []
    }), 'utf8');
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
    assert.equal(await syncBlogFormatDropdown(tracker, registry), 5);
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
    await new ExcelTracker(tracker).update('2', { review_status: 'pending' });
    assert.equal(await hasBlogFormatDataValidation(tracker, formatIds), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
