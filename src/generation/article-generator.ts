import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';
import type { StructuredArticle, StructuredSection } from './article-markdown-renderer.js';

export interface ArticlePlan extends Omit<StructuredArticle, 'sections'> {
  headings: string[];
}

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
  return `Plan the metadata and topic-specific headings for a factual, original WordPress article about: ${row.blog_topic}

Selected blog format: "${format.id}" (${format.display_name})
Approximate article length: ${format.target_words} words. This is writing guidance, not an exact quota.
Format guidance: ${format.writing_guidance}

The Markdown file below is the selected structural template. Preserve its section order and purpose in the plan:
<blog_format_template>
${format.template_markdown}
</blog_format_template>

Return only the JSON object required by the response schema. The sections field must contain exactly these keys in order: ${format.sections.map(section => section.key).join(', ')}. Each section value contains only its topic-specific heading. Do not write body content yet.

Template sections:
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
  return `Write only the body content for section ${index + 1} of ${format.sections.length} in the WordPress article "${plan.title}" about: ${row.blog_topic}

Selected format: ${format.display_name}
Approximate complete-article length: ${format.target_words} words.
Aim for roughly ${approximateSectionWords} words in this section so the assembled article stays near that overall length. This is guidance, not a pass/fail quota; write naturally and do not pad.
Format guidance: ${format.writing_guidance}
Template heading example: ${section.heading_example}
Rendered heading: ${plan.headings[index]}
Template instruction: ${section.content_instruction}

The complete structural template is:
<blog_format_template>
${format.template_markdown}
</blog_format_template>

Return only the JSON object required by the response schema. Put the finished section body in "content" as ordinary Markdown. Paragraphs, lists, quotes, tables, and code are allowed when they naturally fit the template instruction. Do not include the section heading in the content and do not add H1 headings. Avoid repeating material assigned to these other sections: ${plan.headings.filter((_, headingIndex) => headingIndex !== index).join(' | ')}.`;
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
