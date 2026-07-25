import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { config } from '../src/config/index.js';
import { BlogWorkflow } from '../src/workflow/agent.js';
import type { BlogRow, Message, MessageAdapter } from '../src/types.js';

class TestMessageAdapter implements MessageAdapter {
  readonly sent: Array<{ text: string; attachment?: string }> = [];
  replies: Message[] = [];

  constructor(private readonly failure?: string) {}

  async send(text: string, attachment?: string) {
    this.sent.push({ text, attachment });
    if (this.failure) throw new Error(this.failure);
  }

  async latestReplies() {
    return this.replies;
  }
}

const createTracker = async (file: string, row: Record<string, string>) => {
  const headers = [
    'blog_id', 'blog_topic', 'blog_status', 'blog_created_date', 'blog_posted_date',
    'markdown_path', 'review_status', 'review_token', 'review_requested_at',
    'model_used', 'last_error', 'wordpress_post_id', 'wordpress_url'
  ];
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, headers.map(header => row[header] ?? '')]);
  XLSX.utils.book_append_sheet(book, sheet, 'Blog tracker');
  XLSX.writeFile(book, file);
};

const settingsFor = (dir: string, tracker: string) => config({
  TRACKER_PATH: tracker,
  DRAFTS_DIR: path.join(dir, 'drafts'),
  RUNS_DIR: path.join(dir, 'runs'),
  IMESSAGE_RECIPIENT: '+15555550123',
  LMSTUDIO_BASE_URL: 'http://127.0.0.1:9'
});

test('delivery failure preserves the generated draft and records a retryable state without a secondary send', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-delivery-'));
  try {
    const trackerPath = path.join(dir, 'tracker.xlsx');
    const draftPath = path.join(dir, 'draft.md');
    const draft = '# Persisted draft\n\nThis content must survive delivery failure.\n';
    await writeFile(draftPath, draft, 'utf8');
    await createTracker(trackerPath, {
      blog_id: 'delivery-1',
      blog_topic: 'Recoverable delivery',
      blog_status: 'generating',
      blog_created_date: '2026-07-25T12:00:00.000Z',
      markdown_path: draftPath,
      review_status: 'pending',
      review_token: 'YES delivery-1 / NO delivery-1',
      model_used: 'openai/gpt-oss-20b'
    });
    const messages = new TestMessageAdapter('relay unavailable');
    const workflow = new BlogWorkflow(settingsFor(dir, trackerPath), messages, false);
    const [row] = await (workflow as unknown as { tracker: { rows(): Promise<BlogRow[]> } }).tracker.rows();

    const delivered = await (workflow as unknown as {
      deliverReview(candidate: BlogRow, expectedState: 'generating'): Promise<boolean>;
    }).deliverReview(row, 'generating');

    const [persisted] = await (workflow as unknown as { tracker: { rows(): Promise<BlogRow[]> } }).tracker.rows();
    assert.equal(delivered, false);
    assert.equal(persisted.blog_status, 'blocked_review_delivery');
    assert.equal(persisted.markdown_path, draftPath);
    assert.equal(persisted.model_used, 'openai/gpt-oss-20b');
    assert.equal(persisted.blog_created_date, '2026-07-25T12:00:00.000Z');
    assert.equal(persisted.review_token, 'YES delivery-1 / NO delivery-1');
    assert.equal(persisted.review_requested_at, '');
    assert.equal(persisted.last_error, 'Review delivery failed: relay unavailable');
    assert.equal(await readFile(draftPath, 'utf8'), draft);
    assert.equal(messages.sent.length, 1);
    assert.equal(messages.sent[0].attachment, draftPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a later run retries the existing draft once, refreshes the review timestamp, and does not generate or post', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wp-blog-delivery-'));
  try {
    const trackerPath = path.join(dir, 'tracker.xlsx');
    const draftPath = path.join(dir, 'draft.md');
    const draft = '# Existing draft\n\nRetry this exact artifact.\n';
    await writeFile(draftPath, draft, 'utf8');
    await createTracker(trackerPath, {
      blog_id: 'delivery-2',
      blog_topic: 'Retry without regeneration',
      blog_status: 'blocked_review_delivery',
      blog_created_date: '2026-07-25T12:00:00.000Z',
      markdown_path: draftPath,
      review_status: 'pending',
      review_token: 'YES delivery-2 / NO delivery-2',
      review_requested_at: '',
      model_used: 'openai/gpt-oss-20b',
      last_error: 'Review delivery failed: relay unavailable'
    });
    const messages = new TestMessageAdapter();
    messages.replies = [{ text: 'YES delivery-2', sender: '+15555550123', receivedAt: '2000-01-01T00:00:00.000Z' }];
    const workflow = new BlogWorkflow(settingsFor(dir, trackerPath), messages, false);
    const before = Date.now();

    await workflow.processNext();

    const after = Date.now();
    const [retried] = await (workflow as unknown as { tracker: { rows(): Promise<BlogRow[]> } }).tracker.rows();
    assert.equal(retried.blog_status, 'awaiting_review');
    assert.equal(retried.last_error, '');
    assert.equal(retried.markdown_path, draftPath);
    assert.equal(retried.model_used, 'openai/gpt-oss-20b');
    assert.equal(retried.blog_created_date, '2026-07-25T12:00:00.000Z');
    assert.equal(retried.review_token, 'YES delivery-2 / NO delivery-2');
    assert.ok(Date.parse(retried.review_requested_at ?? '') >= before);
    assert.ok(Date.parse(retried.review_requested_at ?? '') <= after);
    assert.equal(messages.sent.length, 1);
    assert.equal(messages.sent[0].attachment, draftPath);
    assert.equal(await readFile(draftPath, 'utf8'), draft);

    await workflow.processNext();

    const [afterStaleReply] = await (workflow as unknown as { tracker: { rows(): Promise<BlogRow[]> } }).tracker.rows();
    assert.equal(afterStaleReply.blog_status, 'awaiting_review');
    assert.equal(afterStaleReply.wordpress_post_id, '');
    assert.equal(messages.sent.length, 1);
    const runFiles = await readdir(path.join(dir, 'runs'));
    const runLog = await readFile(path.join(dir, 'runs', runFiles[0]), 'utf8');
    assert.doesNotMatch(runLog, /workflow\.generation_started/);
    assert.doesNotMatch(runLog, /wordpress\./);
    assert.match(runLog, /review\.ignored_stale/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
