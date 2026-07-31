import type { BlogRow } from '../domain/blog.js';
import type { ArticleFormat } from './article-format-registry.js';
import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';
import { advertisedSequence, advertisedSequenceRepairSection, extraneousAdvertisedSequenceSection, fulfillsAdvertisedSequence } from './article-assignment.js';
import { findProhibitedPromotionalLanguage, findUnsupportedNumericThresholds, prohibitedPromotionalLanguageGuidance } from './editorial-policy.js';

export const articleQualityCategories = [
  'factual_accuracy',
  'unsupported_certainty',
  'requirements_vs_recommendations',
  'section_scope',
  'repetition_or_contradiction',
  'practical_usefulness',
  'clarity_and_structure',
  'conclusion_quality'
] as const;

export type ArticleQualityCategory = typeof articleQualityCategories[number];

export const articleQualityAuditKeys = [
  'claim_support',
  'headline_fulfillment',
  'enumerated_title',
  'currentness',
  'conclusion_scope',
  'heading_distinctness',
  'substantive_usefulness'
] as const;

export type ArticleQualityAuditKey = typeof articleQualityAuditKeys[number];

export interface ArticleQualityAuditCheck {
  verdict: 'pass' | 'revise';
  evidence: string;
}

export type ArticleQualityAudit = Record<ArticleQualityAuditKey, ArticleQualityAuditCheck>;

export interface ArticleQualityIssue {
  issue_id: string;
  audit_key: ArticleQualityAuditKey;
  section_index: number;
  category: ArticleQualityCategory;
  quoted_text: string;
  problem: string;
  required_change: string;
  acceptance_condition: string;
}

export interface ArticleQualityReview {
  verdict: 'pass' | 'revise';
  audit: ArticleQualityAudit;
  repair_list: ArticleQualityIssue[];
}

export type ArticleRepairAction = 'targeted' | 'reinforced' | 'replace';

export interface CompletedArticleRepair {
  review_round: number;
  section_index: number;
  action: ArticleRepairAction;
  issues: ArticleQualityIssue[];
  model: string;
  completed_at: string;
}

const qualityIssueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    issue_id: { type: 'string' },
    audit_key: { type: 'string', enum: articleQualityAuditKeys },
    section_index: { type: 'integer' },
    category: { type: 'string', enum: articleQualityCategories },
    quoted_text: { type: 'string' },
    problem: { type: 'string' },
    required_change: { type: 'string' },
    acceptance_condition: { type: 'string' }
  },
  required: ['issue_id', 'audit_key', 'section_index', 'category', 'quoted_text', 'problem', 'required_change', 'acceptance_condition']
};

const qualityAuditCheckSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    evidence: { type: 'string' }
  },
  required: ['verdict', 'evidence']
};

export const articleQualityReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    audit: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(articleQualityAuditKeys.map(key => [key, qualityAuditCheckSchema])),
      required: articleQualityAuditKeys
    },
    repair_list: { type: 'array', items: qualityIssueSchema }
  },
  required: ['verdict', 'audit', 'repair_list']
};

const text = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};

