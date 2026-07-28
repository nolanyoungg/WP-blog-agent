import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow } from '../domain/blog.js';
import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';

export interface GenerationCheckpoint {
  version: 1;
  blog_id: string;
  blog_topic: string;
  blog_length: number;
  blog_type: string;
  plan: ArticlePlan;
  sections: StructuredSection[];
  models: string[];
  updated_at: string;
}

const filename = (directory: string, blogId: string) => path.join(directory, `blog-${String(blogId).padStart(4, '0')}.json`);

const matches = (checkpoint: GenerationCheckpoint, row: BlogRow) => checkpoint.version === 1
  && checkpoint.blog_id === row.blog_id
  && checkpoint.blog_topic === row.blog_topic
  && checkpoint.blog_length === row.blog_length
  && checkpoint.blog_type === row.blog_type;

export const loadGenerationCheckpoint = async (directory: string, row: BlogRow): Promise<GenerationCheckpoint | undefined> => {
  try {
    const parsed = JSON.parse(await readFile(filename(directory, row.blog_id), 'utf8')) as GenerationCheckpoint;
    if (!matches(parsed, row) || !parsed.plan || !Array.isArray(parsed.sections) || !Array.isArray(parsed.models)) return undefined;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Could not read generation checkpoint for Blog #${row.blog_id}: ${String(error)}`);
  }
};

export const saveGenerationCheckpoint = async (
  directory: string,
  row: BlogRow,
  plan: ArticlePlan,
  sections: StructuredSection[],
  models: Iterable<string>
) => {
  if (!row.blog_length || !row.blog_type) throw new Error('Cannot checkpoint a blog without length and format');
  await mkdir(directory, { recursive: true });
  const destination = filename(directory, row.blog_id);
  const temporary = `${destination}.${process.pid}.tmp`;
  const checkpoint: GenerationCheckpoint = {
    version: 1,
    blog_id: row.blog_id,
    blog_topic: row.blog_topic,
    blog_length: row.blog_length,
    blog_type: row.blog_type,
    plan,
    sections,
    models: [...models],
    updated_at: new Date().toISOString()
  };
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  return destination;
};

export const removeGenerationCheckpoint = (directory: string, blogId: string) => rm(filename(directory, blogId), { force: true });
