import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { config as configFactory } from '../config/index.js';
import { requireWordPress } from '../config/index.js';
import { articlePlanResponseSchema, articleSectionResponseSchema, parseArticlePlan, parseArticleSection, promptForArticlePlan, promptForArticlePlanRepair, promptForArticleSection, promptForArticleSectionRepair, type ArticlePlan } from '../generation/article-generator.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { parseDraft, renderAndValidateArticle, saveDraft, validateStructuredSection, type StructuredSection } from '../generation/article-markdown-renderer.js';
import { loadGenerationCheckpoint, removeGenerationCheckpoint, saveGenerationCheckpoint, type GenerationQualityState } from '../generation/generation-checkpoint.js';
import { articleQualityReviewSchema, locateArticleQualityIssues, parseArticleQualityReview, promptForArticleQualityReview, qualityIssueKey, recordQualityIssueAttempts, requiresCompleteReplacement } from '../generation/article-quality-reviewer.js';
import { LMStudioClient } from '../lmstudio/client.js';
import { parseReview, postedNotification } from '../messaging/imessage.js';
import { createReviewPdf } from '../review/pdf.js';
import { RunLog } from '../log.js';
import { ExcelTracker } from '../tracker/excel-tracker.js';
import { WordPressClient } from '../wordpress/client.js';
import type { BlogRow } from '../domain/blog.js';
import type { MessageAdapter } from '../messaging/types.js';

