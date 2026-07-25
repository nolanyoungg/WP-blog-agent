import { z } from 'zod';
import type { WordPressPost } from '../types.js';
import { renderBlogHtml } from './content.js';

const nonemptyString = z.string().trim().min(1);
const httpUrl = z.string().url().refine(value => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'Expected an HTTP(S) URL');

const termSchema = z.object({
  id: z.number().int().positive(),
  name: nonemptyString.max(200)
}).passthrough();

const postReferenceSchema = z.object({
  id: z.number().int().positive(),
  link: httpUrl
}).passthrough();

export const wordPressTermsResponseSchema = z.array(termSchema);
export const wordPressPostsResponseSchema = z.array(postReferenceSchema);
export const wordPressPostResponseSchema = postReferenceSchema;

const wordPressErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional()
}).passthrough();

const schemaError = (label: string, error: z.ZodError) => {
  const detail = error.issues
    .slice(0, 5)
    .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid WordPress ${label} response: ${detail}`);
};

export const parseWordPressTermsResponse = (input: unknown) => {
  const parsed = wordPressTermsResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('terms', parsed.error);
  return parsed.data;
};

export const parseWordPressPostsResponse = (input: unknown) => {
  const parsed = wordPressPostsResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('posts', parsed.error);
  return parsed.data;
};

export const parseWordPressPostResponse = (input: unknown): WordPressPost => {
  const parsed = wordPressPostResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('post creation', parsed.error);
  return parsed.data;
};

const parseWordPressErrorDetail = (input: string) => {
  const bounded = input.slice(0, 2_000);
  try {
    const parsed = wordPressErrorSchema.safeParse(JSON.parse(bounded));
    if (parsed.success && parsed.data.message?.trim()) return parsed.data.message.trim().slice(0, 500);
  } catch {
    // Fall back to bounded plain text below.
  }
  return bounded.trim().slice(0, 500);
};

export class WordPressClient {
  constructor(private readonly settings: {
    baseUrl: string;
    username: string;
    password: string;
    status: string;
    allowHttp: boolean;
  }) {}

  private headers() {
    return {
      authorization: `Basic ${Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')}`,
      'content-type': 'application/json'
    };
  }

  private url(path: string) {
    return `${this.settings.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2${path}`;
  }

  private async json(response: Response, label: string): Promise<unknown> {
    if (!response.ok) {
      const detail = parseWordPressErrorDetail(await response.text());
      throw new Error(`${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  }

  private async termIds(kind: 'categories' | 'tags', names: string[]) {
    const ids: number[] = [];
    for (const name of names) {
      const response = await fetch(`${this.url(`/${kind}`)}?search=${encodeURIComponent(name)}&per_page=100`, { headers: this.headers() });
      const terms = parseWordPressTermsResponse(await this.json(response, `WordPress ${kind} lookup`));
      const exact = terms.find(term => term.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'));
      if (exact) ids.push(exact.id);
    }
    return [...new Set(ids)];
  }

  async existingBySlug(slug: string): Promise<WordPressPost | undefined> {
    const response = await fetch(`${this.url('/posts')}?slug=${encodeURIComponent(slug)}&context=edit&status=any`, { headers: this.headers() });
    const posts = parseWordPressPostsResponse(await this.json(response, 'WordPress duplicate lookup'));
    return posts[0];
  }

  async post(draftInput: unknown): Promise<WordPressPost> {
    // Validate fields, article structure, Markdown tokens, and rendered HTML before the first WordPress request.
    const { draft, html } = renderBlogHtml(draftInput);
    const existing = await this.existingBySlug(draft.slug);
    if (existing) return existing;

    const [categories, tags] = await Promise.all([
      this.termIds('categories', draft.categories),
      this.termIds('tags', draft.tags)
    ]);
    const response = await fetch(this.url('/posts'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        title: draft.title,
        content: html,
        excerpt: draft.excerpt,
        slug: draft.slug,
        status: this.settings.status,
        ...(categories.length ? { categories } : {}),
        ...(tags.length ? { tags } : {})
      })
    });
    return parseWordPressPostResponse(await this.json(response, 'WordPress posting'));
  }
}
