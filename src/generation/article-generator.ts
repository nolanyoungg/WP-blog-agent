import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';
import type { StructuredArticle, StructuredSection } from './article-markdown-renderer.js';
import type { ArticleQualityIssue, ArticleRepairAction } from './article-quality-reviewer.js';
import { validatePlanAssignment } from './article-assignment.js';
import { prohibitedPromotionalLanguageGuidance } from './editorial-policy.js';

export interface ArticlePlan extends Omit<StructuredArticle, 'sections'> {
  headings: string[];
}

export const factualQualityContract = `Factual and editorial quality requirements:
- Do not invent sources, statistics, outcomes, product behavior, legal requirements, standards, or performance targets.
- No authoritative source packet is supplied. For changing standards, versions, vendor requirements, or availability, state only durable capabilities or direct the reader to current primary documentation.
- Do not guarantee rankings, traffic, revenue, conversions, savings, security, compliance, accessibility, compatibility, or performance. Name the conditions that control an outcome.
- A comparison needs the mechanism or decision input that makes it true. Do not call an approach inherently best, ideal, perfect, unmatched, cleaner, faster, cheaper, easier, or more scalable.
- Distinguish requirements from recommendations, heuristics, examples, and reader-chosen targets.
- Use a numeric threshold only when it is stable and necessary; otherwise use the reader's evidence, baseline, content behavior, or current primary documentation.
- Give practical advice with its reasoning and relevant tradeoffs. Do not turn a reasonable option into a universal rule.
- If a precise claim is unsupported by the supplied context, omit it or qualify it accurately.

${prohibitedPromotionalLanguageGuidance}`;

const repairGuardrails = `Repair guardrails:
- Make only the listed material corrections and preserve sound unrelated content.
- Preserve the tracker topic, title promise, assigned count, and section purpose.
- Do not introduce a new number, source, standard, product, procedure, threshold, or factual claim.
- Existing conditional advice is not an error merely because it uses words such as may, might, could, often, typically, easier, or faster.
- Replace promotional absolutes with concrete conditions or tradeoffs.`;

const headlineFulfillmentContract = `Headline and reader-promise requirements:
- Treat the tracker topic as the fixed assignment. Do not weaken, remove, or renumber a concrete promise from that topic to make the article easier to complete.
- Treat every concrete promise in the title, excerpt, and introduction as a delivery contract for the assembled article. The body must visibly fulfill each promised answer, method, checklist, comparison, template, or outcome.
- If the tracker topic or title advertises a number, preserve that count and create one coherent sequence containing exactly that many substantive items. Format section count is unrelated to the advertised item count; the sequence may live inside one or more appropriate sections. Do not scatter competing numbered lists across sections or claim the count without delivering it.
- If the title asks "how much" or promises a cost or budgeting guide, include a usable estimation method with inputs and a worked or scenario-based calculation. Do not invent current market rates; let the reader insert verified rates or clearly label hypothetical values.
- A checklist or step-by-step guide must let the reader perform the promised task. Conceptual background alone does not fulfill an implementation, checklist, template, or from-scratch promise.
- Plan natural, topic-specific headings. Format heading directions describe purpose only and are forbidden as candidate wording. Never expose internal labels such as "foundation," "planning," "first major area," "review results," or "choose the best next step."`;

export const articlePlanResponseSchema = (format: ArticleFormat) => {
  const sectionKeys = format.sections.map(section => section.key);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      excerpt: { type: 'string' },
      slug: { type: 'string' },
      categories: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 5 },
      tags: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 10 },
      sections: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(format.sections.map(section => [section.key, {
          type: 'object',
          additionalProperties: false,
          properties: { heading: { type: 'string' } },
          required: ['heading']
        }])),
        required: sectionKeys
      }
    },
    required: ['title', 'excerpt', 'slug', 'categories', 'tags', 'sections']
  };
};

export const articleSectionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string' }
  },
  required: ['content']
};

