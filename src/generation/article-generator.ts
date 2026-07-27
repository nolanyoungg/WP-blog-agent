import type { BlogRow } from '../domain/blog.js';
import type { ArticleBlockType, ArticleFormat, ArticleFormatSection } from './article-format-registry.js';
import type { StructuredArticle, StructuredBlock } from './article-markdown-renderer.js';

export interface ArticlePlan extends Omit<StructuredArticle, 'sections'> {
  headings: string[];
}

const generatedBlockTypes = (section: ArticleFormatSection): ArticleBlockType[] => {
  return [...new Set<ArticleBlockType>([
    'paragraph',
    ...section.required_blocks.map(block => block.type)
  ])];
};

const blockSchema = (section: ArticleFormatSection) => {
  const blockTypes = generatedBlockTypes(section);
  const includes = (type: ArticleBlockType) => blockTypes.includes(type);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: blockTypes },
      ...((includes('paragraph') || includes('quote')) ? { text: { type: 'string' } } : {}),
      ...(includes('quote') ? { attribution: { type: 'string' } } : {}),
      ...((includes('ordered_list') || includes('unordered_list')) ? { items: { type: 'array', items: { type: 'string' } } } : {}),
      ...(includes('table') ? {
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } }
      } : {}),
      ...(includes('fenced_code') ? { language: { type: 'string' }, code: { type: 'string' } } : {})
    },
    required: blockTypes.length === 1 && blockTypes[0] === 'paragraph' ? ['type', 'text'] : ['type']
  };
};

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

export const articleSectionResponseSchema = (section: ArticleFormatSection) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    blocks: { type: 'array', minItems: 1, items: blockSchema(section) }
  },
  required: ['blocks']
});

export const promptForArticlePlan = (row: Pick<BlogRow, 'blog_topic' | 'blog_length' | 'blog_type'>, format: ArticleFormat) => {
  if (!row.blog_length || !Number.isSafeInteger(row.blog_length) || row.blog_length <= 0) throw new Error('blog_length must be a positive whole-number word target');
  const sections = format.sections.map((section, index) => `${index + 1}. ${section.key}: ${section.heading_instruction}`).join('\n');
  return `Plan the metadata and section headings for a factual, original WordPress article about: ${row.blog_topic}

Use the blog format "${format.id}" (${format.display_name}) for a ${row.blog_length}-word article. Return only the JSON object required by the response schema. The sections field must be one object with exactly these keys in this order: ${format.sections.map(section => section.key).join(', ')}. Each section value contains only its heading. Do not write body content yet, do not add other section keys, and do not invent citations, sources, statistics, client results, or product claims.

Required headings:
${sections}`;
};

export const promptForArticleSection = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_length' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  index: number
) => {
  if (!row.blog_length) throw new Error('blog_length is required to generate a section');
  const section = format.sections[index];
  if (!section) throw new Error(`Format ${format.id} has no section ${index + 1}`);
  const target = Math.round(row.blog_length * section.word_percentage / 100);
  const recommendedParagraphs = Math.max(section.min_paragraphs, Math.min(section.max_paragraphs, Math.ceil(target / 100)));
  const wordsPerParagraph = Math.round(target / recommendedParagraphs);
  const requestedMinimum = Math.max(section.min_words_per_paragraph, Math.round(wordsPerParagraph * 0.9));
  const requestedMaximum = Math.min(section.max_words_per_paragraph, Math.round(wordsPerParagraph * 1.1));
  const required = section.required_blocks.length
    ? section.required_blocks.map(block => `${block.min_count} ${block.type}${block.language ? ` (${block.language})` : ''}`).join(', ')
    : 'none beyond the paragraph rules';
  return `Write only section ${index + 1} of ${format.sections.length} for the WordPress article "${plan.title}" about: ${row.blog_topic}

Section key: ${section.key}
Rendered heading: ${plan.headings[index]}
Purpose: ${section.purpose}
Content: ${section.content_instruction}
Target: ${target} content words. The final section must contain ${Math.round(target * 0.9)}-${Math.round(target * 1.1)} content words.
Paragraphs: use exactly ${recommendedParagraphs} paragraph block${recommendedParagraphs === 1 ? '' : 's'} of ${requestedMinimum}-${requestedMaximum} words each. Do not combine them or submit a shorter paragraph.
Allowed by the format: ${section.allowed_blocks.join(', ')}
Required special blocks: ${required}

Return only the JSON object required by the response schema. It contains the blocks for this section and no heading or article metadata. Do not include Markdown headings inside block content. Do not repeat material implied by these other section headings: ${plan.headings.filter((_, headingIndex) => headingIndex !== index).join(' | ')}. Do not invent citations, sources, statistics, client results, performance targets, accessibility conformance claims, or product claims.`;
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

const countWords = (value: string) => value.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;

const mergeShortParagraphs = (blocks: StructuredBlock[], definition: ArticleFormatSection) => {
  const normalized: StructuredBlock[] = [];
  for (let index = 0; index < blocks.length;) {
    const block = blocks[index];
    if (block?.type !== 'paragraph' || typeof block.text !== 'string') { normalized.push(block); index++; continue; }
    const run: StructuredBlock[] = [];
    while (index < blocks.length && blocks[index]?.type === 'paragraph' && typeof blocks[index].text === 'string') run.push(blocks[index++]);
    let pending: StructuredBlock[] = [];
    const flush = () => {
      if (!pending.length) return;
      normalized.push({ ...pending[0], text: pending.map(part => part.text?.trim() ?? '').filter(Boolean).join(' ') });
      pending = [];
    };
    for (const paragraph of run) {
      pending.push(paragraph);
      if (countWords(pending.map(part => part.text ?? '').join(' ')) >= definition.min_words_per_paragraph) flush();
    }
    if (pending.length) {
      const tail = pending.map(part => part.text?.trim() ?? '').filter(Boolean).join(' ');
      const previous = normalized.at(-1);
      if (previous?.type === 'paragraph' && countWords(`${previous.text ?? ''} ${tail}`) <= definition.max_words_per_paragraph) previous.text = `${previous.text ?? ''} ${tail}`.trim();
      else flush();
    }
  }
  return normalized;
};

export const parseArticleSection = (source: string, definition: ArticleFormatSection) => {
  const raw = parsedObject(source, 'article section');
  if (!Array.isArray(raw.blocks)) throw new Error('LM Studio article section blocks must be an array');
  return mergeShortParagraphs(raw.blocks as StructuredBlock[], definition);
};