export const parseArticleQualityReview = (source: string, sectionCount: number): ArticleQualityReview => {
  let raw: unknown;
  try { raw = JSON.parse(source); }
  catch (error) { throw new Error(`LM Studio returned invalid article quality review JSON: ${String(error)}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Article quality review must be a JSON object');
  const value = raw as Record<string, unknown>;
  if (value.verdict !== 'pass' && value.verdict !== 'revise') throw new Error('Article quality review verdict must be pass or revise');
  if (!value.audit || typeof value.audit !== 'object' || Array.isArray(value.audit)) throw new Error('Article quality review audit must be an object');
  const rawAudit = value.audit as Record<string, unknown>;
  let audit = Object.fromEntries(articleQualityAuditKeys.map(key => {
    const candidate = rawAudit[key];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Article quality audit ${key} must be an object`);
    const check = candidate as Record<string, unknown>;
    if (check.verdict !== 'pass' && check.verdict !== 'revise') throw new Error(`Article quality audit ${key} verdict must be pass or revise`);
    const evidence = typeof check.evidence === 'string' && check.evidence.trim()
      ? check.evidence.trim()
      : check.verdict === 'pass'
        ? 'The reviewer identified no material defect for this audit.'
        : 'The associated repair items identify the material defect.';
    return [key, { verdict: check.verdict, evidence }];
  })) as unknown as ArticleQualityAudit;
  if (!Array.isArray(value.repair_list)) throw new Error('Article quality review repair_list must be an array');
  const parsedRepairs = value.repair_list.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error(`Article quality repair ${index + 1} must be an object`);
    const issue = candidate as Record<string, unknown>;
    const audit_key = text(issue.audit_key, `Article quality repair ${index + 1} audit_key`);
    if (!articleQualityAuditKeys.includes(audit_key as ArticleQualityAuditKey)) throw new Error(`Article quality repair ${index + 1} has invalid audit_key`);
    const section_index = Number(issue.section_index);
    if (!Number.isSafeInteger(section_index) || section_index < 0 || section_index > sectionCount) throw new Error(`Article quality repair ${index + 1} has invalid section_index`);
    const category = text(issue.category, `Article quality repair ${index + 1} category`);
    if (!articleQualityCategories.includes(category as ArticleQualityCategory)) throw new Error(`Article quality repair ${index + 1} has invalid category`);
    return {
      issue_id: text(issue.issue_id, `Article quality repair ${index + 1} issue_id`),
      audit_key: audit_key as ArticleQualityAuditKey,
      section_index,
      category: category as ArticleQualityCategory,
      quoted_text: text(issue.quoted_text, `Article quality repair ${index + 1} quoted_text`),
      problem: text(issue.problem, `Article quality repair ${index + 1} problem`),
      required_change: text(issue.required_change, `Article quality repair ${index + 1} required_change`),
      acceptance_condition: text(issue.acceptance_condition, `Article quality repair ${index + 1} acceptance_condition`)
    };
  });
  const seenIssueIds = new Set<string>();
  const repair_list = parsedRepairs.map((issue, index) => {
    const issue_id = seenIssueIds.has(issue.issue_id) ? `${issue.issue_id}-${index + 1}` : issue.issue_id;
    seenIssueIds.add(issue_id);
    return { ...issue, issue_id };
  });
  let verdict: ArticleQualityReview['verdict'] = value.verdict;
  if (repair_list.length) {
    const repairAuditKeys = new Set(repair_list.map(issue => issue.audit_key));
    audit = Object.fromEntries(articleQualityAuditKeys.map(key => [key, repairAuditKeys.has(key)
      ? {
          verdict: 'revise',
          evidence: audit[key].verdict === 'revise'
            ? audit[key].evidence
            : 'The associated repair items identify the material defect.'
        }
      : audit[key]])) as ArticleQualityAudit;
    verdict = 'revise';
  }
  const revisedAuditKeys = articleQualityAuditKeys.filter(key => audit[key].verdict === 'revise');
  if (verdict === 'pass' && revisedAuditKeys.length) throw new Error(`A passing article quality review must pass every audit check; revise: ${revisedAuditKeys.join(', ')}`);
  if (verdict === 'revise' && !repair_list.length) throw new Error('An article quality review requiring revision must include a repair_list');
  return { verdict, audit, repair_list };
};

