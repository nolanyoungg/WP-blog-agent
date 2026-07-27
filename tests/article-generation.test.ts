import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticleSection } from '../src/generation/article-generator.js';
import { ArticleFormatRegistry } from '../src/generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, type StructuredArticle } from '../src/generation/article-markdown-renderer.js';

const words = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(' ');

test('format prompt and schema use the selected external definition', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  const format = registry.get('long');
  const row = { blog_topic: 'WordPress performance', blog_length: 1500, blog_type: 'long' };
  const prompt = promptForArticlePlan(row, format);
  assert.match(prompt, /exactly these keys in this order/);
  assert.match(prompt, /10\. conclusion/);
  const schema = articlePlanResponseSchema(format) as any;
  assert.deepEqual(schema.properties.sections.required, format.sections.map(section => section.key));
  assert.deepEqual(Object.keys(schema.properties.sections.properties), format.sections.map(section => section.key));
  const plan = {
    title: 'Reliable WordPress Performance',
    excerpt: 'A practical explanation of dependable WordPress performance work.',
    slug: 'reliable-wordpress-performance',
    categories: ['WordPress'],
    tags: ['performance'],
    headings: format.sections.map((_, index) => `Section ${index + 1}`)
  };
  const sectionPrompt = promptForArticleSection(row, format, plan, 1);
  const sectionSchema = articleSectionResponseSchema(format.sections[1]) as any;
  assert.match(sectionPrompt, /use exactly 2 paragraph blocks of 68-83 words each/i);
  assert.deepEqual(sectionSchema.properties.blocks.items.required, ['type', 'text']);
  assert.deepEqual(sectionSchema.properties.blocks.items.properties.type.enum, ['paragraph']);
});

test('renderer guarantees exactly one H1 per format section', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  const format = registry.get('short');
  const targets = [125, 150, 150, 75];
  const article: StructuredArticle = {
    title: 'Reliable WordPress Performance',
    excerpt: 'A practical explanation of dependable WordPress performance work.',
    slug: 'reliable-wordpress-performance',
    categories: ['WordPress'],
    tags: ['performance'],
    sections: targets.map((target, index) => ({
      heading: index === 0 ? 'Ignored first heading' : `Section ${index + 1}`,
      blocks: [{ type: 'paragraph', text: `${index === 1 ? '# Unexpected heading marker ' : ''}${words(target - (index === 1 ? 3 : 0), `s${index}-`)}`, attribution: '', items: [], headers: [], rows: [], language: '', code: '' }]
    }))
  };
  const markdown = renderAndValidateArticle({ blog_length: 500 }, format, article);
  assert.equal((markdown.match(/^#\s+.+$/gm) ?? []).length, 4);
  assert.doesNotMatch(markdown, /^# Unexpected heading marker$/m);
  const keyedPlan = {
    ...article,
    sections: Object.fromEntries(format.sections.map((section, index) => [section.key, { heading: article.sections[index].heading }]))
  };
  assert.equal(parseArticlePlan(JSON.stringify(keyedPlan), format).headings.length, 4);
  const blocks = [
    { type: 'paragraph', text: words(25, 'first-') },
    { type: 'paragraph', text: words(25, 'second-') }
  ];
  assert.equal(parseArticleSection(JSON.stringify({ blocks }), format.sections[0]).length, 1);
});

test('renderer supports a future fenced-code requirement without counting code comments as H1 headings', async () => {
  const registry = await ArticleFormatRegistry.load(path.resolve('config/blog-formats'));
  const base = registry.get('short');
  const format = {
    ...base,
    id: 'temporary-special',
    sections: base.sections.map((section, index) => index === 1 ? {
      ...section,
      allowed_blocks: [...section.allowed_blocks, 'fenced_code' as const],
      required_blocks: [{ type: 'fenced_code' as const, min_count: 1, language: 'bash' }]
    } : section)
  };
  const targets = [125, 148, 150, 75];
  const article: StructuredArticle = {
    title: 'A Safe Extensible Format',
    excerpt: 'A deterministic test of an externally defined special content block.',
    slug: 'safe-extensible-format',
    categories: ['Testing'],
    tags: ['formats'],
    sections: targets.map((target, index) => ({
      heading: `Section ${index + 1}`,
      blocks: [
        { type: 'paragraph', text: words(target, `p${index}-`), attribution: '', items: [], headers: [], rows: [], language: '', code: '' },
        ...(index === 1 ? [{ type: 'fenced_code' as const, text: '', attribution: '', items: [], headers: [], rows: [], language: 'bash', code: '# generated comment' }] : [])
      ]
    }))
  };
  const markdown = renderAndValidateArticle({ blog_length: 500 }, format, article);
  const schema = articleSectionResponseSchema(format.sections[1]) as any;
  assert.deepEqual(schema.properties.blocks.items.properties.type.enum.sort(), ['fenced_code', 'paragraph']);
  assert.match(markdown, /```bash\n# generated comment\n```/);
  assert.equal((markdown.match(/^#\s+.+$/gm) ?? []).length, 5);
});

test('new draft names are short and existing draft parsing remains compatible', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-draft-'));
  try {
    const markdown = `---\ntitle: "A Clear Title"\nexcerpt: "Useful excerpt"\nslug: "clear-title"\ncategories:\n  - "WordPress"\ntags:\n  - "planning"\n---\n\n# A Clear Title\n\nBody text.`;
    const file = await saveDraft(dir, { row: 2, blog_id: '2', blog_topic: 'A very long source topic name', blog_length: 500, blog_type: 'short', blog_status: 'generating' }, markdown, 'model');
    assert.equal(path.basename(file), 'blog-0002-clear-title.md');
    assert.match(await readFile(file, 'utf8'), /blog_type: "short"/);
    const parsed = await parseDraft(file);
    assert.equal(parsed.title, 'A Clear Title');
    assert.deepEqual(parsed.categories, ['WordPress']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
