import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const trackerSheetName = 'Blog tracker';
const validationRange = 'C2:C1000';
const inlineFormula = (formatIds: readonly string[]) => {
  if (!formatIds.length) throw new Error('At least one blog format ID is required for tracker validation');
  const formula = `"${formatIds.join(',')}"`;
  if (formula.length > 255) throw new Error('Blog format IDs exceed Excel’s 255-character inline dropdown limit');
  return formula;
};
const validationXml = (formatIds: readonly string[], prefix = '') =>
  `<${prefix}dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${validationRange}"><${prefix}formula1>${inlineFormula(formatIds)}</${prefix}formula1></${prefix}dataValidation>`;

const xmlAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1];
};

const trackerWorksheetPath = (files: Record<string, Uint8Array>) => {
  const workbook = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array());
  const sheet = (workbook.match(/<(?:[A-Za-z_][\w.-]*:)?sheet\b[^>]*\/>/g) ?? []).find(tag => xmlAttribute(tag, 'name') === trackerSheetName);
  const relationshipId = sheet ? xmlAttribute(sheet, 'r:id') : undefined;
  if (!relationshipId) throw new Error(`Could not find the "${trackerSheetName}" worksheet relationship`);

  const relationships = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());
  const relationship = (relationships.match(/<Relationship\b[^>]*\/>/g) ?? []).find(tag => xmlAttribute(tag, 'Id') === relationshipId);
  const target = relationship ? xmlAttribute(relationship, 'Target') : undefined;
  if (!target) throw new Error(`Could not resolve the "${trackerSheetName}" worksheet file`);
  return target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`);
};

const withBlogFormatValidation = (worksheet: string, formatIds: readonly string[]) => {
  const existing = worksheet.match(/<(?:[A-Za-z_][\w.-]*:)?dataValidations\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?dataValidations>/);
  if (existing) {
    const prefix = existing[0].match(/^<([A-Za-z_][\w.-]*:)?dataValidations/)?.[1] ?? '';
    const otherRules = (existing[1].match(/<(?:[A-Za-z_][\w.-]*:)?dataValidation\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?dataValidation>/g) ?? [])
      .filter(rule => xmlAttribute(rule.match(/^<(?:[A-Za-z_][\w.-]*:)?dataValidation\b[^>]*>/)?.[0] ?? '', 'sqref') !== validationRange);
    const rules = [...otherRules, validationXml(formatIds, prefix)];
    return worksheet.replace(existing[0], `<${prefix}dataValidations count="${rules.length}">${rules.join('')}</${prefix}dataValidations>`);
  }
  const sheetDataEnd = worksheet.match(/<\/([A-Za-z_][\w.-]*:)?sheetData>/);
  if (!sheetDataEnd) throw new Error(`Could not add ${trackerSheetName} data validation: sheetData is missing`);
  const prefix = sheetDataEnd[1] ?? '';
  return worksheet.replace(sheetDataEnd[0], `${sheetDataEnd[0]}<${prefix}dataValidations count="1">${validationXml(formatIds, prefix)}</${prefix}dataValidations>`);
};

export const blogFormatDataValidationIds = async (file: string) => {
  const files = unzipSync(new Uint8Array(await readFile(file)));
  const worksheetPath = trackerWorksheetPath(files);
  const worksheet = strFromU8(files[worksheetPath] ?? new Uint8Array());
  const rules = worksheet.match(/<(?:[A-Za-z_][\w.-]*:)?dataValidation\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?dataValidation>/g) ?? [];
  const rule = rules.find(candidate => xmlAttribute(candidate.match(/^<(?:[A-Za-z_][\w.-]*:)?dataValidation\b[^>]*>/)?.[0] ?? '', 'sqref') === validationRange);
  const formula = rule?.match(/<(?:[A-Za-z_][\w.-]*:)?formula1>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?formula1>/)?.[1];
  return formula?.startsWith('"') && formula.endsWith('"') ? formula.slice(1, -1).split(',').filter(Boolean) : undefined;
};

export const hasBlogFormatDataValidation = async (file: string, expectedIds: readonly string[]) => {
  const actual = await blogFormatDataValidationIds(file);
  return actual?.join('\0') === expectedIds.join('\0');
};

export const ensureBlogFormatDataValidation = async (file: string, formatIds: readonly string[]) => {
  const files = unzipSync(new Uint8Array(await readFile(file)));
  const worksheetPath = trackerWorksheetPath(files);
  const worksheet = files[worksheetPath];
  if (!worksheet) throw new Error(`Workbook is missing ${worksheetPath}`);
  files[worksheetPath] = strToU8(withBlogFormatValidation(strFromU8(worksheet), formatIds));
  const temporary = `${file}.${process.pid}.validation.tmp`;
  await writeFile(temporary, zipSync(files, { level: 6 }));
  await rename(temporary, file);
};
