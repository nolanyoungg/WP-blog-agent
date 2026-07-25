import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseDraft,
  saveDraft,
  validateArticleBody,
  validateGeneratedBlogMarkdown
} from '../src/generation/blog.js';
import { validArticleBody, validGeneratedMarkdown } from './helpers/blog-fixture.js';

test('validates a static Markdown fixture before saving and revalidates the stored draft', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  try {
    const file = await saveDraft(
      dir,
      { row: 2, blog_id: '2', blog_topic: 'WordPress publishing', blog_status: 'generating' },
      validGeneratedMarkdown(),
      'openai/gpt-oss-20b'
    );
    const raw = await readFile(file, 'utf8');
    assert.match(raw, /^---\nblog_id: "2"\ntopic: WordPress publishing\ngenerated_at:/);
    const draft = await parseDraft(file);
    assert.equal(draft.title, 'A Reliable WordPress Publishing Workflow');
    assert.equal(draft.slug, 'reliable-wordpress-publishing-workflow');
    assert.deepEqual(draft.categories, ['WordPress']);
    assert.deepEqual(draft.tags, ['publishing', 'workflow']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects missing, fenced, malformed, duplicate, and incomplete front matter', () => {
  const valid = validGeneratedMarkdown();
  assert.throws(() => validateGeneratedBlogMarkdown(validArticleBody()), /missing required YAML front matter/);
  assert.throws(() => validateGeneratedBlogMarkdown(`\`\`\`yaml\n${valid.slice(4, valid.indexOf('\n---\n'))}\n\`\`\`\n${validArticleBody()}`), /fenced YAML block/);
  assert.throws(() => validateGeneratedBlogMarkdown(valid.replace('title:', 'title "')), /invalid YAML|front matter is invalid/);
  assert.throws(() => validateGeneratedBlogMarkdown(valid.replace('excerpt:', 'title: "Duplicate"\nexcerpt:')), /invalid YAML/);
  assert.throws(() => validateGeneratedBlogMarkdown(valid.replace(/^tags:[\s\S]*?\n---/m, '---')), /tags/);
});

test('rejects unsafe or weak generated Markdown while preserving ordinary prose and links', () => {
  const body = validArticleBody();
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ slug: 'Bad Slug' })), /Slug/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ excerpt: 'Too short' })), /Excerpt/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ categories: [] })), /categories/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ tags: ['workflow', 'WORKFLOW'] })), /Duplicate tag/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown().replace('slug:', 'unexpected: true\nslug:')), /unrecognized key/i);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ body: body.replace('## Conclusion', '<script>alert(1)</script>\n\n## Conclusion') })), /raw HTML/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ body: body.replace('## Conclusion', '[unsafe](javascript:alert(1))\n\n## Conclusion') })), /prohibited link URL/);
  assert.throws(() => validateGeneratedBlogMarkdown(validGeneratedMarkdown({ body: '# A Reliable WordPress Publishing Workflow\n\nToo short.\n\n## Introduction\n\nShort.' })), /meta-description|must contain/);

  const linked = body.replace('source material', '[source material](https://example.com/editorial-guide)');
  assert.equal(validateGeneratedBlogMarkdown(validGeneratedMarkdown({ body: linked })).body, linked);
});

test('requires the expected article title and section progression', () => {
  const body = validArticleBody();
  assert.throws(() => validateArticleBody(body.replace(/^# .+$/m, '# A Different Title'), 'Expected Title'), /must match/);
  assert.throws(() => validateArticleBody(body.replace('## Introduction', '## Opening'), 'A Reliable WordPress Publishing Workflow'), /first level-two section/);
  assert.throws(() => validateArticleBody(body.replace('## Practical Steps or Examples', '## Notes'), 'A Reliable WordPress Publishing Workflow'), /Practical Steps/);
  assert.throws(() => validateArticleBody(body.replace('## Conclusion', '## Summary'), 'A Reliable WordPress Publishing Workflow'), /final level-two section/);
});

test('rejects a stored draft that was tampered with after review delivery', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-'));
  try {
    const file = await saveDraft(
      dir,
      { row: 2, blog_id: '8', blog_topic: 'Tamper test', blog_status: 'generating' },
      validGeneratedMarkdown(),
      'openai/gpt-oss-20b'
    );
    await appendFile(file, '\n<script>window.location = "https://attacker.invalid"</script>\n', 'utf8');
    await assert.rejects(parseDraft(file), /raw HTML/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
