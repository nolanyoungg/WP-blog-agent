import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface ArticleFormatSection {
  key: string;
  heading_example: string;
  content_instruction: string;
}

export interface ArticleFormat {
  id: string;
  display_name: string;
  description: string;
  target_words: number;
  writing_guidance: string;
  tone: string;
  expertise_level: string;
  conclusion_guidance: string;
  avoid: string[];
  sections: ArticleFormatSection[];
  format_hash: string;
  definition_path: string;
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};

const positiveInteger = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive whole number`);
  return Number(value);
};

const stringArray = (value: unknown, label: string) => {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  return value.map((item, index) => string(item, `${label} item ${index + 1}`));
};

const parseSections = (value: unknown, formatId: string): ArticleFormatSection[] => {
  if (!Array.isArray(value) || !value.length) throw new Error(`Format ${formatId} sections must be a non-empty array`);
  const sections = value.map((item, index) => {
    const section = object(item, `Format ${formatId} section ${index + 1}`);
    const key = string(section.key, `Format ${formatId} section ${index + 1} key`);
    if (!/^[a-z0-9][a-z0-9_]*$/.test(key)) throw new Error(`Format ${formatId} section key ${key} must use lowercase letters, numbers, or underscores`);
    return {
      key,
      heading_example: string(section.heading_example, `Format ${formatId} section ${index + 1} heading_example`),
      content_instruction: string(section.content_instruction, `Format ${formatId} section ${index + 1} content_instruction`)
    };
  });
  const duplicate = sections.find((section, index) => sections.findIndex(candidate => candidate.key === section.key) !== index);
  if (duplicate) throw new Error(`Format ${formatId} has duplicate section key: ${duplicate.key}`);
  return sections;
};

const parseFormat = async (directory: string): Promise<ArticleFormat> => {
  const definitionPath = path.join(directory, 'format.json');
  let raw: Record<string, unknown>;
  try { raw = object(JSON.parse(await readFile(definitionPath, 'utf8')), definitionPath); }
  catch (error) { throw new Error(`Could not load ${definitionPath}: ${String(error)}`); }
  const id = string(raw.id, `${definitionPath} id`);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Format id ${id} must use lowercase letters, numbers, hyphens, or underscores`);
  const definition = {
    id,
    display_name: string(raw.display_name, `${definitionPath} display_name`),
    description: string(raw.description, `${definitionPath} description`),
    target_words: positiveInteger(raw.target_words, `${definitionPath} target_words`),
    writing_guidance: string(raw.writing_guidance, `${definitionPath} writing_guidance`),
    tone: string(raw.tone, `${definitionPath} tone`),
    expertise_level: string(raw.expertise_level, `${definitionPath} expertise_level`),
    conclusion_guidance: string(raw.conclusion_guidance, `${definitionPath} conclusion_guidance`),
    avoid: stringArray(raw.avoid, `${definitionPath} avoid`),
    sections: parseSections(raw.sections, id)
  };
  return {
    ...definition,
    format_hash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'),
    definition_path: definitionPath
  };
};

export class ArticleFormatRegistry {
  private constructor(readonly directory: string, readonly formats: ReadonlyMap<string, ArticleFormat>) {}

  static async load(directory: string) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { throw new Error(`Could not read blog format directory ${directory}: ${String(error)}`); }
    const discovered: ArticleFormat[] = [];
    for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const folder = path.join(directory, entry.name);
      if (!(await stat(folder)).isDirectory()) continue;
      discovered.push(await parseFormat(folder));
    }
    if (!discovered.length) throw new Error(`No blog formats were found in ${directory}`);
    const duplicate = discovered.find((format, index) => discovered.findIndex(candidate => candidate.id === format.id) !== index);
    if (duplicate) throw new Error(`Duplicate blog format id: ${duplicate.id}`);
    return new ArticleFormatRegistry(directory, new Map(discovered.map(format => [format.id, format])));
  }

  get(id: string | undefined) {
    const normalized = String(id ?? '').trim().toLowerCase();
    const format = this.formats.get(normalized);
    if (!format) throw new Error(`Unknown blog_type "${normalized || '(blank)'}". Available formats: ${this.ids().join(', ')}`);
    return format;
  }

  ids() { return [...this.formats.keys()]; }
  list() { return [...this.formats.values()]; }
}
