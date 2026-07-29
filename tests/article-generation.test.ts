import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticleSection } from '../src/generation/article-generator.js';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, type StructuredArticle } from '../src/generation/article-markdown-renderer.js';

test('generation uses the selected Markdown template and its format-owned target as guidance', async () => {
  const format = (await ArticleFormatRegistry.load(path.resolve('config/blog-formats'))).get('short');
  const row = { blog_topic: 'WordPress performance', blog_type: 'short' };
  const planPrompt = promptForArticlePlan(row, format);
  assert.match(planPrompt, /Approximate article length: 900 words/);
  assert.match(planPrompt, /# Explain the Central Idea/);
  assert.match(planPrompt, /writing guidance, not an exact quota/i);
  const schema = articlePlanResponseSchema(format) as any;
  assert.deepEqual(schema.properties.sections.required, ['section_1', 'section_2', 'section_3', 'section_4']);
  const plan = {
    title: 'Reliable WordPress Performance',
    excerpt: 'A practical explanation of dependable WordPress performance work.',
    slug: 'reliable-wordpress-performance',
    categories: ['WordPress'],
    tags: ['performance'],
    headings: ['Reliable WordPress Performance', 'Understand Performance', 'Improve the Site', 'Choose the Next Step']
  };
  assert.match(promptForArticleSection(row, format, plan, 1), /Aim for roughly 225 words in this section/);
  assert.match(promptForArticleSection(row, format, plan, 1), /guidance, not a pass\/fail quota/);
  assert.deepEqual(articleSectionResponseSchema.required, ['content']);
  assert.deepEqual(parseArticleSection('{"content":"A paragraph.\\n\\n- A useful item"}'), { content: 'A paragraph.\n\n- A useful item' });
});

test('final Markdown preserves the template section count without policing words or paragraphs', async () => {
  const format = (await ArticleFormatRegistry.load(path.resolve('config/blog-formats'))).get('short');
  const article: StructuredArticle = {
    title: 'Reliable WordPress Performance',
    excerpt: 'A useful article.',
    slug: 'reliable-wordpress-performance',
    categories: ['WordPress'],
    tags: ['performance'],
    sections: [
      { heading: 'Reliable WordPress Performance', content: 'A brief opening.' },
      { heading: 'Understand Performance', content: 'This section is intentionally concise.\n\nA second natural paragraph.' },
      { heading: 'Improve the Site', content: '- Measure first\n- Change one thing\n- Review the result' },
      { heading: 'Choose the Next Step', content: '# Injected heading\n\nChoose the Next Step\n\nFinish with the most useful next action.' }
    ]
  };
  const markdown = renderAndValidateArticle(format, article);
  assert.equal((markdown.match(/^#\s+.+$/gm) ?? []).length, 4);
  assert.doesNotMatch(markdown, /^# Injected heading$/m);
  assert.doesNotMatch(markdown, /^Choose the Next Step$/m);
  assert.match(markdown, /- Measure first/);
});

test('plan parsing and draft saving remain structured plumbing', async () => {
  const format = (await ArticleFormatRegistry.load(path.resolve('config/blog-formats'))).get('short');
  const keyedPlan = {
    title: 'A Clear Title',
    excerpt: 'Useful excerpt',
    slug: 'clear-title',
    categories: ['WordPress'],
    tags: ['planning'],
    sections: Object.fromEntries(format.sections.map((section, index) => [section.key, { heading: `Heading ${index + 1}` }]))
  };
  const plan = parseArticlePlan(JSON.stringify(keyedPlan), format);
  assert.equal(plan.headings.length, 4);
  const article: StructuredArticle = { ...plan, sections: plan.headings.map(heading => ({ heading, content: 'Useful body content.' })) };
  const markdown = renderAndValidateArticle(format, article);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-draft-'));
  try {
    const file = await saveDraft(dir, { row: 2, blog_id: '2', blog_topic: 'A topic', blog_type: 'short', blog_status: 'generating' }, format, markdown, 'model');
    assert.match(await readFile(file, 'utf8'), /target_words: "900"/);
    assert.equal((await parseDraft(file)).title, 'A Clear Title');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