export const locateArticleQualityIssues = (
  review: ArticleQualityReview,
  plan: ArticlePlan,
  sections: StructuredSection[],
  assignedTopic: string
): ArticleQualityReview => {
  const locatedRepairListWithDuplicates = review.repair_list.flatMap(issue => {
    const locations: number[] = [];
    const normalizedQuote = normalizedAnchorText(issue.quoted_text);
    if (normalizedAnchorText(JSON.stringify(plan)).includes(normalizedQuote)) locations.push(0);
    sections.forEach((section, index) => {
      if (normalizedAnchorText(`${section.heading}\n${section.content}`).includes(normalizedQuote)) locations.push(index + 1);
    });
    const bodyLocations = locations.filter(location => location > 0);
    if (issue.category === 'conclusion_quality' && bodyLocations.length === 1) {
      return [{ ...issue, section_index: bodyLocations[0]! }];
    }
    if (locations.includes(issue.section_index)) return [issue];
    if (locations.length === 1) return [{ ...issue, section_index: locations[0]! }];

    const candidates = [
      { section_index: 0, content: JSON.stringify(plan) },
      ...sections.map((section, index) => ({ section_index: index + 1, content: `${section.heading}\n${section.content}` }))
    ].map(candidate => ({ ...candidate, score: anchorCoverage(normalizedQuote, normalizedAnchorText(candidate.content)) }))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    if (best && best.score >= 0.75 && (!second || best.score - second.score >= 0.1)) {
      return [{ ...issue, section_index: best.section_index }];
    }
    return [];
  });
  const seenLocatedRepairs = new Set<string>();
  const locatedRepairList = locatedRepairListWithDuplicates.filter(issue => {
    const key = `${issue.section_index}:${issue.audit_key}:${normalizedAnchorText(issue.quoted_text)}`;
    if (seenLocatedRepairs.has(key)) return false;
    seenLocatedRepairs.add(key);
    return true;
  }).filter(issue => !qualityIssueAlreadySatisfied(issue, plan, sections, assignedTopic));
  const promotionalRepairs = findProhibitedPromotionalLanguage(plan, sections)
    .filter(violation => !locatedRepairList.some(issue =>
      issue.section_index === violation.section_index
      && normalizedAnchorText(issue.quoted_text).includes(normalizedAnchorText(violation.matched_text))
    ))
    .map((violation, index): ArticleQualityIssue => ({
      issue_id: `shared-promotional-language-${violation.section_index}-${index + 1}`,
      audit_key: 'claim_support',
      section_index: violation.section_index,
      category: 'unsupported_certainty',
      quoted_text: violation.matched_text,
      problem: `The shared editorial policy prohibits the promotional wording "${violation.policy_label}".`,
      required_change: 'Replace the promotional absolute with concrete, conditional language tied to the relevant requirement, evidence, tradeoff, implementation condition, or reader decision.',
      acceptance_condition: `The repaired article no longer uses "${violation.matched_text}" or a synonymous promotional absolute in this claim.`
    }));
  const numericThresholdsBySection = new Map<number, string[]>();
  for (const violation of findUnsupportedNumericThresholds(plan, sections)) {
    if (locatedRepairList.some(issue =>
      issue.section_index === violation.section_index
      && normalizedAnchorText(issue.quoted_text).includes(normalizedAnchorText(violation.matched_text))
    )) continue;
    const matches = numericThresholdsBySection.get(violation.section_index) ?? [];
    if (!matches.includes(violation.matched_text)) matches.push(violation.matched_text);
    numericThresholdsBySection.set(violation.section_index, matches);
  }
  const numericThresholdRepairs = [...numericThresholdsBySection.entries()]
    .map(([sectionIndex, matches]): ArticleQualityIssue => ({
      issue_id: `unsupported-numeric-threshold-${sectionIndex}`,
      audit_key: 'claim_support',
      section_index: sectionIndex,
      category: 'requirements_vs_recommendations',
      quoted_text: matches[0]!,
      problem: `This section presents unsupported consequential numeric thresholds as generally applicable: ${matches.join(', ')}.`,
      required_change: 'Remove every unsupported prescriptive number in this section or replace it with a reader-specific decision based on verified requirements, measured baseline, or supplied inputs. Do not invent replacement numbers.',
      acceptance_condition: 'The repaired section contains no consequential numeric threshold unless its immediate context explicitly identifies it as hypothetical, reader-supplied, baseline-derived, verified, or governed by current primary documentation.'
    }));
  const promiseRepairs = advertisedPromiseRepairs(assignedTopic, plan, sections);
  const deterministicRepairs = [...promotionalRepairs, ...numericThresholdRepairs, ...promiseRepairs];
  const repair_list = [...deterministicRepairs, ...locatedRepairList];
  if (!repair_list.length) {
    const audit = Object.fromEntries(articleQualityAuditKeys.map(key => [key, {
      verdict: 'pass',
      evidence: review.audit[key].verdict === 'pass'
        ? review.audit[key].evidence
        : 'The proposed repair did not identify a current material defect after deterministic validation.'
    }])) as ArticleQualityAudit;
    return { verdict: 'pass', audit, repair_list: [] };
  }
  const revisedKeys = new Set(repair_list.map(issue => issue.audit_key));
  return {
    ...review,
    verdict: 'revise',
    audit: Object.fromEntries(articleQualityAuditKeys.map(key => [key, revisedKeys.has(key)
      ? {
          verdict: 'revise',
          evidence: key === 'claim_support' && (promotionalRepairs.length || numericThresholdRepairs.length)
            ? [
                promotionalRepairs.length ? `Prohibited promotional wording: ${promotionalRepairs.map(issue => issue.quoted_text).join(', ')}.` : '',
                numericThresholdRepairs.length ? `Unsupported numeric thresholds: ${numericThresholdRepairs.map(issue => issue.quoted_text).join(', ')}.` : ''
              ].filter(Boolean).join(' ')
            : key === 'enumerated_title' && promiseRepairs.length
              ? promiseRepairs.map(issue => issue.problem).join(' ')
            : review.audit[key].evidence
        }
      : review.audit[key]])) as ArticleQualityAudit,
    repair_list
  };
};

const issueLocationText = (issue: ArticleQualityIssue, plan: ArticlePlan, sections: StructuredSection[]) =>
  issue.section_index === 0 ? JSON.stringify(plan) : sections[issue.section_index - 1]?.content ?? '';