type Settings = ReturnType<typeof configFactory>;
const writerInstructions = 'Write an accurate, original WordPress blog article as structured JSON. Follow the assigned section boundaries and factual-quality requirements.';
const reviewerInstructions = 'Act as a strict senior factual and editorial reviewer. Produce the complete repair list, but do not rewrite the article. Pass only when nothing material remains to fix.';
const repairInstructions = 'Act as a precise senior article editor. Correct every supplied repair item, preserve sound material when possible, and return the complete repaired section as structured JSON.';

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
    let postedTitle = row.blog_topic;
    let postedUrl = '';
    try {
      await this.tracker.update(blogId, { blog_status: 'posting' });
      if (this.dryRun) { await this.log.write('wordpress.skipped_dry_run', { blog_id: blogId }); return; }
      const draft = await parseDraft(row.markdown_path);
      const post = await new WordPressClient(requireWordPress(this.settings)).post(draft);
      postedTitle = draft.title;
      postedUrl = post.link;
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
      await this.notify(postedNotification(blogId, postedTitle, postedUrl));
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
      try { checkpoint = await loadGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash); }
      catch (error) {
        await this.log.write('workflow.generation_checkpoint_invalid', { blog_id: row.blog_id, error: String(error) });
        await removeGenerationCheckpoint(this.checkpointDirectory, row.blog_id);
      }
      let planValue: ArticlePlan | undefined;
      const sections: StructuredSection[] = [];
      const models = new Set<string>();
      let quality: GenerationQualityState = { review_round: 0, repair_list: [], issue_attempts: {} };
      if (checkpoint) {
        try {
          planValue = checkpoint.plan;
          quality = checkpoint.quality;
          checkpoint.models.forEach(model => models.add(model));
          if (checkpoint.sections.length > format.sections.length || planValue.headings.length !== format.sections.length) throw new Error(`Generation checkpoint does not match format ${format.id}`);
          checkpoint.sections.forEach((section, index) => {
            validateStructuredSection(section, index);
            sections.push(section);
          });
          await this.log.write('workflow.generation_resumed', {
            blog_id: row.blog_id,
            completed_sections: sections.length,
            review_round: quality.review_round,
            pending_repairs: quality.repair_list.length,
            checkpoint_updated_at: checkpoint.updated_at
          });
        } catch (error) {
          await this.log.write('workflow.generation_checkpoint_invalid', { blog_id: row.blog_id, error: String(error) });
          await removeGenerationCheckpoint(this.checkpointDirectory, row.blog_id);
          checkpoint = undefined;
          sections.length = 0;
          models.clear();
          quality = { review_round: 0, repair_list: [], issue_attempts: {} };
        }
      }
      if (!checkpoint) {
        const generatedPlan = await this.lm.generateStructured(
          promptForArticlePlan(row, format),
          articlePlanResponseSchema(format),
          text => parseArticlePlan(text, format),
          { instructions: writerInstructions, operation: 'write' }
        );
        planValue = generatedPlan.value;
        models.add(generatedPlan.model);
        const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash, planValue, sections, models, quality);
        await this.log.write('workflow.generation_checkpoint_saved', { blog_id: row.blog_id, completed_sections: 0, checkpoint: checkpointPath });
      }
      if (!planValue) throw new Error(`Generation plan for Blog #${row.blog_id} was not available`);
      let currentPlan: ArticlePlan = planValue;
      for (let index = sections.length; index < format.sections.length; index++) {
        const definition = format.sections[index];
        await this.log.write('workflow.section_generation_started', { blog_id: row.blog_id, section: definition.key, section_index: index + 1 });
        const generated = await this.lm.generateStructured(
          promptForArticleSection(row, format, currentPlan, index),
          articleSectionResponseSchema,
          text => {
            const section = { heading: currentPlan.headings[index], ...parseArticleSection(text) };
            validateStructuredSection(section, index);
            return section;
          },
          { instructions: writerInstructions, operation: 'write' }
        );
        models.add(generated.model);
        sections.push(generated.value);
        const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash, currentPlan, sections, models, quality);
        await this.log.write('workflow.generation_checkpoint_saved', { blog_id: row.blog_id, completed_sections: sections.length, checkpoint: checkpointPath });
        await this.log.write('workflow.section_generation_succeeded', { blog_id: row.blog_id, section: definition.key, section_index: index + 1, model: generated.model });
      }

      while (true) {
        if (quality.repair_list.length) {
          const sectionIndexes = [...new Set(quality.repair_list.map(issue => issue.section_index))].sort((a, b) => a - b);
          for (const sectionNumber of sectionIndexes) {
            if (sectionNumber === 0) {
              const issues = quality.repair_list.filter(issue => issue.section_index === 0);
              const replaceEntirePlan = requiresCompleteReplacement(quality.issue_attempts, issues);
              await this.log.write('workflow.article_plan_repair_started', {
                blog_id: row.blog_id,
                review_round: quality.review_round,
                issue_ids: issues.map(issue => issue.issue_id),
                issue_categories: issues.map(issue => issue.category),
                replacement: replaceEntirePlan
              });
              const repairedPlan = await this.lm.generateStructured(
                promptForArticlePlanRepair(row, format, currentPlan, issues, replaceEntirePlan),
                articlePlanResponseSchema(format),
                text => parseArticlePlan(text, format),
                { instructions: repairInstructions, operation: 'repair' }
              );
              currentPlan = repairedPlan.value;
              sections.forEach((section, index) => { section.heading = currentPlan.headings[index]!; });
              models.add(repairedPlan.model);
              quality = { ...quality, repair_list: quality.repair_list.filter(issue => issue.section_index !== 0) };
              const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash, currentPlan, sections, models, quality);
              await this.log.write('workflow.article_plan_repaired', {
                blog_id: row.blog_id,
                review_round: quality.review_round,
                issue_ids: issues.map(issue => issue.issue_id),
                replacement: replaceEntirePlan,
                model: repairedPlan.model,
                checkpoint: checkpointPath
              });
              continue;
            }
            const index = sectionNumber - 1;
            const issues = quality.repair_list.filter(issue => issue.section_index === sectionNumber);
            const replaceEntireSection = requiresCompleteReplacement(quality.issue_attempts, issues);
            await this.log.write('workflow.article_repair_started', {
              blog_id: row.blog_id,
              review_round: quality.review_round,
              section_index: sectionNumber,
              issue_ids: issues.map(issue => issue.issue_id),
              issue_categories: issues.map(issue => issue.category),
              replacement: replaceEntireSection
            });
            const repaired = await this.lm.generateStructured(
              promptForArticleSectionRepair(row, format, currentPlan, index, sections[index]!.content, issues, replaceEntireSection),
              articleSectionResponseSchema,
              text => {
                const section = { heading: currentPlan.headings[index], ...parseArticleSection(text) };
                validateStructuredSection(section, index);
                return section;
              },
              { instructions: repairInstructions, operation: 'repair' }
            );
            sections[index] = repaired.value;
            models.add(repaired.model);
            quality = { ...quality, repair_list: quality.repair_list.filter(issue => issue.section_index !== sectionNumber) };
            const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash, currentPlan, sections, models, quality);
            await this.log.write('workflow.article_section_repaired', {
              blog_id: row.blog_id,
              review_round: quality.review_round,
              section_index: sectionNumber,
              issue_ids: issues.map(issue => issue.issue_id),
              replacement: replaceEntireSection,
              model: repaired.model,
              checkpoint: checkpointPath
            });
          }
          await this.log.write('workflow.article_repair_round_completed', { blog_id: row.blog_id, review_round: quality.review_round });
        }

        const reviewRound = quality.review_round + 1;
        await this.log.write('workflow.article_review_started', { blog_id: row.blog_id, review_round: reviewRound });
        const reviewed = await this.lm.generateStructured(
          promptForArticleQualityReview(row, format, currentPlan, sections),
          articleQualityReviewSchema,
          text => locateArticleQualityIssues(parseArticleQualityReview(text, sections.length), currentPlan, sections),
          { instructions: reviewerInstructions, operation: 'review' }
        );
        models.add(reviewed.model);
        await this.log.write('workflow.article_review_completed', {
          blog_id: row.blog_id,
          review_round: reviewRound,
          verdict: reviewed.value.verdict,
          repair_count: reviewed.value.repair_list.length,
          issue_ids: reviewed.value.repair_list.map(issue => issue.issue_id),
          issue_categories: reviewed.value.repair_list.map(issue => issue.category),
          model: reviewed.model
        });
        if (reviewed.value.verdict === 'pass') {
          quality = { ...quality, review_round: reviewRound, repair_list: [] };
          await this.log.write('workflow.article_quality_passed', { blog_id: row.blog_id, review_round: reviewRound, model: reviewed.model });
          break;
        }

        const attempts = recordQualityIssueAttempts(quality.issue_attempts, reviewed.value.repair_list);
        quality = { review_round: reviewRound, repair_list: reviewed.value.repair_list, issue_attempts: attempts.issue_attempts };
        const checkpointPath = await saveGenerationCheckpoint(this.checkpointDirectory, row, format.format_hash, currentPlan, sections, models, quality);
        await this.log.write('workflow.article_repair_list_saved', {
          blog_id: row.blog_id,
          review_round: reviewRound,
          repair_count: quality.repair_list.length,
          checkpoint: checkpointPath
        });
        if (attempts.stalled_keys.length) {
          const unresolved = quality.repair_list
            .filter(issue => (quality.issue_attempts[qualityIssueKey(issue)] ?? 0) >= 3)
            .map(issue => `${issue.issue_id} (${issue.category}, section ${issue.section_index})`);
          await this.log.write('workflow.article_quality_failed', { blog_id: row.blog_id, review_round: reviewRound, unresolved });
          throw new Error(`Article quality review could not resolve repeated issues: ${unresolved.join(', ')}`);
        }
      }

      const model = [...models].join(', ');
      const article = { ...currentPlan, sections };
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
