import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseArticleQualityReview } from '../src/generation/article-quality-reviewer.js';
import { EditorialGuidanceRegistry } from '../src/generation/editorial-guidance.js';
import { loadGenerationCheckpoint, removeGenerationCheckpoint, saveGenerationCheckpoint } from '../src/generation/generation-checkpoint.js';
import type { ArticlePlan } from '../src/generation/article-generator.js';
import type { BlogRow } from '../src/domain/blog.js';

test('editorial guidance supplies current GA4 definitions and universal safety constraints', async () => {
  const registry = await EditorialGuidanceRegistry.load(path.resolve('config/editorial-guidance.json'));
  const matched = registry.forTopic('Website Analytics for Small Businesses');
  assert.deepEqual(matched.ruleIds, ['google-analytics-4']);
  assert.deepEqual(matched.sourceIds, ['google-ga4-engagement', 'google-ga4-key-events', 'google-ga4-internal-traffic']);
  assert.match(matched.prompt, /sessions that were not engaged/i);
  assert.match(matched.prompt, /key event/i);
  assert.match(matched.prompt, /permanently changes incoming data/i);
  assert.match(matched.prompt, /arbitrary percentage/i);
});

test('quality review parsing rejects contradictory and out-of-range results', () => {
  assert.deepEqual(parseArticleQualityReview('{"verdict":"pass","issues":[]}', 2), { verdict: 'pass', issues: [] });
  assert.throws(() => parseArticleQualityReview('{"verdict":"pass","issues":[{"section_index":1,"quoted_claim":"x","problem":"y","required_change":"z"}]}', 2), /passing.*cannot contain/i);
  assert.throws(() => parseArticleQualityReview('{"verdict":"revise","issues":[]}', 2), /must contain issues/i);
  assert.throws(() => parseArticleQualityReview('{"verdict":"revise","issues":[{"section_index":3,"quoted_claim":"x","problem":"y","required_change":"z"}]}', 2), /invalid section_index/i);
});

test('generation checkpoints are isolated by row identity and removed after completion', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-checkpoint-'));
  const row: BlogRow = { row: 2, blog_id: '25', blog_topic: 'Web design brief', blog_length: 1100, blog_type: 'medium', blog_status: 'generating' };
  const plan: ArticlePlan = {
    title: 'A Better Web Design Brief',
    excerpt: 'Prepare the inputs a web team needs.',
    slug: 'better-web-design-brief',
    categories: ['Web Design'],
    tags: ['planning'],
    headings: ['A Better Web Design Brief', 'Foundations']
  };
  try {
    await saveGenerationCheckpoint(directory, row, plan, [{ heading: plan.headings[0], blocks: [{ type: 'paragraph', text: 'Saved section' }] }], ['openai/gpt-oss-20b']);
    const loaded = await loadGenerationCheckpoint(directory, row);
    assert.equal(loaded?.sections.length, 1);
    assert.deepEqual(loaded?.models, ['openai/gpt-oss-20b']);
    assert.equal(await loadGenerationCheckpoint(directory, { ...row, blog_topic: 'Changed topic' }), undefined);
    await removeGenerationCheckpoint(directory, row.blog_id);
    assert.equal(await loadGenerationCheckpoint(directory, row), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
