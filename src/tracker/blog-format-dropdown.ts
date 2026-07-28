import XLSX from 'xlsx';
import type { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { ensureBlogFormatDataValidation } from './xlsx-data-validation.js';

const trackerSheetName = 'Blog tracker';
const obsoleteSheetNames = new Set(['SEO Content Plan', 'Blog Formats']);

export const syncBlogFormatDropdown = async (trackerPath: string, registry: ArticleFormatRegistry) => {
  const book = XLSX.readFile(trackerPath, { cellStyles: true });
  if (!book.Sheets[trackerSheetName]) throw new Error(`Workbook must contain a sheet named "${trackerSheetName}"`);

  book.SheetNames = book.SheetNames.filter(name => !obsoleteSheetNames.has(name));
  for (const name of obsoleteSheetNames) delete book.Sheets[name];

  if (book.Workbook?.Names) {
    book.Workbook.Names = book.Workbook.Names.filter(name =>
      name.Name !== 'BlogFormatIds'
      && ![...obsoleteSheetNames].some(sheetName => name.Ref?.includes(`'${sheetName}'!`))
    );
  }

  XLSX.writeFile(book, trackerPath, { cellStyles: true });
  const formatIds = registry.ids();
  await ensureBlogFormatDataValidation(trackerPath, formatIds);
  return formatIds.length;
};
