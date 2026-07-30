import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticlePlanRepair, promptForArticleSection, promptForArticleSectionRepair } from '../src/generation/article-generator.js';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, type StructuredArticle } from '../src/generation/article-markdown-renderer.js';

test('generation uses the selected JSON format and its editorial fields only as guidance', async () => {
  const format = (await ArticleFormatRegistry.load(path.resolve('config/blog-formats'))).get('short');
  const row = { blog_topic: 'WordPress performance', blog_type: 'short' };
  const planPrompt = promptForArticlePlan(row, format);
  assert.match(planPrompt, /Approximate article length: 900 words/);
  assert.match(planPrompt, /Explain the Central Idea/);
  assert.match(planPrompt, /Tone: Clear, confident, useful, and conversational/);
  assert.match(planPrompt, /Reader expertise level:/);
  assert.match(planPrompt, /Conclusion guidance:/);
  assert.match(planPrompt, /invented guarantees, benchmarks, or performance targets/);
  assert.match(planPrompt, /writing guidance, not an exact quota/i);
  assert.match(planPrompt, /Plan a distinct, non-overlapping scope for every section/);
  assert.match(planPrompt, /heading must signal synthesis or a next step, not another body topic/);
  assert.match(planPrompt, /Do not promise or imply guaranteed SEO rankings, traffic, revenue, conversions, savings, security, compliance, accessibility, or performance outcomes/);
  assert.match(planPrompt, /Distinguish an official requirement from a common recommendation, heuristic, example, or reader-chosen target/);
  assert.match(planPrompt, /Do not infer audience behavior, device usage, market prevalence, or business importance from the article topic/);
  assert.match(planPrompt, /Do not use universal wording such as "flawlessly," "on any device," "for all users," or "without compromise"/);
  assert.match(planPrompt, /No authoritative source packet is supplied to this call/);
  assert.match(planPrompt, /Do not say a design or implementation approach automatically produces performance, accessibility, compatibility, search visibility, engagement, or conversion benefits/);
  assert.match(planPrompt, /Do not claim that desktop-first, mobile-first, responsive design, progressive enhancement, or another approach inherently causes slow loading/);
  assert.match(planPrompt, /Do not present one device width as the smallest or typical viewport/);
  assert.match(planPrompt, /present above-the-fold placement as a universal requirement/);
  assert.match(planPrompt, /prescribe a fixed experiment duration as a proven threshold/);
  assert.match(planPrompt, /Do not give conflicting thresholds for the same concept/);
  const schema = articlePlanResponseSchema(format) as any;
  assert.deepEqual(schema.properties.sections.required, ['introduction', 'central_idea', 'practical_action', 'next_step']);
  const plan = {
    title: 'Reliable WordPress Performance',
    excerpt: 'A practical explanation of dependable WordPress performance work.',
    slug: 'reliable-wordpress-performance',
    categories: ['WordPress'],
    tags: ['performance'],
    headings: ['Reliable WordPress Performance', 'Understand Performance', 'Improve the Site', 'Choose the Next Step']
  };
  const sectionPrompt = promptForArticleSection(row, format, plan, 1);
  assert.match(sectionPrompt, /Aim for roughly 225 words in this section/);
  assert.match(sectionPrompt, /guidance, not a pass\/fail quota/);
  assert.match(sectionPrompt, /Rendered heading: Improve the Site\s+Format purpose: Give practical steps, examples, recommendations/);
  assert.match(sectionPrompt, /This call owns only the current section/);
  assert.match(sectionPrompt, /Do not include the article title, the rendered section heading, another section heading/);
  assert.match(sectionPrompt, /do not manufacture numeric thresholds or universal success figures/);
  assert.match(sectionPrompt, /evaluate against their own baseline/);
  assert.match(sectionPrompt, /If a precise claim cannot be supported from the supplied article context, omit it or replace it/);
  assert.doesNotMatch(sectionPrompt, /This is the final section/);
  assert.match(promptForArticleSection(row, format, plan, 3), /This is the final section\. Synthesize the article and give one useful next action/);
  assert.match(promptForArticleSection(row, format, plan, 3), /Do not introduce another detailed checklist, procedure, or new body topic/);
  assert.deepEqual(articleSectionResponseSchema.required, ['content']);
  assert.deepEqual(parseArticleSection('{"content":"A paragraph.\\n\\n- A useful item"}'), { content: 'A paragraph.\n\n- A useful item' });

  const repairPrompt = promptForArticleSectionRepair(row, format, plan, 1, 'This guarantees higher rankings.', [{
    issue_id: 'seo-certainty',
    section_index: 2,
    category: 'unsupported_certainty',
    quoted_text: 'guarantees higher rankings',
    problem: 'The outcome is presented as guaranteed.',
    required_change: 'Explain that search visibility depends on multiple factors.',
    acceptance_condition: 'The repaired section makes no guaranteed ranking claim.'
  }]);
  assert.match(repairPrompt, /Mandatory reviewer repair list/);
  assert.match(repairPrompt, /Repair ID: seo-certainty/);
  assert.match(repairPrompt, /preserve accurate, useful material/i);
  assert.match(promptForArticleSectionRepair(row, format, plan, 1, 'Bad section.', [{
    issue_id: 'seo-certainty',
    section_index: 2,
    category: 'unsupported_certainty',
    quoted_text: 'Bad section.',
    problem: 'The issue survived repair.',
    required_change: 'Replace the unsupported claim.',
    acceptance_condition: 'No unsupported claim remains.'
  }], 'replace'), /Replace the section body completely/);
  assert.match(promptForArticleSectionRepair(row, format, plan, 1, 'Bad section.', [{
    issue_id: 'seo-certainty',
    section_index: 2,
    category: 'unsupported_certainty',
    quoted_text: 'Bad section.',
    problem: 'The issue survived repair.',
    required_change: 'Replace the unsupported claim.',
    acceptance_condition: 'No unsupported claim remains.'
  }], 'reinforced'), /materially stronger correction/);
  assert.match(promptForArticleSectionRepair(row, format, plan, 1, 'Bad section.', [{
    issue_id: 'audience-claim',
    section_index: 2,
    category: 'unsupported_certainty',
    quoted_text: 'Most visitors use phones.',
    problem: 'The audience distribution is unsupported.',
    required_change: 'Qualify the claim.',
    acceptance_condition: 'Use many or often instead.'
  }]), /remove the distribution claim or replace it with a reader-specific analytics or testing decision/);

  const planRepairPrompt = promptForArticlePlanRepair(row, format, plan, [{
    issue_id: 'excerpt-1',
    section_index: 0,
    category: 'unsupported_certainty',
    quoted_text: 'dependable WordPress performance',
    problem: 'The excerpt promises an outcome without context.',
    required_change: 'Describe the article guidance without promising an outcome.',
    acceptance_condition: 'The excerpt contains no unsupported outcome claim.'
  }]);
  assert.match(planRepairPrompt, /Mandatory reviewer repair list for the article plan/);
  assert.match(planRepairPrompt, /exactly these keys in order: introduction, central_idea, practical_action, next_step/);
});

test('final Markdown preserves the format section count without policing editorial guidance, words, or paragraphs', async () => {
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
      { heading: 'Choose the Next Step', content: '# Injected heading\n\nChoose the Next Step\n\nA deliberately abrupt ending that ignores the conclusion guidance.' }
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
