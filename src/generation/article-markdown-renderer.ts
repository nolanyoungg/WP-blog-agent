import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow } from '../domain/blog.js';
import type { ArticleBlockType, ArticleFormat } from './article-format-registry.js';

export interface StructuredBlock {
  type: ArticleBlockType;
  text?: string;
  attribution?: string;
  items?: string[];
  headers?: string[];
  rows?: string[][];
  language?: string;
  code?: string;
}
export interface StructuredSection { heading: string; blocks: StructuredBlock[]; }
export interface StructuredArticle {
  title: string;
  excerpt: string;
  slug: string;
  categories: string[];
  tags: string[];
  sections: StructuredSection[];
}

type FrontMatter = Record<string, string | string[]>;
const wordCount = (value: string) => value.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
const requireText = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};
const safeHeading = (value: string) => value.replace(/<\/?h[1-6]\b[^>]*>/gi, '').replace(/^#+\s*/, '').replace(/[\r\n]+/g, ' ').trim();
const safeBodyText = (value: string) => value
  .replace(/<\/?h[1-6]\b[^>]*>/gi, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^(?:```+|~~~+|=+|-+)\s*$/gm, '')
  .trim();
const yamlString = (value: string) => JSON.stringify(value.replace(/[\r\n]+/g, ' ').trim());
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'blog';

const splitFrontMatter = (raw: string) => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return { front: match?.[1] ?? '', body: match?.[2] ?? raw };
};
const unquote = (value: string) => value.trim().replace(/^['"]|['"]$/g, '');
const parseFrontMatter = (front: string): FrontMatter => {
  const result: FrontMatter = {};
  let listKey: string | undefined;
  for (const line of front.split('\n')) {
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && listKey) {
      const current = result[listKey];
      result[listKey] = [...(Array.isArray(current) ? current : []), unquote(listItem[1])];
      continue;
    }
    const property = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!property) continue;
    const [, key, rawValue] = property;
    listKey = undefined;
    if (!rawValue) { result[key] = []; listKey = key; continue; }
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) result[key] = rawValue.slice(1, -1).split(',').map(unquote).filter(Boolean);
    else result[key] = unquote(rawValue);
  }
  return result;
};

const validateBlock = (block: StructuredBlock, section: ArticleFormat['sections'][number], label: string) => {
  if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error(`${label} must be an object`);
  if (!section.allowed_blocks.includes(block.type)) throw new Error(`${label} uses disallowed block type ${String(block.type)}`);
  if (block.type === 'paragraph') {
    const text = requireText(block.text, `${label}.text`);
    const count = wordCount(text);
    if (count < section.min_words_per_paragraph || count > section.max_words_per_paragraph) throw new Error(`${label} paragraph must contain ${section.min_words_per_paragraph}-${section.max_words_per_paragraph} words; received ${count}`);
  } else if (block.type === 'ordered_list' || block.type === 'unordered_list') {
    if (!Array.isArray(block.items) || !block.items.length || block.items.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${label}.items must contain at least one non-empty item`);
  } else if (block.type === 'quote') {
    requireText(block.text, `${label}.text`);
  } else if (block.type === 'table') {
    if (!Array.isArray(block.headers) || !block.headers.length || block.headers.some(header => typeof header !== 'string' || !header.trim())) throw new Error(`${label}.headers must be non-empty`);
    if (!Array.isArray(block.rows) || !block.rows.length || block.rows.some(row => !Array.isArray(row) || row.length !== block.headers!.length)) throw new Error(`${label}.rows must match the table header width`);
  } else if (block.type === 'fenced_code') {
    requireText(block.code, `${label}.code`);
    if (block.language !== '' && typeof block.language !== 'string') throw new Error(`${label}.language must be a string`);
  }
};

const blockWords = (block: StructuredBlock) => {
  if (block.type === 'paragraph' || block.type === 'quote') return wordCount(block.text ?? '');
  if (block.type === 'ordered_list' || block.type === 'unordered_list') return wordCount((block.items ?? []).join(' '));
  if (block.type === 'table') return wordCount([...(block.headers ?? []), ...(block.rows ?? []).flat()].join(' '));
  return wordCount(block.code ?? '');
};