const qualityIssueAlreadySatisfied = (
  issue: ArticleQualityIssue,
  plan: ArticlePlan,
  sections: StructuredSection[],
  assignedTopic: string
) => {
  const requested = normalizedAnchorText(`${issue.problem} ${issue.required_change} ${issue.acceptance_condition}`);
  const quote = normalizedAnchorText(issue.quoted_text);
  const promise = advertisedSequence(assignedTopic);
  if (promise
    && (issue.audit_key === 'enumerated_title' || issue.audit_key === 'headline_fulfillment')
    && new RegExp(`\\b${promise.count}\\b`).test(plan.title)
    && fulfillsAdvertisedSequence(assignedTopic, sections)
    && (requested.includes(String(promise.count)) || /\b(numbered|count|checklist|sequence|steps?)\b/.test(requested))) return true;
  if (issue.audit_key === 'enumerated_title') {
    if (promise && /\b(remove|eliminate|drop|weaken|renumber|change)\b/.test(requested) && requested.includes(String(promise.count))) return true;
  }
  if (issue.audit_key === 'claim_support'
    && /\b(unqualified|absolute|guarantee|guaranteed|certainty|inevitability|causal)\b/.test(requested)
    && !/\b(guarantees?|ensures?|always|will)\b/.test(quote)
    && /\b(may|might|could|depends|depending|unless|provided|varies|vary|potentially|not guaranteed|does not guarantee|no guarantee)\b/.test(quote)) return true;
  if (issue.audit_key === 'currentness'
    && /\b(outdated|current|availability|support|verification|verify|version)\b/.test(requested)) {
    const location = normalizedAnchorText(issueLocationText(issue, plan, sections));
    if (/\b(verify|consult|check)\b.{0,100}\b(current|latest|official|primary|documentation|support|availability|version)\b/.test(location)
      || /\b(current|latest|official|primary|documentation|support|availability|version)\b.{0,100}\b(verify|consult|check)\b/.test(location)) return true;
  }
  return false;
};

const advertisedPromiseRepairs = (
  assignedTopic: string,
  plan: ArticlePlan,
  sections: StructuredSection[]
): ArticleQualityIssue[] => {
  const promise = advertisedSequence(assignedTopic);
  if (!promise) return [];
  if (!new RegExp(`\\b${promise.count}\\b`).test(plan.title)) {
    return [{
      issue_id: 'assigned-count-title',
      audit_key: 'enumerated_title',
      section_index: 0,
      category: 'clarity_and_structure',
      quoted_text: plan.title,
      problem: `The title removed the tracker assignment's ${promise.count}-${promise.label} promise.`,
      required_change: `Restore the number ${promise.count} in the title without weakening or renumbering the tracker assignment.`,
      acceptance_condition: `The title visibly preserves the assigned ${promise.count}-${promise.label} promise.`
    }];
  }
  if (fulfillsAdvertisedSequence(assignedTopic, sections)) return [];
  const extraSequenceIndex = extraneousAdvertisedSequenceSection(assignedTopic, sections);
  const index = extraSequenceIndex ?? advertisedSequenceRepairSection(sections, plan);
  const section = sections[index]!;
  const quote = section.content.trim().slice(0, 240);
  const hasCompetingSequence = extraSequenceIndex !== undefined;
  return [{
    issue_id: 'assigned-count-body',
    audit_key: 'enumerated_title',
    section_index: index + 1,
    category: 'practical_usefulness',
    quoted_text: quote,
    problem: hasCompetingSequence
      ? `The body delivers the assigned ${promise.count}-${promise.label} sequence but also contains a competing numbered sequence.`
      : `The body does not contain one coherent sequence with exactly ${promise.count} substantive ${promise.label}.`,
    required_change: hasCompetingSequence
      ? 'Convert the competing numbered sequence in this section to non-numbered prose or bullets without changing the valid advertised sequence elsewhere.'
      : `Create or complete one coherent sequence of exactly ${promise.count} substantive ${promise.label} in this section. Preserve the assigned count and avoid competing numbered sequences.`,
    acceptance_condition: `The article contains exactly one usable, coherent numbered sequence: the assigned ${promise.count} substantive ${promise.label}.`
  }];
};

