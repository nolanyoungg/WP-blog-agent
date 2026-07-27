import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const articleBlockTypes = ['paragraph', 'ordered_list', 'unordered_list', 'quote', 'table', 'fenced_code'] as const;
export type ArticleBlockType = typeof articleBlockTypes[number];

export interface RequiredBlock {
  type: ArticleBlockType;
  min_count: number;
  language?: string;
}

export interface ArticleFormatSection {
  key: string;
  purpose: string;
  heading_instruction: string;
  content_instruction: string;
  word_percentage: number;
  min_paragraphs: number;
  max_paragraphs: number;
  min_words_per_paragraph: number;
  max_words_per_paragraph: number;
  allowed_blocks: ArticleBlockType[];
  required_blocks: RequiredBlock[];
}

export interface ArticleFormat {
  id: string;
  display_name: string;
  description: string;
  writing_guidance: string;
  sections: ArticleFormatSection[];
  example_markdown: string;
  definition_path: string;
  example_path: string;
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
};
const integer = (value: unknown, label: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} must be a whole number of at least ${minimum}`);
  return Number(value);
};
const number = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
  return value;
};

const blockType = (value: unknown, label: string): ArticleBlockType => {
  const parsed = string(value, label);
  if (!articleBlockTypes.includes(parsed as ArticleBlockType)) throw new Error(`${label} must be one of: ${articleBlockTypes.join(', ')}`);
  return parsed as ArticleBlockType;
};

const parseSection = (value: unknown, index: number, formatId: string): ArticleFormatSection => {
  const label = `Format ${formatId} section ${index + 1}`;
  const raw = object(value, label);
  if (!Array.isArray(raw.allowed_blocks)) throw new Error(`${label}.allowed_blocks must be an array`);
  if (!Array.isArray(raw.required_blocks)) throw new Error(`${label}.required_blocks must be an array`);
  const allowed = raw.allowed_blocks.map((item, itemIndex) => blockType(item, `${label} allowed_blocks[${itemIndex}]`));
  if (!allowed.length) throw new Error(`${label} must allow at least one block type`);
  if (new Set(allowed).size !== allowed.length) throw new Error(`${label} contains duplicate allowed block types`);
  const required = raw.required_blocks.map((item, itemIndex) => {
    const requirement = object(item, `${label} required_blocks[${itemIndex}]`);
    const type = blockType(requirement.type, `${label} required_blocks[${itemIndex}].type`);
    if (!allowed.includes(type)) throw new Error(`${label} requires ${type}, but it is not allowed`);
    const language = requirement.language === undefined || requirement.language === '' ? undefined : string(requirement.language, `${label} required_blocks[${itemIndex}].language`);
    if (language && type !== 'fenced_code') throw new Error(`${label} may set a language only for a fenced_code block`);
    return { type, min_count: integer(requirement.min_count, `${label} required_blocks[${itemIndex}].min_count`, 1), language };
  });
  const requirementKeys = required.map(requirement => `${requirement.type}\0${requirement.language?.toLowerCase() ?? ''}`);
  if (new Set(requirementKeys).size !== requirementKeys.length) throw new Error(`${label} contains duplicate required block rules`);
  const section: ArticleFormatSection = {
    key: string(raw.key, `${label}.key`),
    purpose: string(raw.purpose, `${label}.purpose`),
    heading_instruction: string(raw.heading_instruction, `${label}.heading_instruction`),
    content_instruction: string(raw.content_instruction, `${label}.content_instruction`),
    word_percentage: number(raw.word_percentage, `${label}.word_percentage`),
    min_paragraphs: integer(raw.min_paragraphs, `${label}.min_paragraphs`),
    max_paragraphs: integer(raw.max_paragraphs, `${label}.max_paragraphs`, 1),
    min_words_per_paragraph: integer(raw.min_words_per_paragraph, `${label}.min_words_per_paragraph`, 1),
    max_words_per_paragraph: integer(raw.max_words_per_paragraph, `${label}.max_words_per_paragraph`, 1),
    allowed_blocks: allowed,
    required_blocks: required
  };
  if (section.min_paragraphs > section.max_paragraphs) throw new Error(`${label} min_paragraphs cannot exceed max_paragraphs`);
  if (section.min_words_per_paragraph > section.max_words_per_paragraph) throw new Error(`${label} minimum paragraph words cannot exceed maximum paragraph words`);
  return section;
};

const parseFormat = async (directory: string): Promise<ArticleFormat> => {
  const definitionPath = path.join(directory, 'format.json');
  const examplePath = path.join(directory, 'example.md');
  let raw: Record<string, unknown>;
  let exampleMarkdown: string;
  try { raw = object(JSON.parse(await readFile(definitionPath, 'utf8')), definitionPath); }
  catch (error) { throw new Error(`Could not load ${definitionPath}: ${String(error)}`); }
  try { exampleMarkdown = await readFile(examplePath, 'utf8'); }
  catch (error) { throw new Error(`Could not load ${examplePath}: ${String(error)}`); }
  const id = string(raw.id, `${definitionPath} id`);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Format id ${id} must use lowercase letters, numbers, hyphens, or underscores`);
  if (!Array.isArray(raw.sections)) throw new Error(`Format ${id} sections must be an array`);
  const sections = raw.sections.map((section, index) => parseSection(section, index, id));
  if (!sections.length) throw new Error(`Format ${id} must define at least one section`);
  if (new Set(sections.map(section => section.key)).size !== sections.length) throw new Error(`Format ${id} contains duplicate section keys`);
  const percentage = sections.reduce((sum, section) => sum + section.word_percentage, 0);
  if (Math.abs(percentage - 100) > 0.001) throw new Error(`Format ${id} section word percentages must total 100; received ${percentage}`);
  const headings = exampleMarkdown.match(/^#\s+.+$/gm) ?? [];
  if (headings.length !== sections.length) throw new Error(`Format ${id} example must contain exactly ${sections.length} H1 headings; received ${headings.length}`);
  return {
    id,
    display_name: string(raw.display_name, `${definitionPath} display_name`),
    description: string(raw.description, `${definitionPath} description`),
    writing_guidance: string(raw.writing_guidance, `${definitionPath} writing_guidance`),
    sections,
    example_markdown: exampleMarkdown.trim(),
    definition_path: definitionPath,
    example_path: examplePath
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
