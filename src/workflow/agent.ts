import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { config as configFactory } from '../config/index.js';
import { requireWordPress } from '../config/index.js';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticleSection, type ArticlePlan } from '../generation/article-generator.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, validateStructuredSection, type StructuredSection } from '../generation/article-markdown-renderer.js';
import { loadGenerationCheckpoint, removeGenerationCheckpoint, saveGenerationCheckpoint } from '../generation/generation-checkpoint.js';
import { LMStudioClient } from '../lmstudio/client.js';
import { parseReview } from '../messaging/imessage.js';
import { createReviewPdf } from '../review/pdf.js';
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
  private readonly checkpointDirectory: string;

  constructor(private readonly settings: Settings, private readonly messages: MessageAdapter, private readonly dryRun: boolean) {
    this.tracker = new ExcelTracker(settings.trackerPath);
    this.log = new RunLog(settings.runsDir);
    this.lm = new LMStudioClient(settings.lm, this.log);
    this.formats = ArticleFormatRegistry.load(settings.formatsDir);
    const trackerScope = createHash('sha256').update(settings.trackerPath).digest('hex').slice(0, 12);
    this.checkpointDirectory = path.join(settings.checkpointsDir, trackerScope);
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
    } catch (error) {
      await this.tracker.update(blogId, { blog_status: 'error' });
      try {
        await this.notify(`Blog #${blogId} could not be posted: ${String(error)}`);
      } catch (notificationError) {
        await this.log.write('imessage.notification_failed', { blog_id: blogId, notification: 'posting_failure', error: String(notificationError) });
      }
      throw error;
    }
    try {
      await this.notify(`Draft posted! ${(await this.tracker.rows()).find(candidate => candidate.blog_id === blogId)?.wordpress_url ?? ''}`);
    } catch (error) {
      await this.log.write('imessage.notification_failed', { blog_id: blogId, notification: 'posting_success', error: String(error) });
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
    let draftGenerated = false;
    try {
      await this.log.write('workflow.generation_started', { blog_id: row.blog_id });
      const format = formats.get(row.blog_type);
      let checkpoint;
      try { checkpoint = await loadGenerationCheckpoint(this.checkpointDirectory, row, format.template_hash); }
      catch (error) {
        await this.log.write('workflow.generation_checkpoint_invalid', { blog_id: row.blog_id, error: String(error) });
        await removeGenerationCheckpoint(this.checkpointDirectory, row.blog_id);
      }
      let planValue: ArticlePlan | undefined;
      const sections: StructuredSection[] = [];
      const models = new Set<string>();
      if (checkpoint) {
        try {
          planValue = checkpoint.plan;
          checkpoint.models.forEach(model => models.add(model));
          if (checkpoint.sections.length > format.sections.length || planValue.headings.length !== format.sections.length) throw new Error(`Generation checkpoint does not match format ${format.id}`);
          checkpoint.sections.forEach((section, index) => {
            validateStructuredSection(section, index);
            sections.push(section);
          });
          await this.log.write('workflow.generation_resumed', { blog_id: row.blog_id, completed_sections: sections.length, checkpoint_updated_at: checkpoint.updated_at });
        } catch (error) {
          await this.log.write('workflow.generation_checkpoint_invalid', { blog_id: row.blog_id, error: String(error) });
          await removeGenerationCheckpoint(this.checkpointDirectory, row.blog_id);
          checkpoint = undefined;
          sections.length = 0;
          models.clear();
        }
      }
      if (!checkpoint) {
        const generatedPlan = await this.lm.generateStructured(promptForArticlePlan(row, format), articlePlanResponseSchema(format), text => parseArticlePlan(text, format));
        planValue = generatedPlan.value;
        models.add(generatedPlan.model);
        const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.template_hash, planValue, sections, models);
        await this.log.write('workflow.generation_checkpoint_saved', { blog_id: row.blog_id, completed_sections: 0, checkpoint: checkpointPath });
      }
      if (!planValue) throw new Error(`Generation plan for Blog #${row.blog_id} was not available`);
      for (let index = sections.length; index < format.sections.length; index++) {
        const definition = format.sections[index];
        await this.log.write('workflow.section_generation_started', { blog_id: row.blog_id, section: definition.key, section_index: index + 1 });
        const generated = await this.lm.generateStructured(
          promptForArticleSection(row, format, planValue, index),
          articleSectionResponseSchema,
          text => {
            const section = { heading: planValue.headings[index], ...parseArticleSection(text) };
            validateStructuredSection(section, index);
            return section;
          }
        );
        models.add(generated.model);
        sections.push(generated.value);
        const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.template_hash, planValue, sections, models);
        await this.log.write('workflow.generation_checkpoint_saved', { blog_id: row.blog_id, completed_sections: sections.length, checkpoint: checkpointPath });
        await this.log.write('workflow.section_generation_succeeded', { blog_id: row.blog_id, section: definition.key, section_index: index + 1, model: generated.model });
      }
      const model = [...models].join(', ');
      const article = { ...planValue, sections };
      const markdown = renderAndValidateArticle(format, article);
      const draft = await saveDraft(this.settings.draftsDir, row, format, markdown, model);
      draftGenerated = true;
      await removeGenerationCheckpoint(this.checkpointDirectory, row.blog_id);
      await this.log.write('workflow.generation_checkpoint_removed', { blog_id: row.blog_id });
      const reviewPdf = await createReviewPdf(draft);
      await this.log.write('workflow.review_pdf_created', { blog_id: row.blog_id, draft, review_pdf: reviewPdf });
      const requestedAt = new Date().toISOString();
      await this.tracker.update(row.blog_id, { blog_status: 'awaiting_review', review_status: 'pending', review_token: `YES ${row.blog_id} / NO ${row.blog_id}`, markdown_path: draft, model_used: model, blog_created_date: requestedAt });
      await this.notify(`Blog draft #${row.blog_id} is ready: “${row.blog_topic}”\n\nReply exactly:\nYES ${row.blog_id} — post it to WordPress\nNO ${row.blog_id} — reject and stop`, reviewPdf);
      await this.log.write('workflow.awaiting_review', { blog_id: row.blog_id, draft, review_pdf: reviewPdf, model, review_requested_at: requestedAt });
    } catch (error) {
      await this.tracker.update(row.blog_id, { blog_status: 'error' });
      await this.notify(draftGenerated
        ? `Blog draft #${row.blog_id} was generated, but its PDF review attachment could not be prepared or delivered: ${String(error)}`
        : `Blog #${row.blog_id} could not be generated: ${String(error)}`);
      throw error;
    }
  }
}
