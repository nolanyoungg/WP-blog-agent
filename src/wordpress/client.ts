import { marked } from 'marked';
import type { WordPressPost } from '../domain/blog.js';

const comparableHeading = (value: string) => value
  .replace(/<[^>]+>/g, '')
  .replace(/[*_`~]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const renderWordPressContent = (body: string, title: string) => {
  const tokens = marked.lexer(body);
  const firstContent = tokens.findIndex(token => token.type !== 'space');
  const first = firstContent >= 0 ? tokens[firstContent] : undefined;
  if (first?.type === 'heading' && first.depth === 1 && comparableHeading(first.text) === comparableHeading(title)) {
    tokens.splice(firstContent, 1);
  }
  tokens.forEach(token => {
    if (token.type === 'heading' && token.depth === 1) token.depth = 2;
  });
  return marked.parser(tokens)
    .replace(/<table>/g, '<figure class="wp-block-table"><table style="border-collapse:collapse;width:100%">')
    .replace(/<\/table>/g, '</table></figure>')
    .replace(/<th>/g, '<th style="border:1px solid #cbd5e1;padding:0.65em;text-align:left;background-color:#f1f5f9">')
    .replace(/<td>/g, '<td style="border:1px solid #cbd5e1;padding:0.65em;vertical-align:top">');
};

export class WordPressClient {
  constructor(private readonly settings: { baseUrl: string; username: string; password: string; status: string; allowHttp: boolean }) {}
  private headers() { return { authorization: `Basic ${Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')}`, 'content-type': 'application/json' }; }
  private url(path: string) { return `${this.settings.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2${path}`; }
  private async errorText(response: Response) { return (await response.text()).slice(0, 500); }
  private async termIds(kind: 'categories' | 'tags', names: string[]) { const ids: number[] = []; for (const name of names) { const response = await fetch(`${this.url(`/${kind}`)}?search=${encodeURIComponent(name)}&per_page=100`, { headers: this.headers() }); if (!response.ok) throw new Error(`WordPress ${kind} lookup failed: ${response.status}`); const terms = await response.json() as Array<{ id: number; name: string }>; const exact = terms.find(term => term.name.toLowerCase() === name.toLowerCase()); if (exact) ids.push(exact.id); } return ids; }
  async existingBySlug(slug: string): Promise<WordPressPost | undefined> {
    const query = new URLSearchParams({ slug, context: 'edit', per_page: '1' });
    for (const status of ['publish', 'future', 'draft', 'pending', 'private']) query.append('status[]', status);
    const response = await fetch(`${this.url('/posts')}?${query}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`WordPress duplicate lookup failed: ${response.status} ${await this.errorText(response)}`);
    const posts = await response.json() as Array<{ id: number; link: string }>;
    return posts[0] && { id: posts[0].id, link: posts[0].link };
  }
  async post(draft: { body: string; title: string; excerpt: string; slug: string; categories: string[]; tags: string[] }): Promise<WordPressPost> { const existing = await this.existingBySlug(draft.slug); if (existing) return existing; const [categories, tags] = await Promise.all([this.termIds('categories', draft.categories), this.termIds('tags', draft.tags)]); const response = await fetch(this.url('/posts'), { method: 'POST', headers: this.headers(), body: JSON.stringify({ title: draft.title, content: renderWordPressContent(draft.body, draft.title), excerpt: draft.excerpt, slug: draft.slug, status: this.settings.status, ...(categories.length ? { categories } : {}), ...(tags.length ? { tags } : {}) }) }); if (!response.ok) throw new Error(`WordPress posting failed: ${response.status} ${await this.errorText(response)}`); const post = await response.json() as { id: number; link: string }; if (!post.id || !post.link) throw new Error('WordPress response did not include a post ID and URL'); return { id: post.id, link: post.link }; }
}
