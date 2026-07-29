import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';

export interface StructuredSection {
  heading: string;
  content: string;
}

export interface StructuredArticle {
  title: string;
  excerpt: string;
  slug: string;
  categories: string[];
  tags: string[];
  sections: StructuredSection[];
}

type FrontMatter = Record<string, string | string[]>;
const requireText = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};
const safeHeading = (value: string) => value.replace(/<\/?h[1-6]\b[^>]*>/gi, '').replace(/^#+\s*/, '').replace(/[\r\n]+/g, ' ').trim();
const comparableHeading = (value: string) => safeHeading(value).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const safeSectionContent = (value: string, heading?: string) => {
  const lines = value
    .replace(/^---\s*$[\s\S]*?^---\s*$/m, '')
    .replace(/^#\s+.+$/gm, '')
    .trim()
    .split('\n');
  const firstContentLine = lines.findIndex(line => line.trim());
  if (heading && firstContentLine >= 0 && comparableHeading(lines[firstContentLine]) === comparableHeading(heading)) {
    lines.splice(firstContentLine, 1);
  }
  return lines.join('\n').trim();
};
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

export const validateStructuredSection = (generated: StructuredSection, index: number) => {
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) throw new Error(`Section ${index + 1} must be an object`);
  if (!safeHeading(requireText(generated.heading, `Section ${index + 1} heading`))) throw new Error(`Section ${index + 1} heading must contain text`);
  if (!safeSectionContent(requireText(generated.content, `Section ${index + 1} content`), generated.heading)) throw new Error(`Section ${index + 1} content must contain text outside its heading`);
};

export const validateStructuredArticle = (format: ArticleFormat, article: StructuredArticle) => {
  if (!article || typeof article !== 'object' || Array.isArray(article)) throw new Error('Article must be an object');
  if (!safeHeading(requireText(article.title, 'Article title'))) throw new Error('Article title must contain text');
  requireText(article.excerpt, 'Article excerpt');
  requireText(article.slug, 'Article slug');
  if (!Array.isArray(article.categories) || article.categories.length < 1 || article.categories.length > 5 || article.categories.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Article categories must contain 1-5 non-empty values');
  if (!Array.isArray(article.tags) || article.tags.length < 1 || article.tags.length > 10 || article.tags.some(value => typeof value !== 'string' || !value.trim())) throw new Error('Article tags must contain 1-10 non-empty values');
  if (!Array.isArray(article.sections) || article.sections.length !== format.sections.length) throw new Error(`Format ${format.id} requires exactly ${format.sections.length} template sections; received ${article.sections?.length ?? 0}`);
  article.sections.forEach(validateStructuredSection);
};

export const renderAndValidateArticle = (format: ArticleFormat, article: StructuredArticle) => {
  validateStructuredArticle(format, article);
  const sections = article.sections.map((section, index) => {
    const heading = index === 0 ? safeHeading(article.title) : safeHeading(section.heading);
    return `# ${heading}\n\n${safeSectionContent(section.content, heading)}`;
  });
  const body = sections.join('\n\n');
  const headings = body.match(/^#\s+\S.+$/gm) ?? [];
  if (headings.length !== format.sections.length) throw new Error(`Rendered format ${format.id} must preserve its ${format.sections.length} template sections`);
  const front = `title: ${yamlString(article.title)}\nexcerpt: ${yamlString(article.excerpt)}\nslug: ${yamlString(slugify(article.slug))}\ncategories:\n${article.categories.map(value => `  - ${yamlString(value)}`).join('\n')}\ntags:\n${article.tags.map(value => `  - ${yamlString(value)}`).join('\n')}`;
  return `---\n${front}\n---\n\n${body}\n`;
};

export const saveDraft = async (dir: string, row: BlogRow, format: ArticleFormat, markdown: string, model: string) => {
  await mkdir(dir, { recursive: true });
  const generated = splitFrontMatter(markdown.trim());
  const metadata = parseFrontMatter(generated.front);
  const title = typeof metadata.title === 'string' ? metadata.title : row.blog_topic;
  const slug = typeof metadata.slug === 'string' ? metadata.slug : slugify(title);
  const paddedId = /^\d+$/.test(row.blog_id) ? row.blog_id.padStart(4, '0') : row.blog_id;
  const file = path.join(dir, `blog-${paddedId}-${slugify(slug).slice(0, 60)}.md`);
  const provenance = `blog_id: ${yamlString(row.blog_id)}\ntopic: ${yamlString(row.blog_topic)}\nblog_type: ${yamlString(row.blog_type ?? '')}\ntarget_words: ${yamlString(String(format.target_words))}\ngenerated_at: ${yamlString(new Date().toISOString())}\nmodel_used: ${yamlString(model)}\nreview_status: pending`;
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
