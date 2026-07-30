import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';
import type { StructuredArticle, StructuredSection } from './article-markdown-renderer.js';
import type { ArticleQualityIssue } from './article-quality-reviewer.js';

export interface ArticlePlan extends Omit<StructuredArticle, 'sections'> {
  headings: string[];
}

export const factualQualityContract = `Factual and editorial quality requirements:
- Do not invent citations, statistics, survey results, market-share figures, client outcomes, product behavior, legal requirements, standards, or performance targets.
- Do not promise or imply guaranteed SEO rankings, traffic, revenue, conversions, savings, security, compliance, accessibility, or performance outcomes.
- Treat outcomes that depend on implementation, audience, market, configuration, or baseline as conditional, and name the important dependency instead of using empty certainty.
- Distinguish an official requirement from a common recommendation, heuristic, example, or reader-chosen target.
- Use exact numbers only when they are stable and necessary. Identify what the number represents; otherwise tell the reader to measure against an appropriate baseline or verify the current primary documentation.
- Prefer durable, accurate explanations over claims that depend on current product versions or changing market conditions.
- Give practical advice with its reasoning, constraints, and relevant tradeoffs. Do not turn a reasonable option into a universal rule.
- If a precise claim cannot be supported from the supplied article context, omit it or replace it with accurate, appropriately qualified guidance.`;

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
    `${index + 1}. Example heading: ${section.heading_example}\n   Purpose: ${section.content_instruction}`
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

Plan a distinct, non-overlapping scope for every section. Keep each heading inside its stated purpose, and do not assign the same subtopic, example, or action to multiple sections. Use the conclusion guidance when planning the final section: its heading must signal synthesis or a next step, not another body topic, checklist, or procedure.

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

Use the Avoid list as writing guidance for this section. When it prohibits invented guarantees, benchmarks, or performance targets, do not manufacture numeric thresholds or universal success figures. Describe what the reader should evaluate against their own baseline instead.

Format heading example: ${section.heading_example}
Rendered heading: ${plan.headings[index]}
Section instruction: ${section.content_instruction}

The complete format structure, in required order, is:
${sections}

This call owns only the current section. Keep its content inside the current section's purpose. Do not preview, fill, or repeat material assigned to another section.${finalSectionBoundary}

Return only the JSON object required by the response schema. Put the finished section body in "content" as ordinary Markdown. Paragraphs, lists, quotes, tables, and code are allowed when they naturally fit the section instruction. Do not include the article title, the rendered section heading, another section heading, or a label naming another section in the content. Do not add H1 headings.`;
};

export const promptForArticleSectionRepair = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  index: number,
  currentContent: string,
  issues: ArticleQualityIssue[],
  replaceEntireSection = false
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
${factualQualityContract}

Complete article structure:
${structure}

Mandatory reviewer repair list for this section:
${repairs}

Current section content:
<current_section>
${currentContent}
</current_section>

${replaceEntireSection
    ? 'A targeted repair did not fully resolve this section. Replace the section body completely with a stronger version that satisfies every repair item and the original section purpose.'
    : 'Revise only what is necessary to satisfy every repair item. Preserve accurate, useful material that is unrelated to the listed problems.'}

Return only the JSON object required by the response schema, with the complete replacement section body in "content" as ordinary Markdown. Do not merely describe the edits. Do not include the article title, any section heading, or labels such as "revised section." Do not add H1 headings.`;
};

export const promptForArticlePlanRepair = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  issues: ArticleQualityIssue[],
  replaceEntirePlan = false
) => {
  if (!issues.length) throw new Error('Article plan repair requires at least one quality issue');
  const repairs = issues.map(issue => `- Repair ID: ${issue.issue_id}
  Category: ${issue.category}
  Problematic text: ${issue.quoted_text}
  Problem: ${issue.problem}
  Required change: ${issue.required_change}
  Acceptance condition: ${issue.acceptance_condition}`).join('\n');
  const sectionPurposes = format.sections.map((section, index) =>
    `${index + 1}. Key: ${section.key}\n   Example heading: ${section.heading_example}\n   Purpose: ${section.content_instruction}`
  ).join('\n');
  return `Repair the metadata and planned headings for the WordPress article about: ${row.blog_topic}

Selected format: ${format.id} (${format.display_name})
${factualQualityContract}

Mandatory reviewer repair list for the article plan:
${repairs}

Current article plan:
<current_plan>
${JSON.stringify(plan)}
</current_plan>

Required format sections:
${sectionPurposes}

${replaceEntirePlan
    ? 'A targeted plan repair did not resolve the problems. Replace the metadata and planned headings completely while preserving the topic and required format structure.'
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

export const parseArticlePlan = (source: string, format: ArticleFormat): ArticlePlan => {
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
  return {
    title,
    excerpt: text(raw.excerpt, 'Article excerpt'),
    slug: text(raw.slug, 'Article slug'),
    categories: categories.map((value, index) => text(value, `Article category ${index + 1}`)),
    tags: tags.map((value, index) => text(value, `Article tag ${index + 1}`)),
    headings
  };
};

export const parseArticleSection = (source: string): Pick<StructuredSection, 'content'> => {
  const raw = parsedObject(source, 'article section');
  return { content: text(raw.content, 'Article section content') };
};