export const promptForArticlePlan = (row: Pick<BlogRow, 'blog_topic' | 'blog_type'>, format: ArticleFormat) => {
  const sections = format.sections.map((section, index) =>
    `${index + 1}. Heading direction (do not copy or closely paraphrase): ${section.heading_example}\n   Purpose: ${section.content_instruction}`
  ).join('\n');
  const avoid = format.avoid.map(item => `- ${item}`).join('\n');
  // Editorial format fields belong only in prompts. Never turn them into generated-content rejection rules.
  return `Plan the metadata and topic-specific headings for a factual, original WordPress article about: ${row.blog_topic}

Selected blog format: "${format.id}" (${format.display_name})
Approximate article length: ${format.target_words} words. This is writing guidance, not an exact quota.
Format guidance: ${format.writing_guidance}
Tone: ${format.tone}
Reader expertise level: ${format.expertise_level}
Conclusion guidance: ${format.conclusion_guidance}
Avoid:
${avoid}

${factualQualityContract}

${headlineFulfillmentContract}

Plan a distinct, non-overlapping scope for every section. Keep each heading inside its stated purpose, and do not assign the same subtopic, example, or action to multiple sections. Assign each concrete topic, title, and introduction promise to a clear place in the structure. When the topic or title advertises a numbered sequence, preserve that number and assign the coherent sequence to suitable body sections instead of changing the count or creating unrelated numbered lists throughout the article. Use the conclusion guidance when planning the final section: its heading must signal synthesis or a next step, not another body topic, checklist, or procedure.

Return only the JSON object required by the response schema. The sections field must contain exactly these keys in order: ${format.sections.map(section => section.key).join(', ')}. Each section value contains only its topic-specific heading. Do not write body content yet.

Format sections, in required order:
${sections}`;
};

export const promptForArticleSection = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  index: number
) => {
  const section = format.sections[index];
  if (!section) throw new Error(`Format ${format.id} has no section ${index + 1}`);
  const approximateSectionWords = Math.round(format.target_words / format.sections.length);
  const sections = format.sections.map((item, sectionIndex) =>
    `${sectionIndex + 1}. Rendered heading: ${plan.headings[sectionIndex]}
   Format purpose: ${item.content_instruction}${sectionIndex === index ? '\n   This is the current section.' : ''}`
  ).join('\n');
  const avoid = format.avoid.map(item => `- ${item}`).join('\n');
  const finalSectionBoundary = index === format.sections.length - 1
    ? '\nThis is the final section. Synthesize the article and give one useful next action. Do not introduce another detailed checklist, procedure, or new body topic, and do not repeat the steps already covered.'
    : '';
  return `Write only the body content for section ${index + 1} of ${format.sections.length} in the WordPress article "${plan.title}" about: ${row.blog_topic}

Selected format: ${format.display_name}
Approximate complete-article length: ${format.target_words} words.
Aim for roughly ${approximateSectionWords} words in this section so the assembled article stays near that overall length. This is guidance, not a pass/fail quota; write naturally and do not pad.
Format guidance: ${format.writing_guidance}
Tone: ${format.tone}
Reader expertise level: ${format.expertise_level}
Conclusion guidance: ${format.conclusion_guidance}
Avoid:
${avoid}

${factualQualityContract}

${headlineFulfillmentContract}

Use the Avoid list as writing guidance for this section. When it prohibits invented guarantees, benchmarks, or performance targets, do not manufacture numeric thresholds or universal success figures. Describe what the reader should evaluate against their own baseline instead.

Format heading example: ${section.heading_example}
Rendered heading: ${plan.headings[index]}
Section instruction: ${section.content_instruction}

The complete format structure, in required order, is:
${sections}

This call owns only the current section. Keep its content inside the current section's purpose. Fulfill the part of the title and introduction promise assigned to this section, but do not preview, fill, or repeat material assigned to another section. Do not restate or closely paraphrase the rendered heading as a standalone opening line or label.${finalSectionBoundary}

Return only the JSON object required by the response schema. Put the finished section body in "content" as ordinary Markdown. Paragraphs, lists, quotes, tables, and code are allowed when they naturally fit the section instruction. Do not include the article title, the rendered section heading, another section heading, or a label naming another section in the content. Do not add H1 headings.`;
};