const normalizedAnchorText = (value: string) => value
  .normalize('NFKC')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`~#>|]/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const anchorCoverage = (normalizedQuote: string, normalizedLocation: string) => {
  const quoteTokens = [...new Set(normalizedQuote.split(' ').filter(token => token.length > 2))];
  if (quoteTokens.length < 3) return 0;
  const locationTokens = new Set(normalizedLocation.split(' '));
  return quoteTokens.filter(token => locationTokens.has(token)).length / quoteTokens.length;
};

export const qualityIssueKey = (issue: Pick<ArticleQualityIssue, 'section_index' | 'audit_key'>) =>
  `${issue.section_index}:${issue.audit_key}`;

export const recordQualityIssueAttempts = (
  current: Record<string, number>,
  issues: ArticleQualityIssue[]
) => {
  const issue_attempts = { ...current };
  for (const key of new Set(issues.map(qualityIssueKey))) issue_attempts[key] = (issue_attempts[key] ?? 0) + 1;
  return issue_attempts;
};

export const repairActionForIssues = (
  issueAttempts: Record<string, number>,
  issues: ArticleQualityIssue[]
): ArticleRepairAction => {
  const attempts = Math.max(0, ...issues.map(issue => issueAttempts[qualityIssueKey(issue)] ?? 0));
  if (attempts >= 2) return 'replace';
  if (attempts >= 1) return 'reinforced';
  return 'targeted';
};

const completedRepairAuditHistory = (completedRepairs: CompletedArticleRepair[]) =>
  completedRepairs
    .filter(repair => repair.review_round === Math.max(0, ...completedRepairs.map(entry => entry.review_round)))
    .map(repair => ({
      review_round: repair.review_round,
      section_index: repair.section_index,
      action: repair.action,
      issues: repair.issues.map(issue => ({
        issue_id: issue.issue_id,
        audit_key: issue.audit_key,
        section_index: issue.section_index,
        category: issue.category,
        problem: issue.problem,
        acceptance_condition: issue.acceptance_condition
      })),
      model: repair.model,
      completed_at: repair.completed_at
    }));

export const promptForArticleQualityReview = (
  row: Pick<BlogRow, 'blog_topic' | 'blog_type'>,
  format: ArticleFormat,
  plan: ArticlePlan,
  sections: StructuredSection[],
  completedRepairs: CompletedArticleRepair[] = []
) => `Act as the final senior editor for a WordPress article before human approval.

Topic: ${row.blog_topic}
Format: ${format.id} (${format.display_name})
Approximate target: ${format.target_words} words. Length is guidance only.
Intended tone: ${format.tone}
Reader expertise: ${format.expertise_level}

Use a material-defect threshold. A repair must change whether a careful business reader would receive an accurate, usable answer. Do not request stylistic polish, extra examples, optional detail, or repeated qualification of advice that is already conditional.

Complete these seven audit checks:
- claim_support: revise only a material factual error, contradiction, guarantee, invented source/statistic, unsupported numeric threshold, or consequential comparison stated as a general fact. Words such as may, might, could, often, typically, easier, faster, scalable, and depends are not defects by themselves. A sentence that explicitly says an outcome depends on context or is not guaranteed is already qualified.
- headline_fulfillment: verify the tracker topic's concrete promises are visibly delivered. Never weaken the tracker assignment. A from-scratch guide needs an executable path; a checklist must be usable; a cost guide needs a method using reader-supplied or verified inputs.
- enumerated_title: when the tracker topic advertises a count, the title must preserve it and the body must contain one coherent sequence with exactly that many substantive items. Never remove or renumber the assigned count.
- currentness: revise a named product or standard only when the article makes a consequential current feature, availability, version, compliance, or support claim without current evidence. Neutral examples are allowed. One clear direction to verify current official documentation is sufficient; do not demand a disclaimer after every product name.
- conclusion_scope: the final section should synthesize the article and end with one useful next action, without opening a new body topic.
- heading_distinctness: headings must be natural, topic-specific, and not duplicated as standalone body labels.
- substantive_usefulness: the article must supply the method, inputs, tradeoffs, or decision criteria promised to the reader. Do not demand arbitrary schedules, quotas, templates, target values, or extra procedures.

${prohibitedPromotionalLanguageGuidance}

Return every material repair needed for the article to pass, while consolidating overlapping findings into one underlying correction. Every repair item must identify its audit_key, quote the smallest exact current text, state one concrete change, and define a verifiable acceptance condition. Do not suggest a new number, source, standard, product, procedure, or claim as the correction. Use section_index 0 only when the correction changes metadata or a planned heading. A complaint about a section's body, including the introduction or conclusion, must use that section's 1-based index even when quoted_text is its heading.

Set verdict "pass" with an empty repair_list when no material correction remains. Set "revise" only when at least one audit check and repair item meet the threshold. The repair writer—not the reviewer—edits the article.

Most recent repair round only:
${JSON.stringify(completedRepairAuditHistory(completedRepairs))}

Article plan:
${JSON.stringify(plan)}

Format section purposes:
${JSON.stringify(format.sections)}

Article sections:
${JSON.stringify(sections)}`;
