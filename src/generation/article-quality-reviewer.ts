import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';
import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';

export const articleQualityCategories = [
  'factual_accuracy',
  'unsupported_certainty',
  'requirements_vs_recommendations',
  'section_scope',
  'repetition_or_contradiction',
  'practical_usefulness',
  'clarity_and_structure',
  'conclusion_quality'
] as const;

export type ArticleQualityCategory = typeof articleQualityCategories[number];

export interface ArticleQualityIssue {
  issue_id: string;
  section_index: number;
  category: ArticleQualityCategory;
  quoted_text: string;
  problem: string;
  required_change: string;
  acceptance_condition: string;
}

export interface ArticleQualityReview {
  verdict: 'pass' | 'revise';
  repair_list: ArticleQualityIssue[];
}

export type ArticleRepairAction = 'targeted' | 'reinforced' | 'replace';

export interface CompletedArticleRepair {
  review_round: number;
  section_index: number;
  action: ArticleRepairAction;
  issues: ArticleQualityIssue[];
  model: string;
  completed_at: string;
}

const qualityIssueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    issue_id: { type: 'string' },
    section_index: { type: 'integer' },
    category: { type: 'string', enum: articleQualityCategories },
    quoted_text: { type: 'string' },
    problem: { type: 'string' },
    required_change: { type: 'string' },
    acceptance_condition: { type: 'string' }
  },
  required: ['issue_id', 'section_index', 'category', 'quoted_text', 'problem', 'required_change', 'acceptance_condition']
};

export const articleQualityReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    repair_list: { type: 'array', items: qualityIssueSchema }
  },
  required: ['verdict', 'repair_list']
};

const text = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};

export const parseArticleQualityReview = (source: string, sectionCount: number): ArticleQualityReview => {
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch (error) { throw new Error(`LM Studio returned invalid article quality review JSON: ${String(error)}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Article quality review must be a JSON object');
  const value = raw as Record<string, unknown>;
  if (value.verdict !== 'pass' && value.verdict !== 'revise') throw new Error('Article quality review verdict must be pass or revise');
  if (!Array.isArray(value.repair_list)) throw new Error('Article quality review repair_list must be an array');
  const repair_list = value.repair_list.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Article quality repair ${index + 1} must be an object`);
    const issue = candidate as Record<string, unknown>;
    const section_index = Number(issue.section_index);
    if (!Number.isSafeInteger(section_index) || section_index < 0 || section_index > sectionCount) throw new Error(`Article quality repair ${index + 1} has invalid section_index`);
    const category = text(issue.category, `Article quality repair ${index + 1} category`);
    if (!articleQualityCategories.includes(category as ArticleQualityCategory)) throw new Error(`Article quality repair ${index + 1} has invalid category`);
    return {
      issue_id: text(issue.issue_id, `Article quality repair ${index + 1} issue_id`),
      section_index,
      category: category as ArticleQualityCategory,
      quoted_text: text(issue.quoted_text, `Article quality repair ${index + 1} quoted_text`),
      problem: text(issue.problem, `Article quality repair ${index + 1} problem`),
      required_change: text(issue.required_change, `Article quality repair ${index + 1} required_change`),
      acceptance_condition: text(issue.acceptance_condition, `Article quality repair ${index + 1} acceptance_condition`)
    };
  });
  if (new Set(repair_list.map(issue => issue.issue_id)).size !== repair_list.length) throw new Error('Article quality repair issue_id values must be unique');
  if (value.verdict === 'pass' && repair_list.length) throw new Error('A passing article quality review must have an empty repair_list');
  if (value.verdict === 'revise' && !repair_list.length) throw new Error('An article quality review requiring revision must include a repair_list');
  return { verdict: value.verdict, repair_list };
};

export const locateArticleQualityIssues = (
  review: ArticleQualityReview,
  plan: ArticlePlan,
  sections: StructuredSection[]
): ArticleQualityReview => {
  const repair_list = review.repair_list.flatMap(issue => {
    const locations: number[] = [];
    const normalizedQuote = normalizedAnchorText(issue.quoted_text);
    if (normalizedAnchorText(JSON.stringify(plan)).includes(normalizedQuote)) locations.push(0);
    sections.forEach((section, index) => {
      if (normalizedAnchorText(section.content).includes(normalizedQuote)) locations.push(index + 1);
    });
    if (locations.includes(issue.section_index)) return [issue];
    if (locations.length === 1) return [{ ...issue, section_index: locations[0]! }];

    const candidates = [
      { section_index: 0, content: JSON.stringify(plan) },
      ...sections.map((section, index) => ({ section_index: index + 1, content: section.content }))
    ].map(candidate => ({ ...candidate, score: anchorCoverage(normalizedQuote, normalizedAnchorText(candidate.content)) }))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    if (best && best.score >= 0.75 && (!second || best.score - second.score >= 0.1)) {
      return [{ ...issue, section_index: best.section_index }];
    }
    return [];
  });
  if (review.verdict === 'revise' && !repair_list.length) {
    throw new Error('Article quality review repair_list contains no problem text that still identifies a current plan or section location');
  }
  return { ...review, repair_list };
};

