import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseDraft, saveDraft } from '../src/generation/blog.js';

test('draft retains literal YAML front matter and exposes WordPress fields', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  try {
    const file = await saveDraft(dir, { row: 2, blog_id: '2', blog_topic: 'Theme development', blog_status: 'generating' }, '---\ntitle: "A Theme"\nexcerpt: "Useful"\nslug: "a-theme"\ncategories: [WordPress]\ntags: [themes, code]\n---\n\n# A Theme\n\nBody', 'openai/gpt-oss-20b');
    const draft = await parseDraft(file);
    assert.equal(draft.title, 'A Theme');
    assert.equal(draft.slug, 'a-theme');
    assert.deepEqual(draft.tags, ['themes', 'code']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('normalizes fenced YAML emitted by a model', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  try {
    const file = await saveDraft(dir, { row: 2, blog_id: '3', blog_topic: 'Child themes', blog_status: 'generating' }, '```yaml\ntitle: "Child Themes"\nexcerpt: "A safe customization guide."\nslug: "child-themes"\ncategories:\n  - WordPress\ntags:\n  - CSS\n  - PHP\n```\n\n# Child Themes\n\nArticle body.', 'openai/gpt-oss-20b');
    const draft = await parseDraft(file);
    assert.equal(draft.title, 'Child Themes');
    assert.equal(draft.excerpt, 'A safe customization guide.');
    assert.deepEqual(draft.categories, ['WordPress']);
    assert.deepEqual(draft.tags, ['CSS', 'PHP']);
    assert.doesNotMatch(draft.body, /```yaml/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