export const validateStructuredSection = (sectionTarget: number, definition: ArticleFormat['sections'][number], generated: StructuredSection, index: number) => {
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) throw new Error(`Section ${index + 1} must be an object`);
  const heading = requireText(generated.heading, `Section ${index + 1} heading`);
  if (!safeHeading(heading)) throw new Error(`Section ${index + 1} heading must contain text after heading markup is removed`);
  if (!Array.isArray(generated.blocks) || !generated.blocks.length) throw new Error(`Section ${index + 1} must contain at least one block`);
  generated.blocks.forEach((block, blockIndex) => validateBlock(block, definition, `Section ${index + 1} block ${blockIndex + 1}`));
  const paragraphs = generated.blocks.filter(block => block.type === 'paragraph').length;
  if (paragraphs < definition.min_paragraphs || paragraphs > definition.max_paragraphs) throw new Error(`Section ${index + 1} requires ${definition.min_paragraphs}-${definition.max_paragraphs} paragraphs; received ${paragraphs}`);
  for (const required of definition.required_blocks) {
    const matches = generated.blocks.filter(block => block.type === required.type && (!required.language || (typeof block.language === 'string' && block.language.toLowerCase() === required.language.toLowerCase()))).length;
    if (matches < required.min_count) throw new Error(`Section ${index + 1} requires at least ${required.min_count} ${required.type}${required.language ? ` (${required.language})` : ''} block(s); received ${matches}`);
  }
  const sectionWords = generated.blocks.reduce((sum, block) => sum + blockWords(block), 0);
  const sectionTolerance = Math.max(30, Math.round(sectionTarget * 0.2));
  if (Math.abs(sectionWords - sectionTarget) > sectionTolerance) throw new Error(`Section ${index + 1} targets ${sectionTarget} words within ${sectionTolerance}; received ${sectionWords}`);
  return sectionWords;
};

