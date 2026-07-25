import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { marked, type Token } from 'marked';
import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { BlogRow } from '../types.js';

const MAX_MARKDOWN_CHARACTERS = 100_000;
const MIN_ARTICLE_WORDS = 400;
const MAX_ARTICLE_WORDS = 5_000;

const safeText = (label: string, minimum: number, maximum: number) => z.string()
  .trim()
  .min(minimum, `${label} is too short`)
  .max(maximum, `${label} is too long`)
  .refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), `${label} contains prohibited control or markup characters`);

const uniqueList = (label: string, maximumItems: number) => z.array(safeText(label, 1, 80))
  .min(1, `At least one ${label.toLowerCase()} is required`)
  .max(maximumItems, `Too many ${label.toLowerCase()} values`)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      const normalized = item.toLocaleLowerCase('en-US');
      if (seen.has(normalized)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `Duplicate ${label.toLowerCase()}` });
      seen.add(normalized);
    }
  });

export const generatedFrontMatterSchema = z.object({
  title: safeText('Title', 5, 160),
  excerpt: safeText('Excerpt', 40, 300),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and single hyphens only'),
  categories: uniqueList('Category', 8),
  tags: uniqueList('Tag', 12)
}).strict();

const storedFrontMatterSchema = generatedFrontMatterSchema.extend({
  blog_id: safeText('Blog ID', 1, 100),
  topic: safeText('Topic', 3, 500),
  generated_at: z.string().datetime({ offset: true }),
  model_used: safeText('Model identifier', 1, 240),
  review_status: z.literal('pending')
}).strict();

export type BlogDraft = z.infer<typeof generatedFrontMatterSchema> & { body: string };

const formatZodIssues = (error: z.ZodError) => error.issues
  .slice(0, 5)
  .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
  .join('; ');

