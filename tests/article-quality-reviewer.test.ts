import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { articleQualityReviewSchema, locateArticleQualityIssues, parseArticleQualityReview, promptForArticleQualityReview, qualityIssueKey, recordQualityIssueAttempts, requiresCompleteReplacement } from '../src/generation/article-quality-reviewer.js';

test('quality reviewer inspects the complete article and owns the repair list', async () => {
  const format = (await ArticleFormatRegistry.load(path.resolve('config/blog-formats'))).get('short');
  const plan = {
    title: 'A Useful Mobile Website',
    excerpt: 'Practical mobile website guidance.',
    slug: 'useful-mobile-website',
    categories: ['Web Design'],
    tags: ['mobile'],
    headings: ['A Useful Mobile Website', 'Understand the Approach', 'Apply It', 'Take the Next Step']
  };
  const sections = plan.headings.map(heading => ({ heading, content: 'Useful section content.' }));
  const prompt = promptForArticleQualityReview({ blog_topic: 'Mobile web design', blog_type: 'short' }, format, plan, sections);
  assert.match(prompt, /Review the complete assembled article/);
  assert.match(prompt, /requirements, common recommendations, examples, and reader-chosen targets/);
  assert.match(prompt, /Use section_index 0 for title, excerpt, slug, categories, tags, or planned-heading problems/);
  assert.match(prompt, /Return verdict "pass" only when the article is publishable/);
  assert.match(prompt, /The repair writer, not you, will edit the article/);
  assert.deepEqual(articleQualityReviewSchema.required, ['verdict', 'repair_list']);
});

test('quality review parser requires an empty repair list only for pass', () => {
  assert.deepEqual(parseArticleQualityReview('{"verdict":"pass","repair_list":[]}', 4), { verdict: 'pass', repair_list: [] });
  const repair = {
    verdict: 'revise',
    repair_list: [{
      issue_id: 'seo-1',
      section_index: 2,
      category: 'unsupported_certainty',
      quoted_text: 'guarantees higher rankings',
      problem: 'The outcome is not guaranteed.',
      required_change: 'Qualify the outcome and explain its dependencies.',
      acceptance_condition: 'No guaranteed ranking outcome remains.'
    }]
  };
  const parsed = parseArticleQualityReview(JSON.stringify(repair), 4);
  assert.deepEqual(parsed, repair);
  assert.equal(qualityIssueKey(parsed.repair_list[0]!), '2:unsupported_certainty:guarantees higher rankings');
  assert.throws(() => parseArticleQualityReview(JSON.stringify({ ...repair, verdict: 'pass' }), 4), /passing.*empty repair_list/i);
  assert.throws(() => parseArticleQualityReview('{"verdict":"revise","repair_list":[]}', 4), /requiring revision.*repair_list/i);
  assert.throws(() => parseArticleQualityReview(JSON.stringify({
    verdict: 'revise',
    repair_list: [repair.repair_list[0], repair.repair_list[0]]
  }), 4), /issue_id values must be unique/i);
  assert.equal(parseArticleQualityReview(JSON.stringify({
    verdict: 'revise',
    repair_list: [{ ...repair.repair_list[0], issue_id: 'metadata-1', section_index: 0 }]
  }), 4).repair_list[0]?.section_index, 0);
});

test('quality issue attempts escalate from targeted repair to replacement and then fail closed', () => {
  const issue = {
    issue_id: 'seo-1',
    section_index: 2,
    category: 'unsupported_certainty' as const,
    quoted_text: 'guarantees higher rankings',
    problem: 'The result is not guaranteed.',
    required_change: 'Qualify the outcome.',
    acceptance_condition: 'No guarantee remains.'
  };
  const first = recordQualityIssueAttempts({}, [issue, { ...issue, issue_id: 'seo-2' }]);
  assert.deepEqual(first.issue_attempts, { '2:unsupported_certainty:guarantees higher rankings': 1 });
  assert.equal(requiresCompleteReplacement(first.issue_attempts, [issue]), false);
  const second = recordQualityIssueAttempts(first.issue_attempts, [issue]);
  assert.equal(requiresCompleteReplacement(second.issue_attempts, [issue]), true);
  assert.deepEqual(second.stalled_keys, []);
  const third = recordQualityIssueAttempts(second.issue_attempts, [issue]);
  assert.deepEqual(third.stalled_keys, ['2:unsupported_certainty:guarantees higher rankings']);
});

test('quality issues are repaired at the exact location of their quoted text', () => {
  const review = parseArticleQualityReview(JSON.stringify({
    verdict: 'revise',
    repair_list: [{
      issue_id: 'mobile-stat',
      section_index: 0,
      category: 'factual_accuracy',
      quoted_text: 'often more than 50% in many markets',
      problem: 'The statistic lacks context.',
      required_change: 'Remove the unsupported percentage.',
      acceptance_condition: 'No unsupported percentage remains.'
    }]
  }), 2);
  const located = locateArticleQualityIssues(review, {
    title: 'Mobile Design',
    excerpt: 'A practical guide.',
    slug: 'mobile-design',
    categories: ['Design'],
    tags: ['mobile'],
    headings: ['Mobile Design', 'Apply It']
  }, [
    { heading: 'Mobile Design', content: 'Mobile traffic is often more than 50% in many markets.' },
    { heading: 'Apply It', content: 'Measure your own audience.' }
  ]);
  assert.equal(located.repair_list[0]?.section_index, 1);
});
