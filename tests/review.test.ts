import test from 'node:test'; import assert from 'node:assert/strict';
import { parseReview, stageMacOSAttachment } from '../src/messaging/imessage.js';
import { createReviewPdf, reviewPdfPath } from '../src/review/pdf.js';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('accepts only an exact review instruction', () => { assert.deepEqual(parseReview(' yes 2 '), { decision: 'approved', blogId: '2' }); assert.deepEqual(parseReview('NO abc-2'), { decision: 'rejected', blogId: 'abc-2' }); assert.equal(parseReview('YES 2 please'), undefined); assert.equal(parseReview('maybe YES 2'), undefined); });

test('stages a same-name attachment in an isolated Messages outbox directory', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-review-'));
  try {
    const source = path.join(dir, 'review.pdf');
    const outbox = path.join(dir, 'outbox');
    await writeFile(source, 'pdf bytes');
    const staged = await stageMacOSAttachment(source, outbox);
    assert.equal(path.basename(staged.path), 'review.pdf');
    assert.notEqual(path.dirname(staged.path), outbox);
    assert.equal(await readFile(staged.path, 'utf8'), 'pdf bytes');
    await staged.cleanup();
    await assert.rejects(stat(staged.path));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('renders a preserved Markdown draft to a PDF review artifact', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-agent-pdf-'));
  try {
    const draft = path.join(dir, 'blog-0007-review.md');
    const markdown = `---\ntitle: "A Useful Review"\nexcerpt: "Review excerpt"\nslug: "useful-review"\ncategories:\n  - "WordPress"\ntags:\n  - "Testing"\n---\n\n# A Useful Review\n\nA paragraph with **important** advice and a [reference](https://example.com).\n\n## Checklist\n\n- First item\n- Second item\n\n\`\`\`ts\nconst ready = true;\n\`\`\`\n`;
    await writeFile(draft, markdown);
    const pdf = await createReviewPdf(draft);
    const contents = await readFile(pdf);
    assert.equal(pdf, reviewPdfPath(draft));
    assert.equal(contents.subarray(0, 5).toString(), '%PDF-');
    assert.ok(contents.length > 1_000);
    assert.equal(await readFile(draft, 'utf8'), markdown);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