export const validateStructuredArticle = (row: Pick<BlogRow, 'blog_length'>, format: ArticleFormat, article: StructuredArticle) => {
  const target = row.blog_length;
  if (!target) throw new Error('blog_length is required to validate an article');
  if (!article || typeof article !== 'object' || Array.isArray(article)) throw new Error('Article must be an object');
  const title = requireText(article.title, 'Article title');
  if (!safeHeading(title)) throw new Error('Article title must contain text after heading markup is removed');
  requireText(article.excerpt, 'Article excerpt');
  requireText(article.slug, 'Article slug');
  if (!Array.isArray(article.categories) || article.categories.length < 1 || article.categories.length > 5 || article.categories.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Article categories must contain 1-5 non-empty values');
  if (!Array.isArray(article.tags) || article.tags.length < 1 || article.tags.length > 10 || article.tags.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Article tags must contain 1-10 non-empty values');
  if (!Array.isArray(article.sections) || article.sections.length !== format.sections.length) throw new Error(`Format ${format.id} requires exactly ${format.sections.length} sections; received ${article.sections?.length ?? 0}`);
  let totalWords = 0;
  article.sections.forEach((generated, index) => {
    const definition = format.sections[index];
    const sectionTarget = Math.round(target * definition.word_percentage / 100);
    totalWords += validateStructuredSection(sectionTarget, definition, generated, index);
  });
  const tolerance = Math.max(75, Math.round(target * 0.15));
  if (Math.abs(totalWords - target) > tolerance) throw new Error(`Expected ${target} content words within ${tolerance}, received ${totalWords}`);
};

const renderBlock = (block: StructuredBlock) => {
  if (block.type === 'paragraph') return safeBodyText(block.text ?? '');
  if (block.type === 'ordered_list') return (block.items ?? []).map((item, index) => `${index + 1}. ${safeBodyText(item)}`).join('\n');
  if (block.type === 'unordered_list') return (block.items ?? []).map(item => `- ${safeBodyText(item)}`).join('\n');
  if (block.type === 'quote') return `${safeBodyText(block.text ?? '').split('\n').map(line => `> ${line}`).join('\n')}${block.attribution?.trim() ? `\n> — ${safeBodyText(block.attribution)}` : ''}`;
  if (block.type === 'table') {
    const cell = (value: string) => safeBodyText(value).replaceAll('|', '\\|');
    return `| ${(block.headers ?? []).map(cell).join(' | ')} |\n| ${(block.headers ?? []).map(() => '---').join(' | ')} |\n${(block.rows ?? []).map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}`;
  }
  const language = (block.language ?? '').replace(/[^A-Za-z0-9_+-]/g, '');
  const code = block.code ?? '';
  const longestFence = Math.max(2, ...(code.match(/`+/g) ?? []).map(run => run.length));
  const fence = '`'.repeat(longestFence + 1);
  return `${fence}${language}\n${code.trim()}\n${fence}`;
};

const h1Count = (markdown: string) => {
  let fence: { marker: string; length: number } | undefined;
  let count = 0;
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (!fence && /^#\s+\S/.test(line)) count++;
  }
  return count;
};

export const renderAndValidateArticle = (row: Pick<BlogRow, 'blog_length'>, format: ArticleFormat, article: StructuredArticle) => {
  validateStructuredArticle(row, format, article);
  const sections = article.sections.map((section, index) => {
    const heading = index === 0 ? safeHeading(article.title) : safeHeading(section.heading);
    return `# ${heading}\n\n${section.blocks.map(renderBlock).join('\n\n')}`;
  });
  const body = sections.join('\n\n');
  const headings = h1Count(body);
  if (headings !== format.sections.length) throw new Error(`Rendered format ${format.id} requires exactly ${format.sections.length} H1 headings; received ${headings}`);
  const front = `title: ${yamlString(article.title)}\nexcerpt: ${yamlString(article.excerpt)}\nslug: ${yamlString(slugify(article.slug))}\ncategories:\n${article.categories.map(value => `  - ${yamlString(value)}`).join('\n')}\ntags:\n${article.tags.map(value => `  - ${yamlString(value)}`).join('\n')}`;
  return `---\n${front}\n---\n\n${body}\n`;
};

export const saveDraft = async (dir: string, row: BlogRow, markdown: string, model: string) => {
  await mkdir(dir, { recursive: true });
  const generated = splitFrontMatter(markdown.trim());
  const metadata = parseFrontMatter(generated.front);
  const title = typeof metadata.title === 'string' ? metadata.title : row.blog_topic;
  const slug = typeof metadata.slug === 'string' ? metadata.slug : slugify(title);
  const paddedId = /^\d+$/.test(row.blog_id) ? row.blog_id.padStart(4, '0') : row.blog_id;
  const file = path.join(dir, `blog-${paddedId}-${slugify(slug).slice(0, 60)}.md`);
  const provenance = `blog_id: ${yamlString(row.blog_id)}\ntopic: ${yamlString(row.blog_topic)}\nblog_length: ${yamlString(String(row.blog_length ?? ''))}\nblog_type: ${yamlString(row.blog_type ?? '')}\ngenerated_at: ${yamlString(new Date().toISOString())}\nmodel_used: ${yamlString(model)}\nreview_status: pending`;
  await writeFile(file, `---\n${provenance}${generated.front ? `\n${generated.front}` : ''}\n---\n\n${generated.body.trim()}\n`, 'utf8');
  return file;
};

export const parseDraft = async (file: string) => {
  const raw = await readFile(file, 'utf8');
  const { front, body } = splitFrontMatter(raw);
  const metadata = parseFrontMatter(front);
  const value = (key: string) => typeof metadata[key] === 'string' ? metadata[key] as string : '';
  const list = (key: string) => Array.isArray(metadata[key]) ? metadata[key] as string[] : [];
  const title = value('title') || body.match(/^#\s+(.+)$/m)?.[1] || 'Untitled';
  const excerpt = value('excerpt') || body.replace(/^#.*$/m, '').trim().slice(0, 155);
  return { body, title, excerpt, slug: value('slug') || slugify(title), categories: list('categories'), tags: list('tags') };
};
