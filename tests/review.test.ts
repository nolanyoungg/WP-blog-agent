import test from 'node:test'; import assert from 'node:assert/strict';
import { parseReview, postedNotification, stageMacOSAttachment } from '../src/messaging/imessage.js';
import { createReviewPdf, printable, renderTokens, reviewPdfPath } from '../src/review/pdf.js';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { lexer } from 'marked';
test('accepts only an exact review instruction', () => { assert.deepEqual(parseReview(' yes 2 '), { decision: 'approved', blogId: '2' }); assert.deepEqual(parseReview('NO abc-2'), { decision: 'rejected', blogId: 'abc-2' }); assert.equal(parseReview('YES 2 please'), undefined); assert.equal(parseReview('maybe YES 2'), undefined); });

test('formats a posting confirmation with the generated title and returned WordPress URL', () => {
  assert.equal(
    postedNotification('51', 'A Better Generated Title', 'https://example.test/a-better-generated-title/'),
    'Draft Posted!\n\n#51\n\nA Better Generated Title\n\nhttps://example.test/a-better-generated-title/'
  );
});

test('normalizes common generated symbols for built-in PDF fonts', () => {
  assert.equal(printable('90\u202f% \u2265 80 \u2191 and \u2264 5 \u2193'), '90 % >= 80 up and <= 5 down');
});

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

test('paginates using measured table-row height and restores full-width text after the table', () => {
  const document = new PDFDocument({ size: [320, 220], margins: { top: 20, right: 20, bottom: 20, left: 20 }, bufferPages: true });
  const output = new PassThrough();
  output.resume();
  document.pipe(output);
  const originalText = document.text.bind(document);
  let followingTextX: number | undefined;
  let followingTextWidth: number | undefined;
  document.text = ((value: string, ...args: unknown[]) => {
    if (value === 'Following text must use the normal page width.') {
      followingTextX = document.x;
      const options = args.find(argument => argument && typeof argument === 'object') as PDFKit.Mixins.TextOptions | undefined;
      followingTextWidth = options?.width;
    }
    return (originalText as (...values: unknown[]) => PDFKit.PDFDocument)(value, ...args);
  }) as typeof document.text;
  const tokens = lexer('| First | Second |\n|---|---|\n| A long value that wraps onto several lines | Another wrapped table value |\n\nFollowing text must use the normal page width.');
  document.y = 175;
  renderTokens(document, tokens);
  assert.equal(document.bufferedPageRange().count, 2);
  assert.equal(followingTextX, document.page.margins.left);
  assert.equal(followingTextWidth, document.page.width - document.page.margins.left - document.page.margins.right);
  document.end();
});

test('moves a paragraph that fits on one page instead of leaving an orphan line', () => {
  const document = new PDFDocument({ size: [320, 220], margins: { top: 20, right: 20, bottom: 20, left: 20 }, bufferPages: true });
  const output = new PassThrough();
  output.resume();
  document.pipe(output);
  document.y = 165;
  renderTokens(document, lexer('A complete paragraph should move together when the current page only has room for one line of its text. '.repeat(3)));
  assert.equal(document.bufferedPageRange().count, 2);
  assert.equal(document.x, document.page.margins.left);
  document.end();
});

test('moves a wrapped list item before it can collide with the page footer', () => {
  const document = new PDFDocument({ size: [320, 220], margins: { top: 20, right: 20, bottom: 20, left: 20 }, bufferPages: true });
  const output = new PassThrough();
  output.resume();
  document.pipe(output);
  document.y = 165;
  renderTokens(document, lexer('- A complete list item should move together when its wrapped text cannot fit above the current page footer. '.repeat(2)));
  assert.equal(document.bufferedPageRange().count, 2);
  assert.equal(document.x, document.page.margins.left);
  document.end();
});