export const promptForArticleSectionRepair = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  index: number,
  currentContent: string,
  issues: ArticleQualityIssue[],
  action: ArticleRepairAction = 'targeted'
) => {
  const section = format.sections[index];
  if (!section) throw new Error(`Format ${format.id} has no section ${index + 1}`);
  if (!issues.length) throw new Error(`Section ${index + 1} repair requires at least one quality issue`);
  const repairs = issues.map(issue => `- Repair ID: ${issue.issue_id}
  Category: ${issue.category}
  Problematic text: ${issue.quoted_text}
  Problem: ${issue.problem}
  Required change: ${issue.required_change}
  Acceptance condition: ${issue.acceptance_condition}`).join('\n');
  const structure = format.sections.map((item, sectionIndex) =>
    `${sectionIndex + 1}. ${plan.headings[sectionIndex]} — ${item.content_instruction}${sectionIndex === index ? ' (section being repaired)' : ''}`
  ).join('\n');
  return `Repair section ${index + 1} of ${format.sections.length} in the WordPress article "${plan.title}" about: ${row.blog_topic}

Section heading: ${plan.headings[index]}
Section purpose: ${section.content_instruction}
${repairGuardrails}

Complete article structure:
${structure}

Mandatory reviewer repair list for this section:
${repairs}

Current section content:
<current_section>
${currentContent}
</current_section>

${action === 'replace'
    ? 'Earlier targeted repairs did not resolve these problems. Replace the section body completely with a stronger version that satisfies every repair item and the original section purpose.'
    : action === 'reinforced'
      ? 'A targeted repair did not fully resolve these problems. Make a materially stronger correction: check every acceptance condition explicitly, remove the underlying cause rather than only rephrasing the quoted text, and preserve sound unrelated material.'
      : 'Revise only what is necessary to satisfy every repair item. Preserve accurate, useful material that is unrelated to the listed problems.'}

Return only the JSON object required by the response schema, with the complete replacement section body in "content" as ordinary Markdown. Do not merely describe the edits. Do not include the article title, any section heading, or labels such as "revised section." Do not add H1 headings.`;
};

export const promptForArticlePlanRepair = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  issues: ArticleQualityIssue[],
  action: ArticleRepairAction = 'targeted'
) => {
  if (!issues.length) throw new Error('Article plan repair requires at least one quality issue');
  const repairs = issues.map(issue => `- Repair ID: ${issue.issue_id}
  Category: ${issue.category}
  Problematic text: ${issue.quoted_text}
  Problem: ${issue.problem}
  Required change: ${issue.required_change}
  Acceptance condition: ${issue.acceptance_condition}`).join('\n');
  const sectionPurposes = format.sections.map((section, index) =>
    `${index + 1}. Key: ${section.key}\n   Heading direction (do not copy or closely paraphrase): ${section.heading_example}\n   Purpose: ${section.content_instruction}`
  ).join('\n');
  return `Repair the metadata and planned headings for the WordPress article about: ${row.blog_topic}

Selected format: ${format.id} (${format.display_name})
${repairGuardrails}

Mandatory reviewer repair list for the article plan:
${repairs}

Current article plan:
<current_plan>
${JSON.stringify(plan)}
</current_plan>

Required format sections:
${sectionPurposes}

${action === 'replace'
    ? 'Earlier targeted plan repairs did not resolve the problems. Replace the metadata and planned headings completely while preserving the topic and required format structure.'
    : action === 'reinforced'
      ? 'A targeted plan repair did not fully resolve these problems. Make a materially stronger correction: check every acceptance condition explicitly and remove the underlying cause rather than only rephrasing the quoted text.'
      : 'Change only the metadata or headings necessary to satisfy every repair item. Preserve sound plan fields.'}

Return only the JSON object required by the article-plan response schema. The sections object must contain exactly these keys in order: ${format.sections.map(section => section.key).join(', ')}. Each section value contains only its repaired topic-specific heading. Do not write body content.`;
};

