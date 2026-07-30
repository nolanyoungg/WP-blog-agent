import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { articleQualityReviewSchema, locateArticleQualityIssues, parseArticleQualityReview, promptForArticleQualityReview, qualityIssueKey, recordQualityIssueAttempts, repairActionForIssues } from '../src/generation/article-quality-reviewer.js';

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
  assert.match(prompt, /Return verdict "pass" only after the claim-by-claim and cross-section checks/);
  assert.match(prompt, /The repair writer, not you, will edit the article/);
  assert.match(prompt, /reuse its prior issue_id, section_index, and category/);
  assert.match(prompt, /Perform a claim-by-claim falsification pass/);
  assert.match(prompt, /Apply the same cross-section comparison to timings, ratios, breakpoints, scores, and other thresholds/);
  assert.match(prompt, /inventory every numeric threshold by subject across all sections/);
  assert.match(prompt, /No authoritative source packet was supplied with this article/);
  assert.match(prompt, /Do not repair one unsupported threshold by inventing an explanation that attributes it to WCAG, Material Design, Google/);
  assert.match(prompt, /flawlessly.*any device.*without compromise/);
  assert.match(prompt, /claims that a design approach itself causes loading, navigation, layout, or business outcomes/);
  assert.match(prompt, /above-the-fold placement presented as a universal requirement/);
  assert.match(prompt, /fixed experiment durations presented as proven thresholds/);
  assert.match(prompt, /Ordinary qualitative context, practical starting scopes, and suggested working sessions are not material defects/);
  assert.match(prompt, /never recommend another unsupported quantifier or arbitrary threshold as the fix/);
  assert.match(prompt, /Do not defer to a prior repair, prior verdict, or the article's confident tone/);
  assert.match(prompt, /a new multi-step audit, checklist, procedure, or body topic is a conclusion-quality problem/);
  assert.match(prompt, /do not stop after finding the first issue/);
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
  assert.equal(qualityIssueKey(parsed.repair_list[0]!), '2:unsupported_certainty:the outcome is not guaranteed');
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

test('quality issue attempts escalate through reinforced feedback and replacement before failing closed', () => {
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
  assert.deepEqual(first.issue_attempts, { '2:unsupported_certainty:the result is not guaranteed': 1 });
  assert.equal(repairActionForIssues(first.issue_attempts, [issue]), 'targeted');
  const second = recordQualityIssueAttempts(first.issue_attempts, [{ ...issue, quoted_text: 'will rank higher' }]);
  assert.equal(repairActionForIssues(second.issue_attempts, [issue]), 'reinforced');
  assert.deepEqual(second.stalled_keys, []);
  const third = recordQualityIssueAttempts(second.issue_attempts, [issue]);
  assert.equal(repairActionForIssues(third.issue_attempts, [issue]), 'replace');
  assert.deepEqual(third.stalled_keys, []);
  const fourth = recordQualityIssueAttempts(third.issue_attempts, [issue]);
  assert.deepEqual(fourth.stalled_keys, ['2:unsupported_certainty:the result is not guaranteed']);
  const distinct = recordQualityIssueAttempts(third.issue_attempts, [{ ...issue, issue_id: 'seo-2', problem: 'A different underlying problem.' }]);
  assert.equal(repairActionForIssues(distinct.issue_attempts, [{ ...issue, problem: 'A different underlying problem.' }]), 'targeted');
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

test('quality issue anchors tolerate Markdown presentation while remaining location-specific', () => {
  const review = parseArticleQualityReview(JSON.stringify({
    verdict: 'revise',
    repair_list: [{
      issue_id: 'breakpoint-range',
      section_index: 1,
      category: 'factual_accuracy',
      quoted_text: '"Responsive breakpoints that grow outward" – start with a mobile breakpoint',
      problem: 'The range is presented as a rule.',
      required_change: 'Present it as an example.',
      acceptance_condition: 'No universal breakpoint remains.'
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
    { heading: 'Mobile Design', content: '**Responsive breakpoints that grow outward** — start with a mobile breakpoint chosen for the content.' },
    { heading: 'Apply It', content: 'Measure the result.' }
  ]);
  assert.equal(located.repair_list[0]?.section_index, 1);
});

test('quality issue location keeps unique fuzzy current text and drops stale repair history', () => {
  const plan = {
    title: 'Mobile Design',
    excerpt: 'A practical guide.',
    slug: 'mobile-design',
    categories: ['Design'],
    tags: ['mobile'],
    headings: ['Understand It', 'Apply It']
  };
  const review = parseArticleQualityReview(JSON.stringify({
    verdict: 'revise',
    repair_list: [{
      issue_id: 'current-size',
      section_index: 1,
      category: 'requirements_vs_recommendations',
      quoted_text: 'Touch targets should be at least 44 by 44 px.',
      problem: 'The size is presented as a universal requirement.',
      required_change: 'Remove the unsupported threshold.',
      acceptance_condition: 'No universal size remains.'
    }, {
      issue_id: 'stale-copy',
      section_index: 1,
      category: 'unsupported_certainty',
      quoted_text: 'Visitors may leave before they learn what you offer.',
      problem: 'This old sentence was already repaired.',
      required_change: 'Qualify it.',
      acceptance_condition: 'The old outcome is qualified.'
    }]
  }), 2);
  const located = locateArticleQualityIssues(review, plan, [
    { heading: 'Understand It', content: 'It is recommended that touch targets be at least 44 by 44 px for this example.' },
    { heading: 'Apply It', content: 'Measure the result against the project baseline.' }
  ]);
  assert.deepEqual(located.repair_list.map(issue => issue.issue_id), ['current-size']);
  assert.equal(located.repair_list[0]?.section_index, 1);
});
