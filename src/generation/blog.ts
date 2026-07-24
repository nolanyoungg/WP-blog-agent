import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow } from '../types.js';

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'blog';
type FrontMatter = Record<string, string | string[]>;

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

export const promptFor = (topic: string) => `Create a polished, factual and original WordPress blog article about: ${topic}\n\nReturn Markdown only. Begin with literal YAML front matter delimited by a line containing --- before and after it; never wrap the YAML in a code fence. The front matter must contain title, excerpt, slug, categories, and tags. Then use this structure: # Title, a one-paragraph meta description, ## Introduction, multiple ## Main sections, ## Practical steps or examples, and ## Conclusion. Do not add citations unless you can support them from the prompt; do not invent facts.`;

export const saveDraft = async (dir: string, row: BlogRow, markdown: string, model: string) => {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${row.blog_id}-${slugify(row.blog_topic)}.md`);
  const trimmed = markdown.trim();
  const withFrontMatter = splitFrontMatter(trimmed);
  const generated = withFrontMatter.front ? withFrontMatter : splitFencedYaml(trimmed);
  const provenance = `blog_id: "${row.blog_id}"\ntopic: "${row.blog_topic.replaceAll('"', '\\"')}"\ngenerated_at: "${new Date().toISOString()}"\nmodel_used: "${model}"\nreview_status: pending`;
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
