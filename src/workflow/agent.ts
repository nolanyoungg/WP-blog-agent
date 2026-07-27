import { existsSync } from 'node:fs';
import type { config as configFactory } from '../config/index.js';
import { requireWordPress } from '../config/index.js';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticleSection } from '../generation/article-generator.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, validateStructuredSection } from '../generation/article-markdown-renderer.js';
import { LMStudioClient } from '../lmstudio/client.js';
import { parseReview } from '../messaging/imessage.js';
import { RunLog } from '../log.js';
import { ExcelTracker } from '../tracker/excel-tracker.js';
import { WordPressClient } from '../wordpress/client.js';
import type { BlogRow } from '../domain/blog.js';
import type { MessageAdapter } from '../messaging/types.js';

type Settings = ReturnType<typeof configFactory>;

export class BlogWorkflow {
  private readonly tracker: ExcelTracker;
  private readonly log: RunLog;
  private readonly lm: LMStudioClient;
  private readonly formats: Promise<ArticleFormatRegistry>;

  constructor(private readonly settings: Settings, private readonly messages: MessageAdapter, private readonly dryRun: boolean) {
    this.tracker = new ExcelTracker(settings.trackerPath);
    this.log = new RunLog(settings.runsDir);
    this.lm = new LMStudioClient(settings.lm, this.log);
    this.formats = ArticleFormatRegistry.load(settings.formatsDir);
  }

  private async notify(text: string, attachment?: string) {
    if (this.dryRun) return this.log.write('imessage.skipped_dry_run', { text, attachment });
    await this.messages.send(text, attachment);
    await this.log.write('imessage.sent', { text, attachment });
  }

  private replyIsCurrent(row: BlogRow, receivedAt: string) {
    const requestedAt = Date.parse(row.blog_created_date ?? '');
    const repliedAt = Date.parse(receivedAt);
    return Number.isFinite(requestedAt) && Number.isFinite(repliedAt) && repliedAt >= requestedAt;
  }

  async processReviews() {
    const awaiting = new Map((await this.tracker.rows()).filter(row => row.blog_status === 'awaiting_review').map(row => [row.blog_id, row]));
    if (!awaiting.size || this.dryRun) return 0;
    const replies = await this.messages.latestReplies();
    let handled = 0;
    for (const reply of replies.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))) {
      if (reply.sender !== this.settings.messaging.recipient) continue;
      const decision = parseReview(reply.text);
      const row = decision ? awaiting.get(decision.blogId) : undefined;
      if (!row || !decision) continue;
      if (!this.replyIsCurrent(row, reply.receivedAt)) {
        await this.log.write('review.ignored_stale', { blog_id: row.blog_id, received_at: reply.receivedAt, requested_at: row.blog_created_date ?? '' });
        continue;
      }
      awaiting.delete(row.blog_id);
      if (decision.decision === 'rejected') {
        await this.tracker.update(row.blog_id, { blog_status: 'rejected', review_status: 'rejected' });
        await this.notify(`Blog draft #${row.blog_id} was rejected. No post was created.`);
        handled++;
        continue;
      }
      await this.tracker.update(row.blog_id, { blog_status: 'approved', review_status: 'approved' });
      await this.postApproved(row.blog_id);
      handled++;
    }
    return handled;
  }

  private async postApproved(blogId: string) {
    const row = (await this.tracker.rows()).find(candidate => candidate.blog_id === blogId);
    if (!row || row.blog_status === 'posted') return;
    if (!row.markdown_path || !existsSync(row.markdown_path)) {
      await this.tracker.update(blogId, { blog_status: 'error' });
      await this.notify(`Blog #${blogId} could not be posted: the draft file is missing.`);
      return;
    }
    try {
      await this.tracker.update(blogId, { blog_status: 'posting' });
      if (this.dryRun) { await this.log.write('wordpress.skipped_dry_run', { blog_id: blogId }); return; }
      const post = await new WordPressClient(requireWordPress(this.settings)).post(await parseDraft(row.markdown_path));
      await this.tracker.update(blogId, { blog_status: 'posted', blog_posted_date: new Date().toISOString(), wordpress_post_id: String(post.id), wordpress_url: post.link });
      await this.log.write('wordpress.posted', { blog_id: blogId, wordpress_post_id: post.id, wordpress_url: post.link });
      await this.notify(`Draft posted! ${post.link}`);
    } catch (error) {
      await this.tracker.update(blogId, { blog_status: 'error' });
      await this.notify(`Blog #${blogId} could not be posted: ${String(error)}`);
      throw error;
    }
  }

  async processNext() {
    await this.processReviews();
    if (!this.dryRun) {
      const approved = (await this.tracker.rows()).find(row => row.blog_status === 'approved');
      if (approved) { await this.log.write('workflow.resuming_approved_post', { blog_id: approved.blog_id }); await this.postApproved(approved.blog_id); return; }
    }
    const formats = await this.formats;
    const row = await this.tracker.claimNext(new Set(formats.ids()));
    if (!row) { await this.log.write('workflow.no_pending_rows'); return; }
    try {
      await this.log.write('workflow.generation_started', { blog_id: row.blog_id });
      const format = formats.get(row.blog_type);
      const plan = await this.lm.generateStructured(promptForArticlePlan(row, format), articlePlanResponseSchema(format), text => parseArticlePlan(text, format));
      const sections = [];
      const models = new Set([plan.model]);
      for (let index = 0; index < format.sections.length; index++) {
        const definition = format.sections[index];
        const target = Math.round(row.blog_length! * definition.word_percentage / 100);
        await this.log.write('workflow.section_generation_started', { blog_id: row.blog_id, section: definition.key, section_index: index + 1 });
        const generated = await this.lm.generateStructured(
          promptForArticleSection(row, format, plan.value, index),
          articleSectionResponseSchema(definition),
          text => {
            const section = { heading: plan.value.headings[index], blocks: parseArticleSection(text, definition) };
            validateStructuredSection(target, definition, section, index);
            return section;
          }
        );
        models.add(generated.model);
        sections.push(generated.value);
        await this.log.write('workflow.section_generation_succeeded', { blog_id: row.blog_id, section: definition.key, section_index: index + 1, model: generated.model });
      }
      const model = [...models].join(', ');
      const article = { ...plan.value, sections };
      const markdown = renderAndValidateArticle(row, format, article);
      const draft = await saveDraft(this.settings.draftsDir, row, markdown, model);
      const requestedAt = new Date().toISOString();
      await this.tracker.update(row.blog_id, { blog_status: 'awaiting_review', review_status: 'pending', review_token: `YES ${row.blog_id} / NO ${row.blog_id}`, markdown_path: draft, model_used: model, blog_created_date: requestedAt });
      await this.notify(`Blog draft #${row.blog_id} is ready: “${row.blog_topic}”\n\nReply exactly:\nYES ${row.blog_id} — post it to WordPress\nNO ${row.blog_id} — reject and stop`, draft);
      await this.log.write('workflow.awaiting_review', { blog_id: row.blog_id, draft, model, review_requested_at: requestedAt });
    } catch (error) {
      await this.tracker.update(row.blog_id, { blog_status: 'error' });
      await this.notify(`Blog #${row.blog_id} could not be generated: ${String(error)}`);
      throw error;
    }
  }
}
