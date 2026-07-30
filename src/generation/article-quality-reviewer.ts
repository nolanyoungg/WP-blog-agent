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
): ArticleQualityReview => ({
  ...review,
  repair_list: review.repair_list.map(issue => {
    const locations: number[] = [];
    if (JSON.stringify(plan).includes(issue.quoted_text)) locations.push(0);
    sections.forEach((section, index) => {
      if (section.content.includes(issue.quoted_text)) locations.push(index + 1);
    });
    if (locations.includes(issue.section_index)) return issue;
    if (locations.length === 1) return { ...issue, section_index: locations[0]! };
    throw new Error(`Article quality repair ${issue.issue_id} quoted_text must identify one exact plan or section location`);
  })
});

const normalizedIssueQuote = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const qualityIssueKey = (issue: Pick<ArticleQualityIssue, 'section_index' | 'category' | 'quoted_text'>) =>
  `${issue.section_index}:${issue.category}:${normalizedIssueQuote(issue.quoted_text)}`;

export const recordQualityIssueAttempts = (
  current: Record<string, number>,
  issues: ArticleQualityIssue[]
) => {
  const issue_attempts = { ...current };
  for (const key of new Set(issues.map(qualityIssueKey))) issue_attempts[key] = (issue_attempts[key] ?? 0) + 1;
  return {
    issue_attempts,
    stalled_keys: [...new Set(issues.map(qualityIssueKey))].filter(key => issue_attempts[key]! >= 3)
  };
};

export const requiresCompleteReplacement = (
  issueAttempts: Record<string, number>,
  issues: ArticleQualityIssue[]
) => issues.some(issue => (issueAttempts[qualityIssueKey(issue)] ?? 0) >= 2);

export const promptForArticleQualityReview = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  sections: StructuredSection[]
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

When a precise or current claim cannot be established from the supplied article context, require it to be removed or rewritten as durable, appropriately qualified guidance. Never invent a source, citation, URL, statistic, or correction.

Create a repair item for every material problem. Use section_index 0 for title, excerpt, slug, categories, tags, or planned-heading problems; use the one-based section index for body-content problems. Quote the smallest exact text that identifies the problem. Make required_change concrete enough for a repair writer to execute, and make acceptance_condition specific enough for a later review to verify. Do not request arbitrary word counts, paragraph counts, lists, tables, or personal stylistic preferences.

Return verdict "pass" only when the article is publishable without any material factual, structural, clarity, or usefulness correction, and return an empty repair_list. Otherwise return verdict "revise" and a complete repair_list. The repair writer, not you, will edit the article.

Article plan:
${JSON.stringify(plan)}

Format section purposes:
${JSON.stringify(format.sections)}

Article sections:
${JSON.stringify(sections)}`;
