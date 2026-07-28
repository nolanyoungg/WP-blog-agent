import { readFile } from 'node:fs/promises';

type EditorialSource = { id: string; url: string; note: string };
type EditorialRule = { id: string; topic_patterns: string[]; sources: EditorialSource[] };
type EditorialGuidanceFile = { universal_guidance: string[]; rules: EditorialRule[] };

export interface MatchedEditorialGuidance {
  ruleIds: string[];
  sourceIds: string[];
  prompt: string;
}

const nonEmptyStrings = (value: unknown, label: string) => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`${label} must be an array of non-empty strings`);
  return value.map(item => String(item).trim());
};

const parseGuidance = (raw: unknown): EditorialGuidanceFile => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Editorial guidance must be an object');
  const value = raw as Record<string, unknown>;
  const universal_guidance = nonEmptyStrings(value.universal_guidance, 'universal_guidance');
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
    return { id, topic_patterns, sources };
  });
  return { universal_guidance, rules };
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
    const universal = this.guidance.universal_guidance.map(item => `- ${item}`).join('\n');
    const sourcePacket = sources.length
      ? sources.map(source => `- [${source.id}] ${source.note}\n  Authoritative URL: ${source.url}`).join('\n')
      : '- No topic-specific source was configured. Avoid product-version claims, unsupported benchmarks, and irreversible instructions; write durable general guidance.';
    return {
      ruleIds: rules.map(rule => rule.id),
      sourceIds: sources.map(source => source.id),
      prompt: `Universal editorial constraints:\n${universal}\nAuthoritative source notes:\n${sourcePacket}`
    };
  }
}