const normalizedAnchorText = (value: string) => value
  .normalize('NFKC')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`~#>|]/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const anchorCoverage = (normalizedQuote: string, normalizedLocation: string) => {
  const quoteTokens = [...new Set(normalizedQuote.split(' ').filter(token => token.length > 2))];
  if (quoteTokens.length < 3) return 0;
  const locationTokens = new Set(normalizedLocation.split(' '));
  return quoteTokens.filter(token => locationTokens.has(token)).length / quoteTokens.length;
};

const normalizedIssueProblem = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export const qualityIssueKey = (issue: Pick<ArticleQualityIssue, 'section_index' | 'category' | 'problem'>) =>
  `${issue.section_index}:${issue.category}:${normalizedIssueProblem(issue.problem)}`;

export const recordQualityIssueAttempts = (
  current: Record<string, number>,
  issues: ArticleQualityIssue[]
) => {
  const issue_attempts = { ...current };
  for (const key of new Set(issues.map(qualityIssueKey))) issue_attempts[key] = (issue_attempts[key] ?? 0) + 1;
  return {
    issue_attempts,
    stalled_keys: [...new Set(issues.map(qualityIssueKey))].filter(key => issue_attempts[key]! >= 4)
  };
};

export const repairActionForIssues = (
  issueAttempts: Record<string, number>,
  issues: ArticleQualityIssue[]
): ArticleRepairAction => {
  const attempts = Math.max(0, ...issues.map(issue => issueAttempts[qualityIssueKey(issue)] ?? 0));
  if (attempts >= 3) return 'replace';
  if (attempts >= 2) return 'reinforced';
  return 'targeted';
};

export const promptForArticleQualityReview = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  sections: StructuredSection[],
  completedRepairs: CompletedArticleRepair[] = []
) => `Act as the final senior factual and editorial reviewer for a WordPress article before it is shown to a human approver.

Topic: ${row.blog_topic}
Format: ${format.id} (${format.display_name})
Approximate target: ${format.target_words} words. Length is guidance only.
Intended tone: ${format.tone}
Reader expertise: ${format.expertise_level}

Review the complete assembled article, not each section in isolation. Inspect all of these dimensions:
- factual accuracy and whether current or precise claims are supportable from the supplied article context;
- unsupported certainty, guarantees, causal business outcomes, statistics, benchmarks, standards, product behavior, compliance, security, accessibility, SEO, cost, revenue, conversion, and performance claims;
- whether requirements, common recommendations, examples, and reader-chosen targets are clearly distinguished;
- adherence to each section's assigned purpose and separation from other sections;
- repetition, contradictions, duplicated headings or labels, and advice repeated across sections;
- practical usefulness, reasoning, constraints, tradeoffs, and actionable next steps;
- clarity, organization, professional tone, and suitability for the intended reader;
- whether the conclusion synthesizes and closes without introducing another body topic.

Perform a claim-by-claim falsification pass before deciding the verdict. A familiar, plausible, or commonly repeated statement is not automatically supported. Examine every sentence containing a number, standard, requirement, causal outcome, broad audience claim, or words such as "most," "typically," "automatically," "essential," "mandatory," "industry average," "ensures," "will," "flawlessly," "any device," or "without compromise." Require the article to distinguish standards and conformance levels from recommendations or examples.

Before deciding the verdict, inventory every numeric threshold by subject across all sections. Conflicting values for the same subject cannot pass merely because they use different units or each resembles a common guideline. No authoritative source packet was supplied with this article, so any named external standard, version, conformance level, vendor guideline, or numeric requirement must be removed or replaced with a direction to verify the current primary documentation. Do not repair one unsupported threshold by inventing an explanation that attributes it to WCAG, Material Design, Google, or another authority. Apply the same cross-section comparison to timings, ratios, breakpoints, scores, and other thresholds.

Do not assume that a design or implementation method itself guarantees performance, accessibility, compatibility, search visibility, engagement, conversion, or business advantage. Require separate measurement or validation where the outcome depends on execution, audience, market, configuration, or baseline. When a precise or current claim cannot be established from the supplied article context, require it to be removed or rewritten as durable, appropriately qualified guidance. Never invent a source, citation, URL, statistic, or correction.

Before returning pass, explicitly audit for unsupported claims about who or how many people use a device or channel; claims that a design approach itself causes loading, navigation, layout, or business outcomes; device widths presented as smallest, typical, or mandatory; breakpoints chosen only from popular device sizes; above-the-fold placement presented as a universal requirement; risk described as eliminated; and fixed experiment durations presented as proven thresholds without traffic or statistical context. These are material issues when they assert a fact, guarantee, or universal rule. Ordinary qualitative context, practical starting scopes, and suggested working sessions are not material defects merely because they use words such as "many" or propose a concrete next step.

Apply the assigned section purposes literally. In particular, when the final section is assigned to synthesize and close with one useful action, a new multi-step audit, checklist, procedure, or body topic is a conclusion-quality problem even if the material is otherwise useful.

Create a repair item for every material problem; do not stop after finding the first issue. Use section_index 0 for title, excerpt, slug, categories, tags, or planned-heading problems; use the one-based section index for body-content problems. Quote the smallest exact text that identifies the problem. Make required_change concrete enough for a repair writer to execute, and make acceptance_condition specific enough for a later review to verify. A suggested correction and its acceptance condition must themselves satisfy this review contract; never recommend another unsupported quantifier or arbitrary threshold as the fix. Do not request arbitrary word counts, paragraph counts, lists, tables, or personal stylistic preferences.

The completed-repair history below records issues already assigned to the repair writer. Verify every acceptance condition against the current complete article. If the same underlying problem remains, reuse its prior issue_id, section_index, and category even when the current problematic quote changed. Do not report a repaired issue merely because it appeared in the history.

Do not defer to a prior repair, prior verdict, or the article's confident tone. Return verdict "pass" only after the claim-by-claim and cross-section checks find no material factual, structural, clarity, or usefulness correction, and return an empty repair_list. Otherwise return verdict "revise" and a complete repair_list. The repair writer, not you, will edit the article.

Completed repair history:
${JSON.stringify(completedRepairs)}

Article plan:
${JSON.stringify(plan)}

Format section purposes:
${JSON.stringify(format.sections)}

Article sections:
${JSON.stringify(sections)}`;
