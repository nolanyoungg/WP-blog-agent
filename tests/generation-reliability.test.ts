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
    const quality = {
      phase: 'repairing' as const,
      review_round: 2,
      repair_list: [{
        issue_id: 'scope-1',
        section_index: 1,
        category: 'section_scope' as const,
        quoted_text: 'Useful content.',
        problem: 'The section drifts from its purpose.',
        required_change: 'Keep the section inside its purpose.',
        acceptance_condition: 'No unrelated material remains.'
      }],
      completed_repairs: [{
        review_round: 1,
        section_index: 1,
        action: 'targeted' as const,
        issues: [{
          issue_id: 'scope-1',
          section_index: 1,
          category: 'section_scope' as const,
          quoted_text: 'Earlier content.',
          problem: 'The section drifted from its purpose.',
          required_change: 'Keep the section inside its purpose.',
          acceptance_condition: 'No unrelated material remains.'
        }],
        model: 'configured-model',
        completed_at: '2026-07-30T14:00:00.000Z'
      }],
      issue_attempts: { '1:section_scope:the section drifted from its purpose': 2 },
      last_review: {
        verdict: 'revise' as const,
        repair_list: [{
          issue_id: 'scope-1',
          section_index: 1,
          category: 'section_scope' as const,
          quoted_text: 'Useful content.',
          problem: 'The section drifts from its purpose.',
          required_change: 'Keep the section inside its purpose.',
          acceptance_condition: 'No unrelated material remains.'
        }]
      }
    };
    const modelHistory = [
      { operation: 'write' as const, model: 'configured-model', section_index: 1, completed_at: '2026-07-30T13:00:00.000Z' },
      { operation: 'review' as const, model: 'configured-model', review_round: 2, completed_at: '2026-07-30T14:05:00.000Z' }
    ];
    await saveGenerationCheckpoint(directory, row, 'format-a', plan, [{ heading: plan.headings[0], content: 'Useful content.' }], modelHistory, quality);
    const saved = await loadGenerationCheckpoint(directory, row, 'format-a');
    assert.equal(saved?.sections.length, 1);
    assert.deepEqual(saved?.quality, quality);
    assert.deepEqual(saved?.model_history, modelHistory);
    assert.equal(await loadGenerationCheckpoint(directory, row, 'format-b'), undefined);
    await removeGenerationCheckpoint(directory, row.blog_id);
    assert.equal(await loadGenerationCheckpoint(directory, row, 'format-a'), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