const splitRequiredFrontMatter = (raw: string, source: string) => {
  const normalized = raw.replace(/\r\n?/g, '\n').trim();
  if (/^```ya?ml\b/i.test(normalized)) throw new Error(`${source} must use literal YAML front matter, not a fenced YAML block`);
  if (!normalized.startsWith('---\n')) throw new Error(`${source} is missing required YAML front matter`);
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) throw new Error(`${source} has malformed or unterminated YAML front matter`);
  const front = normalized.slice(4, closing);
  const body = normalized.slice(closing + 5).trim();
  if (!front.trim()) throw new Error(`${source} has empty YAML front matter`);
  if (!body) throw new Error(`${source} has an empty article body`);
  return { front, body };
};

const parseYamlObject = (front: string, source: string): unknown => {
  const document = parseDocument(front, {
    schema: 'core',
    strict: true,
    uniqueKeys: true
  });
  if (document.errors.length || document.warnings.length) {
    const issue = [...document.errors, ...document.warnings][0];
    throw new Error(`${source} contains invalid YAML: ${issue?.message.slice(0, 300) ?? 'unknown parse error'}`);
  }
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`${source} contains unsafe or unsupported YAML: ${String(error).slice(0, 300)}`);
  }
};

const parseFrontMatter = <T>(front: string, source: string, schema: z.ZodType<T>): T => {
  const parsed = schema.safeParse(parseYamlObject(front, source));
  if (!parsed.success) throw new Error(`${source} front matter is invalid: ${formatZodIssues(parsed.error)}`);
  return parsed.data;
};

const unsafeUrl = (value: string) => /^(?:javascript|data|vbscript|file):/i.test(value.replace(/[\u0000-\u0020\u007f]+/g, ''));

const scanMarkdownTokens = (tokens: Token[]) => {
  marked.walkTokens(tokens, token => {
    if (token.type === 'html') throw new Error('Article Markdown contains raw HTML; use Markdown syntax instead');
    if ((token.type === 'link' || token.type === 'image') && unsafeUrl(token.href)) {
      throw new Error(`Article Markdown contains a prohibited ${token.type} URL`);
    }
  });
};

const normalizedHeading = (value: string) => value.replace(/\s+/g, ' ').trim();

export const validateArticleBody = (bodyInput: unknown, expectedTitle: string): string => {
  const body = z.string().trim().min(1).max(MAX_MARKDOWN_CHARACTERS).parse(bodyInput);
  const tokens = marked.lexer(body, { gfm: true, breaks: false, pedantic: false });
  scanMarkdownTokens(tokens);
  const contentTokens = tokens.filter(token => token.type !== 'space');
  const headings = contentTokens.filter((token): token is Extract<Token, { type: 'heading' }> => token.type === 'heading');
  const levelOne = headings.filter(token => token.depth === 1);
  if (levelOne.length !== 1 || contentTokens[0] !== levelOne[0]) throw new Error('Article body must begin with exactly one level-one title');
  if (normalizedHeading(levelOne[0].text) !== normalizedHeading(expectedTitle)) throw new Error('Article level-one title must match front matter title');

  const metaDescription = contentTokens[1];
  if (!metaDescription || metaDescription.type !== 'paragraph') throw new Error('Article title must be followed by one meta-description paragraph');
  const metaLength = metaDescription.text.replace(/\s+/g, ' ').trim().length;
  if (metaLength < 40 || metaLength > 300) throw new Error('Article meta-description paragraph must contain 40 to 300 characters');

  const levelTwo = headings.filter(token => token.depth === 2);
  if (levelTwo.length < 5) throw new Error('Article must contain an introduction, at least two main sections, a practical section, and a conclusion');
  if (!/^introduction$/i.test(normalizedHeading(levelTwo[0].text))) throw new Error('The first level-two section must be Introduction');
  if (!/^conclusion$/i.test(normalizedHeading(levelTwo[levelTwo.length - 1].text))) throw new Error('The final level-two section must be Conclusion');
  const practicalIndex = levelTwo.findIndex(token => /^practical (?:steps|examples|steps or examples)$/i.test(normalizedHeading(token.text)));
  if (practicalIndex < 3 || practicalIndex >= levelTwo.length - 1) throw new Error('Article must include Practical Steps, Practical Examples, or Practical Steps or Examples after at least two main sections');

  const words = body.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu)?.length ?? 0;
  if (words < MIN_ARTICLE_WORDS || words > MAX_ARTICLE_WORDS) throw new Error(`Article body must contain ${MIN_ARTICLE_WORDS} to ${MAX_ARTICLE_WORDS} words`);
  return body;
};

export const validateGeneratedBlogMarkdown = (raw: string): BlogDraft => {
  const { front, body } = splitRequiredFrontMatter(raw, 'Generated Markdown');
  const metadata = parseFrontMatter(front, 'Generated Markdown', generatedFrontMatterSchema);
  return { ...metadata, body: validateArticleBody(body, metadata.title) };
};

export const validateBlogDraft = (input: unknown): BlogDraft => {
  const parsed = generatedFrontMatterSchema.extend({ body: z.string() }).strict().safeParse(input);
  if (!parsed.success) throw new Error(`WordPress draft fields are invalid: ${formatZodIssues(parsed.error)}`);
  return { ...parsed.data, body: validateArticleBody(parsed.data.body, parsed.data.title) };
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'blog';

export const promptFor = (topic: string) => `Create a polished, factual, original 700-1500 word WordPress blog article about: ${topic}

Return Markdown only. Begin with literal YAML front matter delimited by a line containing --- before and after it; never wrap the YAML or article in a code fence. The front matter must contain exactly title, excerpt, slug, categories, and tags. Use a lowercase kebab-case slug, one or more categories, and one or more tags. Then use this exact structure: # Title, a one-paragraph meta description, ## Introduction, at least two descriptive ## main sections, ## Practical Steps or Examples, and ## Conclusion. The level-one title must match the front matter title. Do not emit raw HTML, executable tags, active content, or unsafe URLs. Markdown code fences are allowed for relevant non-executing examples. Do not add citations unless the prompt supplies support for them; do not invent facts.`;

export const saveDraft = async (dir: string, row: BlogRow, markdown: string, model: string) => {
  const generated = validateGeneratedBlogMarkdown(markdown);
  const { body, ...generatedMetadata } = generated;
  const provenance = z.object({
    blog_id: safeText('Blog ID', 1, 100),
    topic: safeText('Topic', 3, 500),
    generated_at: z.string().datetime({ offset: true }),
    model_used: safeText('Model identifier', 1, 240),
    review_status: z.literal('pending')
  }).strict().parse({
    blog_id: row.blog_id,
    topic: row.blog_topic,
    generated_at: new Date().toISOString(),
    model_used: model,
    review_status: 'pending'
  });
  const metadata = storedFrontMatterSchema.parse({ ...provenance, ...generatedMetadata });
  const orderedMetadata = {
    blog_id: metadata.blog_id,
    topic: metadata.topic,
    generated_at: metadata.generated_at,
    model_used: metadata.model_used,
    review_status: metadata.review_status,
    title: metadata.title,
    excerpt: metadata.excerpt,
    slug: metadata.slug,
    categories: metadata.categories,
    tags: metadata.tags
  };
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${row.blog_id}-${slugify(row.blog_topic)}.md`);
  await writeFile(file, `---\n${stringify(orderedMetadata, { lineWidth: 0 }).trimEnd()}\n---\n\n${body}\n`, 'utf8');
  return file;
};

export const parseDraft = async (file: string): Promise<BlogDraft> => {
  const raw = await readFile(file, 'utf8');
  const { front, body } = splitRequiredFrontMatter(raw, 'Stored draft');
  const metadata = parseFrontMatter(front, 'Stored draft', storedFrontMatterSchema);
  const { blog_id: _blogId, topic: _topic, generated_at: _generatedAt, model_used: _modelUsed, review_status: _reviewStatus, ...postFields } = metadata;
  return validateBlogDraft({ ...postFields, body });
};
