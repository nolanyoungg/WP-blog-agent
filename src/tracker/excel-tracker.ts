import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import type { BlogRow, BlogStatus } from '../domain/blog.js';
import { blogFormatDataValidationIds, ensureBlogFormatDataValidation } from './xlsx-data-validation.js';

const sheetName = 'Blog tracker';
const required = ['blog_id', 'blog_topic', 'blog_length', 'blog_type', 'blog_status', 'blog_created_date', 'blog_posted_date'];
const blogFormatId = (value: unknown) => String(value ?? '').trim().toLowerCase() || undefined;
const blogLength = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export class ExcelTracker {
  constructor(readonly file: string) {}

  private async lock<T>(work: () => Promise<T>): Promise<T> {
    const lock = `${this.file}.lock`;
    await mkdir(path.dirname(this.file), { recursive: true });
    let handle;
    try { handle = await open(lock, 'wx'); return await work(); }
    finally { await handle?.close(); await rm(lock, { force: true }); }
  }

  private read() {
    const book = XLSX.readFile(this.file, { cellStyles: true });
    const sheet = book.Sheets[sheetName];
    if (!sheet) throw new Error(`Workbook must contain a sheet named "${sheetName}"`);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    for (const key of required) if (!(key in (rows[0] ?? {}))) throw new Error(`Workbook is missing required column: ${key}`);
    const ids = rows.map(row => String(row.blog_id).trim()).filter(Boolean);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate) throw new Error(`Workbook contains duplicate blog_id: ${duplicate}`);
    return { book, sheet, rows };
  }

  private async atomic(book: XLSX.WorkBook, fallbackFormatIds?: ReadonlySet<string>) {
    const preservedFormatIds = await blogFormatDataValidationIds(this.file);
    const temp = `${this.file}.${process.pid}.tmp.xlsx`;
    XLSX.writeFile(book, temp, { cellStyles: true });
    const formatIds = preservedFormatIds ?? (fallbackFormatIds ? [...fallbackFormatIds] : undefined);
    if (formatIds?.length) await ensureBlogFormatDataValidation(temp, formatIds);
    XLSX.readFile(temp);
    await rename(temp, this.file);
  }

  async rows(): Promise<BlogRow[]> {
    const { rows } = this.read();
    return rows.map((row, index) => ({ ...row, row: index + 2, blog_id: String(row.blog_id), blog_topic: String(row.blog_topic), blog_length: blogLength(row.blog_length), blog_type: blogFormatId(row.blog_type), blog_status: String(row.blog_status) as BlogStatus }));
  }

  async claimNext(validFormatIds?: ReadonlySet<string>): Promise<BlogRow | undefined> {
    return this.lock(async () => {
      const { book, sheet, rows } = this.read();
      const pending = rows.findIndex(row => String(row.blog_status).toLowerCase() === 'pending');
      const retryableError = rows.findIndex(row => String(row.blog_status).toLowerCase() === 'error' && !String(row.markdown_path ?? '').trim());
      const index = retryableError >= 0 ? retryableError : pending;
      if (index < 0) return undefined;
      const selected = rows[index];
      const length = blogLength(selected.blog_length);
      const formatId = blogFormatId(selected.blog_type);
      if (!length) throw new Error(`blog_id ${String(selected.blog_id)} has an invalid blog_length`);
      if (!formatId || (validFormatIds && !validFormatIds.has(formatId))) throw new Error(`blog_id ${String(selected.blog_id)} has unknown blog_type "${formatId ?? ''}"${validFormatIds ? `. Available formats: ${[...validFormatIds].join(', ')}` : ''}`);
      const row = index + 2;
      this.setCells(sheet, row, { blog_status: 'generating', review_status: 'pending' });
      await this.atomic(book, validFormatIds);
      return { ...selected, row, blog_id: String(selected.blog_id), blog_topic: String(selected.blog_topic), blog_length: length, blog_type: formatId, blog_status: 'generating' as BlogStatus };
    });
  }

  async update(blogId: string, changes: Record<string, string>) {
    return this.lock(async () => {
      const { book, sheet, rows } = this.read();
      const index = rows.findIndex(row => String(row.blog_id) === String(blogId));
      if (index < 0) throw new Error(`blog_id ${blogId} no longer exists in tracker`);
      this.setCells(sheet, index + 2, changes);
      await this.atomic(book);
    });
  }

  private setCells(sheet: XLSX.WorkSheet, row: number, changes: Record<string, string>) {
    const header = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false })[0] ?? [];
    for (const [key, value] of Object.entries(changes)) {
      let col = header.indexOf(key);
      if (col < 0) {
        col = header.length;
        header.push(key);
        sheet[XLSX.utils.encode_cell({ r: 0, c: col })] = { t: 's', v: key };
        const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
        range.e.c = Math.max(range.e.c, col);
        sheet['!ref'] = XLSX.utils.encode_range(range);
      }
      sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })] = { t: 's', v: value };
    }
  }
}
