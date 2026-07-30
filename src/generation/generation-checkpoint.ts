import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlogRow } from '../domain/blog.js';
import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';
import type { ArticleQualityIssue } from './article-quality-reviewer.js';

export interface GenerationQualityState {
  review_round: number;
  repair_list: ArticleQualityIssue[];
  issue_attempts: Record<string, number>;
}

export interface GenerationCheckpoint {
  version: 5;
  blog_id: string;
  blog_topic: string;
  blog_type: string;
  format_hash: string;
  plan: ArticlePlan;
  sections: StructuredSection[];
  models: string[];
  quality: GenerationQualityState;
  updated_at: string;
}

const filename = (directory: string, blogId: string) => path.join(directory, `blog-${String(blogId).padStart(4, '0')}.json`);

const matches = (checkpoint: GenerationCheckpoint, row: BlogRow, formatHash: string) => checkpoint.version === 5
  && checkpoint.blog_id === row.blog_id
  && checkpoint.blog_topic === row.blog_topic
  && checkpoint.blog_type === row.blog_type
  && checkpoint.format_hash === formatHash;

export const loadGenerationCheckpoint = async (directory: string, row: BlogRow, formatHash: string): Promise<GenerationCheckpoint | undefined> => {
  try {
    const parsed = JSON.parse(await readFile(filename(directory, row.blog_id), 'utf8')) as GenerationCheckpoint;
    if (!matches(parsed, row, formatHash) || !parsed.plan || !Array.isArray(parsed.sections) || !Array.isArray(parsed.models)
      || !parsed.quality || !Number.isSafeInteger(parsed.quality.review_round) || !Array.isArray(parsed.quality.repair_list)
      || !parsed.quality.issue_attempts || typeof parsed.quality.issue_attempts !== 'object') return undefined;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`Could not read generation checkpoint for Blog #${row.blog_id}: ${String(error)}`);
  }
};

export const saveGenerationCheckpoint = async (
  directory: string,
  row: BlogRow,
  formatHash: string,
  plan: ArticlePlan,
  sections: StructuredSection[],
  models: Iterable<string>,
  quality: GenerationQualityState = { review_round: 0, repair_list: [], issue_attempts: {} }
) => {
  if (!row.blog_type) throw new Error('Cannot checkpoint a blog without a format');
  await mkdir(directory, { recursive: true });
  const destination = filename(directory, row.blog_id);
  const temporary = `${destination}.${process.pid}.tmp`;
  const checkpoint: GenerationCheckpoint = {
    version: 5,
    blog_id: row.blog_id,
    blog_topic: row.blog_topic,
    blog_type: row.blog_type,
    format_hash: formatHash,
    plan,
    sections,
    models: [...models],
    quality,
    updated_at: new Date().toISOString()
  };
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  return destination;
};

export const removeGenerationCheckpoint = (directory: string, blogId: string) => rm(filename(directory, blogId), { force: true });