const text = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};

const parsedObject = (source: string, label: string) => {
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch (error) { throw new Error(`LM Studio returned invalid ${label} JSON: ${String(error)}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`LM Studio ${label} must be a JSON object`);
  return parsed as Record<string, unknown>;
};

export const parseArticlePlan = (source: string, format: ArticleFormat, assignedTopic?: string): ArticlePlan => {
  const raw = parsedObject(source, 'article plan');
  const title = text(raw.title, 'Article title');
  const sections = raw.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) throw new Error('LM Studio article plan sections must be an object keyed by format section');
  const keyed = sections as Record<string, { heading?: unknown }>;
  const expected = format.sections.map(section => section.key);
  const actual = Object.keys(keyed);
  const unexpected = actual.filter(key => !expected.includes(key));
  const missing = expected.filter(key => !Object.hasOwn(keyed, key));
  if (missing.length || unexpected.length) throw new Error(`LM Studio article plan section keys must match format ${format.id}; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`);
  const headings = expected.map((key, index) => index === 0 ? title : text(keyed[key]?.heading, `Section ${index + 1} heading`));
  const categories = raw.categories;
  const tags = raw.tags;
  if (!Array.isArray(categories) || !Array.isArray(tags)) throw new Error('Article plan categories and tags must be arrays');
  const plan = {
    title,
    excerpt: text(raw.excerpt, 'Article excerpt'),
    slug: text(raw.slug, 'Article slug'),
    categories: categories.map((value, index) => text(value, `Article category ${index + 1}`)),
    tags: tags.map((value, index) => text(value, `Article tag ${index + 1}`)),
    headings
  };
  if (assignedTopic) validatePlanAssignment(assignedTopic, plan);
  return plan;
};

export const parseArticleSection = (source: string): Pick<StructuredSection, 'content'> => {
  const raw = parsedObject(source, 'article section');
  return { content: text(raw.content, 'Article section content') };
};

const consequentialNumberPattern = /(?:\$\s*\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\$?\s*\d+(?:[.,]\d+)?)?|\b\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?\s*(?:%|percent\b|px\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b))/gi;
const consequentialNumbers = (value: string) => new Set([...value.matchAll(consequentialNumberPattern)].map(match => match[0].toLowerCase().replace(/\s+/g, ' ')));
const consequentialNumberMatches = (value: string) => [...value.matchAll(consequentialNumberPattern)].map(match => match[0]);

const neutralThresholdReplacement = (value: string) => {
  if (/\$/.test(value)) return 'a verified-input cost';
  if (/%|percent/i.test(value)) return 'a reader-selected percentage';
  if (/px/i.test(value)) return 'a content-tested breakpoint';
  if (/ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?/i.test(value)) return 'a scope-based timeline';
  return 'a baseline-derived threshold';
};

export const normalizeRepairThresholds = (before: string, after: string) => {
  const existing = consequentialNumbers(before);
  return consequentialNumberMatches(after).reduce((content, matched) => {
    const normalized = matched.toLowerCase().replace(/\s+/g, ' ');
    return existing.has(normalized) ? content : content.replaceAll(matched, neutralThresholdReplacement(matched));
  }, after);
};

export const validateRepairDoesNotInventThresholds = (before: string, after: string) => {
  const existing = consequentialNumbers(before);
  const introduced = [...consequentialNumbers(after)].filter(value => !existing.has(value));
  if (introduced.length) throw new Error(`Article repair introduced unsupported numeric thresholds: ${introduced.join(', ')}`);
};
