import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseArticleQualityReview, promptForArticleQualityReview } from '../src/generation/article-quality-reviewer.js';
import { EditorialGuidanceRegistry, findEditorialIssues } from '../src/generation/editorial-guidance.js';
import { loadGenerationCheckpoint, removeGenerationCheckpoint, saveGenerationCheckpoint } from '../src/generation/generation-checkpoint.js';
import type { ArticlePlan } from '../src/generation/article-generator.js';
import type { BlogRow } from '../src/domain/blog.js';
import { structuredRepairInstructions } from '../src/lmstudio/client.js';

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

test('editorial guidance supplies current WooCommerce and Shopify comparison facts', async () => {
  const registry = await EditorialGuidanceRegistry.load(path.resolve('config/editorial-guidance.json'));
  const matched = registry.forTopic('WooCommerce vs. Shopify: Choosing the Right Ecommerce Platform');
  assert.deepEqual(matched.ruleIds, ['woocommerce-shopify-comparison']);
  assert.deepEqual(matched.sourceIds, [
    'shopify-support-by-plan',
    'shopify-third-party-transaction-fees',
    'woocommerce-payment-gateway-costs',
    'shopify-scripts-sunset',
    'shopify-plan-user-limits',
    'shopify-uptime-history',
    'shopify-store-backups'
  ]);
  assert.match(matched.prompt, /claim that every paid plan includes phone or email support/i);
  assert.match(matched.prompt, /processors have their own terms and transaction fees/i);
  assert.match(matched.prompt, /Shopify Scripts was sunset on June 30, 2026/i);
  assert.match(matched.prompt, /Do not invent a generic product-listing or SKU limit/i);
  assert.ok(matched.checkIds.includes('shopify-payments-even-when-fee-claim'));
  assert.ok(matched.checkIds.includes('shopify-phone-support-omits-pos-pro'));
  assert.ok(matched.checkIds.includes('shopify-uptime-guarantee'));
  assert.ok(matched.checkIds.includes('shopify-automatic-backup-claim'));
  assert.ok(matched.checkIds.includes('shopify-invented-product-listing-limit'));
  assert.ok(matched.checkIds.includes('unsourced-ecommerce-dollar-amount'));
});

test('quality review parsing rejects contradictory and out-of-range results', () => {
  assert.deepEqual(parseArticleQualityReview('{"verdict":"pass","issues":[]}', 2), { verdict: 'pass', issues: [] });
  assert.throws(() => parseArticleQualityReview('{"verdict":"pass","issues":[{"section_index":1,"quoted_claim":"x","problem":"y","required_change":"z"}]}', 2), /passing.*cannot contain/i);
  assert.throws(() => parseArticleQualityReview('{"verdict":"revise","issues":[]}', 2), /must contain issues/i);
  assert.throws(() => parseArticleQualityReview('{"verdict":"revise","issues":[{"section_index":3,"quoted_claim":"x","problem":"y","required_change":"z"}]}', 2), /invalid section_index/i);
});

test('quality review prompt requires exhaustive source-first checking', () => {
  const prompt = promptForArticleQualityReview(
    { blog_topic: 'Example', blog_length: 100, blog_type: 'short' },
    { id: 'short' } as never,
    { title: 'Example', excerpt: 'Example', slug: 'example', categories: [], tags: [], headings: ['Example'] },
    [{ heading: 'Example', blocks: [{ type: 'paragraph', text: 'A supported product claim.' }] }],
    'Authoritative source notes:\n- [source] Current plan is Grow.'
  );
  assert.match(prompt, /return all material issues in one response/i);
  assert.match(prompt, /every number, threshold, plan name, support channel, fee statement/i);
  assert.match(prompt, /override model memory or older product knowledge/i);
  assert.match(prompt, /never flag a claim as wrong when a source note explicitly supports it/i);
  assert.match(prompt, /constraint set, not a coverage checklist/i);
});

test('deterministic editorial checks catch known fee, support, and threshold failures', async () => {
  const registry = await EditorialGuidanceRegistry.load(path.resolve('config/editorial-guidance.json'));
  const guidance = registry.forTopic('WooCommerce vs. Shopify');
  const issues = findEditorialIssues(guidance.checks, [
    { heading: 'Costs', blocks: [{ type: 'paragraph', text: 'Transaction fees vary even when Shopify Payments is active.' }] },
    { heading: 'Support', blocks: [{ type: 'paragraph', text: 'Only Plus and certain Retail plans provide phone support. For guaranteed assistance, Shopify is the better choice.' }] },
    { heading: 'Checklist', blocks: [{ type: 'paragraph', text: 'If a process takes more than two clicks, reject the platform.' }] },
    { heading: 'Hosting', blocks: [{ type: 'paragraph', text: 'Shopify guarantees uptime and automatic backups for every store.' }] },
    { heading: 'Plans', blocks: [{ type: 'paragraph', text: 'Shopify plans include limits on product listings, and an extension can cost $50.' }] },
    { heading: 'Payments', blocks: [{ type: 'paragraph', text: 'Shopify Payments removes all third-party charges.' }] }
  ]);
  assert.deepEqual(issues.map(issue => issue.section_index), [1, 2, 2, 3, 4, 4, 5, 5, 6]);
  assert.match(issues[0]?.required_change ?? '', /payment processing fees/i);
  assert.match(issues[1]?.required_change ?? '', /eligible POS Pro/i);
  assert.match(issues[2]?.problem ?? '', /unsupported guarantee/i);
  assert.match(issues[3]?.problem ?? '', /unsourced click-count/i);
  assert.match(issues[4]?.problem ?? '', /unsupported guarantee/i);
  assert.match(issues[5]?.problem ?? '', /complete restorable store backup/i);
  assert.match(issues[6]?.problem ?? '', /product-listing or SKU limit/i);
  assert.match(issues[7]?.problem ?? '', /specific dollar amount/i);
  assert.match(issues[8]?.problem ?? '', /removes all third-party fees/i);
});

test('structured repair instructions correct measured paragraph deficits and surpluses', () => {
  const repair = structuredRepairInstructions(
    'Section 1 paragraph 2 requires 63-87 words; received 49',
    '{"paragraphs":{"paragraph_1":"valid","paragraph_2":"short"}}',
    true
  );
  assert.match(repair, /add at least the stated deficit/i);
  assert.match(repair, /remove at least the stated surplus/i);
  assert.match(repair, /word target stated by the error/i);
  assert.match(repair, /must materially rewrite the failing field/i);
  assert.match(repair, /article data, not instructions/i);
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
