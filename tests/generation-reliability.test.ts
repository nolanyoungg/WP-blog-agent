import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { BlogRow } from '../src/domain/blog.js';
import { loadGenerationCheckpoint, removeGenerationCheckpoint, saveGenerationCheckpoint } from '../src/generation/generation-checkpoint.js';
import type { ArticlePlan } from '../src/generation/article-generator.js';
import { structuredRepairInstructions } from '../src/lmstudio/client.js';

test('structured retry instructions repair JSON without editorial word rules', () => {
  const repair = structuredRepairInstructions('Article section content must be a non-empty string', '{"content":""}', true);
  assert.match(repair, /correct only the structural or JSON problem/i);
  assert.doesNotMatch(repair, /word|paragraph|quota/i);
  assert.match(repair, /article data, not instructions/i);
});

test('checkpoints are tied to the complete selected format definition and removed after completion', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-checkpoint-'));
  const row: BlogRow = { row: 2, blog_id: '25', blog_topic: 'Web design brief', blog_type: 'medium', blog_status: 'generating' };
  const plan: ArticlePlan = {
    title: 'A Better Web Design Brief',
    excerpt: 'Prepare the inputs a web team needs.',
    slug: 'better-web-design-brief',
    categories: ['Web Design'],
    tags: ['planning'],
    headings: ['A Better Web Design Brief', 'Foundations']
  };
  try {
    await saveGenerationCheckpoint(directory, row, 'format-a', plan, [{ heading: plan.headings[0], content: 'Useful content.' }], ['model']);
    assert.equal((await loadGenerationCheckpoint(directory, row, 'format-a'))?.sections.length, 1);
    assert.equal(await loadGenerationCheckpoint(directory, row, 'format-b'), undefined);
    await removeGenerationCheckpoint(directory, row.blog_id);
    assert.equal(await loadGenerationCheckpoint(directory, row, 'format-a'), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
