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
  sections: ArticleFormatSection[];
  template_markdown: string;
  template_hash: string;
  definition_path: string;
  template_path: string;
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

const parseTemplateSections = (markdown: string, formatId: string): ArticleFormatSection[] => {
  const headings = [...markdown.matchAll(/^#\s+(.+)$/gm)];
  if (!headings.length) throw new Error(`Format ${formatId} template must contain at least one H1 section`);
  return headings.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    const instruction = markdown.slice(start, end).trim();
    if (!instruction) throw new Error(`Format ${formatId} template section ${index + 1} must contain a writing instruction`);
    return {
      key: `section_${index + 1}`,
      heading_example: match[1].trim(),
      content_instruction: instruction
    };
  });
};

const parseFormat = async (directory: string): Promise<ArticleFormat> => {
  const definitionPath = path.join(directory, 'format.json');
  const templatePath = path.join(directory, 'example.md');
  let raw: Record<string, unknown>;
  let templateMarkdown: string;
  try { raw = object(JSON.parse(await readFile(definitionPath, 'utf8')), definitionPath); }
  catch (error) { throw new Error(`Could not load ${definitionPath}: ${String(error)}`); }
  try { templateMarkdown = (await readFile(templatePath, 'utf8')).trim(); }
  catch (error) { throw new Error(`Could not load ${templatePath}: ${String(error)}`); }
  const id = string(raw.id, `${definitionPath} id`);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Format id ${id} must use lowercase letters, numbers, hyphens, or underscores`);
  return {
    id,
    display_name: string(raw.display_name, `${definitionPath} display_name`),
    description: string(raw.description, `${definitionPath} description`),
    target_words: positiveInteger(raw.target_words, `${definitionPath} target_words`),
    writing_guidance: string(raw.writing_guidance, `${definitionPath} writing_guidance`),
    sections: parseTemplateSections(templateMarkdown, id),
    template_markdown: templateMarkdown,
    template_hash: createHash('sha256').update(templateMarkdown).digest('hex'),
    definition_path: definitionPath,
    template_path: templatePath
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
