import { readFile } from 'node:fs/promises';
import type { StructuredSection } from './article-markdown-renderer.js';

type EditorialSource = { id: string; url: string; note: string };
export type EditorialCheck = { id: string; pattern: string; problem: string; required_change: string };
type EditorialRule = { id: string; topic_patterns: string[]; sources: EditorialSource[]; checks: EditorialCheck[] };
type EditorialGuidanceFile = { universal_guidance: string[]; universal_checks: EditorialCheck[]; rules: EditorialRule[] };

export interface MatchedEditorialGuidance {
  ruleIds: string[];
  sourceIds: string[];
  checkIds: string[];
  checks: EditorialCheck[];
  prompt: string;
}

const nonEmptyStrings = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${label} must be an array of non-empty strings`);
  return value.map(item => String(item).trim());
};

const parseChecks = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} item ${index + 1} must be an object`);
    const check = item as Record<string, unknown>;
    const parsed = {
      id: String(check.id ?? '').trim(),
      pattern: String(check.pattern ?? '').trim(),
      problem: String(check.problem ?? '').trim(),
      required_change: String(check.required_change ?? '').trim()
    };
    if (!parsed.id || !parsed.pattern || !parsed.problem || !parsed.required_change) throw new Error(`${label} item ${index + 1} requires id, pattern, problem, and required_change`);
    try { new RegExp(parsed.pattern, 'iu'); }
    catch (error) { throw new Error(`${label} check ${parsed.id} has an invalid pattern: ${String(error)}`); }
    return parsed;
  });
};

const parseGuidance = (raw: unknown): EditorialGuidanceFile => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Editorial guidance must be an object');
  const value = raw as Record<string, unknown>;
  const universal_guidance = nonEmptyStrings(value.universal_guidance, 'universal_guidance');
  const universal_checks = parseChecks(value.universal_checks, 'universal_checks');
  if (!Array.isArray(value.rules)) throw new Error('Editorial guidance rules must be an array');
  const rules = value.rules.map((item, ruleIndex) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Editorial rule ${ruleIndex + 1} must be an object`);
    const rule = item as Record<string, unknown>;
    const id = String(rule.id ?? '').trim();
    if (!id) throw new Error(`Editorial rule ${ruleIndex + 1} requires an id`);
    const topic_patterns = nonEmptyStrings(rule.topic_patterns, `Editorial rule ${id} topic_patterns`);
    if (!Array.isArray(rule.sources) || !rule.sources.length) throw new Error(`Editorial rule ${id} requires sources`);
    const sources = rule.sources.map((sourceItem, sourceIndex) => {
      if (!sourceItem || typeof sourceItem !== 'object' || Array.isArray(sourceItem)) throw new Error(`Editorial rule ${id} source ${sourceIndex + 1} must be an object`);
      const source = sourceItem as Record<string, unknown>;
      const parsed = { id: String(source.id ?? '').trim(), url: String(source.url ?? '').trim(), note: String(source.note ?? '').trim() };
      if (!parsed.id || !parsed.note || !/^https:\/\//.test(parsed.url)) throw new Error(`Editorial rule ${id} source ${sourceIndex + 1} requires id, HTTPS url, and note`);
      return parsed;
    });
    const checks = parseChecks(rule.checks, `Editorial rule ${id} checks`);
    return { id, topic_patterns, sources, checks };
  });
  const ids = [...universal_checks, ...rules.flatMap(rule => rule.checks)].map(check => check.id);
  if (new Set(ids).size !== ids.length) throw new Error('Editorial check IDs must be unique');
  return { universal_guidance, universal_checks, rules };
};

export const findEditorialIssues = (checks: EditorialCheck[], sections: StructuredSection[]) => {
  const issues: Array<{ section_index: number; quoted_claim: string; problem: string; required_change: string }> = [];
  for (const [index, section] of sections.entries()) {
    const content = section.blocks.map(block => block.text ?? block.items?.join(' ') ?? '').join(' ');
    for (const check of checks) {
      const match = new RegExp(check.pattern, 'iu').exec(content);
      if (match?.[0]) issues.push({ section_index: index + 1, quoted_claim: match[0].slice(0, 300), problem: check.problem, required_change: check.required_change });
    }
  }
  return issues;
};

export class EditorialGuidanceRegistry {
  private constructor(private readonly guidance: EditorialGuidanceFile) {}

  static async load(file: string) {
    let raw: unknown;
    try { raw = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { throw new Error(`Could not load editorial guidance ${file}: ${String(error)}`); }
    return new EditorialGuidanceRegistry(parseGuidance(raw));
  }

  forTopic(topic: string): MatchedEditorialGuidance {
    const normalized = topic.toLowerCase();
    const rules = this.guidance.rules.filter(rule => rule.topic_patterns.some(pattern => normalized.includes(pattern.toLowerCase())));
    const sources = rules.flatMap(rule => rule.sources);
    const checks = [...this.guidance.universal_checks, ...rules.flatMap(rule => rule.checks)];
    const universal = this.guidance.universal_guidance.map(item => `- ${item}`).join('\n');
    const sourcePacket = sources.length
      ? sources.map(source => `- [${source.id}] ${source.note}\n  Authoritative URL: ${source.url}`).join('\n')
      : '- No topic-specific source was configured. Avoid product-version claims, unsupported benchmarks, and irreversible instructions; write durable general guidance.';
    const deterministicConstraints = checks.length
      ? checks.map(check => `- [${check.id}] ${check.required_change}`).join('\n')
      : '- No additional deterministic claim pattern is configured.';
    return {
      ruleIds: rules.map(rule => rule.id),
      sourceIds: sources.map(source => source.id),
      checkIds: checks.map(check => check.id),
      checks,
      prompt: `Universal editorial constraints:\n${universal}\nAuthoritative source notes:\n${sourcePacket}\nDeterministic claim constraints:\n${deterministicConstraints}`
    };
  }
}
