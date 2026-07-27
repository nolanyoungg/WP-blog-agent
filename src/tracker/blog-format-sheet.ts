import path from 'node:path';
import XLSX from 'xlsx';
import type { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { ensureBlogFormatDataValidation } from './xlsx-data-validation.js';

const formatSheetName = 'Blog Formats';

export const syncBlogFormatSheet = async (trackerPath: string, registry: ArticleFormatRegistry) => {
  const book = XLSX.readFile(trackerPath, { cellStyles: true });
  const rows = registry.list().map(format => [
    format.id,
    format.display_name,
    format.sections.length,
    format.description,
    format.sections.map((section, index) => `${index + 1}. ${section.key}: ${section.purpose}`).join('\n'),
    format.sections.map(section => `${section.key}: ${section.min_paragraphs}-${section.max_paragraphs} paragraphs, ${section.min_words_per_paragraph}-${section.max_words_per_paragraph} words each`).join('\n'),
    [...new Set(format.sections.flatMap(section => section.allowed_blocks))].join(', '),
    format.sections.flatMap(section => section.required_blocks.map(block => `${section.key}: ${block.min_count} ${block.type}${block.language ? ` (${block.language})` : ''}`)).join('\n') || 'None',
    path.relative(process.cwd(), format.example_path)
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['format_id', 'display_name', 'h1_count', 'description', 'section_outline', 'paragraph_rules', 'allowed_blocks', 'required_blocks', 'example_file'],
    ...rows
  ]);
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:I1');
  for (let column = range.s.c; column <= range.e.c; column++) {
    const header = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (header) header.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1F4E78' } }, alignment: { vertical: 'center', wrapText: true } };
  }
  for (let row = 1; row <= range.e.r; row++) {
    for (let column = range.s.c; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.s = { alignment: { vertical: 'top', wrapText: true } };
    }
  }
  sheet['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 11 }, { wch: 48 }, { wch: 64 }, { wch: 56 }, { wch: 44 }, { wch: 36 }, { wch: 48 }];
  sheet['!rows'] = [{ hpt: 28 }, ...registry.list().map(format => ({ hpt: Math.max(110, format.sections.length * 22) }))];
  sheet['!freeze'] = { xSplit: 1, ySplit: 1, topLeftCell: 'B2', activePane: 'bottomRight', state: 'frozen' } as any;
  sheet['!autofilter'] = { ref: `A1:I${rows.length + 1}` };
  if (book.Sheets[formatSheetName]) book.Sheets[formatSheetName] = sheet;
  else XLSX.utils.book_append_sheet(book, sheet, formatSheetName);

  book.Workbook ??= {};
  const names = (book.Workbook.Names ?? []).filter(name => name.Name !== 'BlogFormatIds');
  names.push({ Name: 'BlogFormatIds', Ref: `'${formatSheetName}'!$A$2:$A$${rows.length + 1}` });
  book.Workbook.Names = names;
  const tracker = book.Sheets['Blog tracker'];
  if (!tracker) throw new Error('Workbook must contain a sheet named "Blog tracker"');
  XLSX.writeFile(book, trackerPath, { cellStyles: true });
  await ensureBlogFormatDataValidation(trackerPath);
  return rows.length;
};
