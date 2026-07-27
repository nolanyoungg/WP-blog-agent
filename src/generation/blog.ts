import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow, BlogType } from '../types.js';

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'blog';
type FrontMatter = Record<string, string | string[]>;
const h1CountByBlogType: Record<BlogType, number> = { short: 4, medium: 6, long: 10 };

const splitFrontMatter = (raw: string) => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return { front: match?.[1] ?? '', body: match?.[2] ?? raw };
};

const splitFencedYaml = (raw: string) => {
  const match = raw.match(/^```ya?ml\s*\n([\s\S]*?)\n```\s*\n?([\s\S]*)$/i);
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

export const promptFor = (row: Pick<BlogRow, 'blog_topic' | 'blog_length' | 'blog_type'>) => {
  if (!row.blog_length) throw new Error('blog_length must be a positive whole-number word target');
  if (!row.blog_type) throw new Error('blog_type must be short, medium, or long');
  const h1Count = h1CountByBlogType[row.blog_type];
  const headingSkeleton = Array.from({ length: h1Count }, (_, index) => `# ${index === 0 ? 'Article title' : `Section ${index}`}`).join('\n');
  return `Create a polished, factual and original WordPress blog article about: ${row.blog_topic}\n\nReturn Markdown only. Begin with literal YAML front matter delimited by a line containing --- before and after it; never wrap the YAML in a code fence. The front matter must contain title, excerpt, slug, categories, and tags. The article body must target ${row.blog_length} words, excluding the YAML front matter. This is a ${row.blog_type} blog, so it MUST contain exactly ${h1Count} level-one Markdown headings (lines beginning with \"# \"), including the article title. Do not use any \"##\" or deeper headings. Replace every placeholder in this required heading skeleton with meaningful copy and do not add or remove a heading:\n${headingSkeleton}\n\nWrite paragraphs and practical steps under those headings, ending with a conclusion in the final section. Do not add citations unless you can support them from the prompt; do not invent facts.`;
};

export const validateGeneratedArticle = (row: Pick<BlogRow, 'blog_length' | 'blog_type'>, markdown: string) => {
  if (!row.blog_length || !row.blog_type) throw new Error('blog_length and blog_type are required to validate an article');
  const trimmed = markdown.trim();
  const withFrontMatter = splitFrontMatter(trimmed);
  const generated = withFrontMatter.front ? withFrontMatter : splitFencedYaml(trimmed);
  const h1Count = (generated.body.match(/^#\s+.+$/gm) ?? []).length;
  const expectedH1Count = h1CountByBlogType[row.blog_type];
  if (h1Count !== expectedH1Count) throw new Error(`Expected exactly ${expectedH1Count} H1 headings for blog_type ${row.blog_type}, received ${h1Count}`);
  const wordCount = generated.body.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
  const tolerance = Math.max(75, Math.round(row.blog_length * 0.15));
  if (Math.abs(wordCount - row.blog_length) > tolerance) throw new Error(`Expected ${row.blog_length} words within ${tolerance}, received ${wordCount}`);
};

export const saveDraft = async (dir: string, row: BlogRow, markdown: string, model: string) => {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${row.blog_id}-${slugify(row.blog_topic)}.md`);
  const trimmed = markdown.trim();
  const withFrontMatter = splitFrontMatter(trimmed);
  const generated = withFrontMatter.front ? withFrontMatter : splitFencedYaml(trimmed);
  const provenance = `blog_id: "${row.blog_id}"\ntopic: "${row.blog_topic.replaceAll('"', '\\"')}"\nblog_length: "${row.blog_length ?? ''}"\nblog_type: "${row.blog_type ?? ''}"\ngenerated_at: "${new Date().toISOString()}"\nmodel_used: "${model}"\nreview_status: pending`;
  await writeFile(file, `---\n${provenance}${generated.front ? `\n${generated.front}` : ''}\n---\n\n${generated.body.trim()}\n`, 'utf8');
  return file;
};

export const parseDraft = async (file: string) => {
  const raw = await readFile(file, 'utf8');
  const { front, body } = splitFrontMatter(raw);
  const metadata = parseFrontMatter(front);
  const value = (key: string) => typeof metadata[key] === 'string' ? metadata[key] : '';
  const list = (key: string) => Array.isArray(metadata[key]) ? metadata[key] as string[] : [];
  const title = value('title') || body.match(/^#\s+(.+)$/m)?.[1] || 'Untitled';
  const excerpt = value('excerpt') || body.replace(/^#.*$/m, '').trim().slice(0, 155);
  return { body, title, excerpt, slug: value('slug') || slugify(title), categories: list('categories'), tags: list('tags') };
};
