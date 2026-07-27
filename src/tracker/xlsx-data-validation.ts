import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const trackerSheetName = 'Blog tracker';
const validationRange = 'D2:D1000';
const validationXml = `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${validationRange}"><formula1>BlogFormatIds</formula1></dataValidation>`;

const xmlAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1];
};

const trackerWorksheetPath = (files: Record<string, Uint8Array>) => {
  const workbook = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array());
  const sheet = (workbook.match(/<sheet\b[^>]*\/>/g) ?? []).find(tag => xmlAttribute(tag, 'name') === trackerSheetName);
  const relationshipId = sheet ? xmlAttribute(sheet, 'r:id') : undefined;
  if (!relationshipId) throw new Error(`Could not find the "${trackerSheetName}" worksheet relationship`);

  const relationships = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());
  const relationship = (relationships.match(/<Relationship\b[^>]*\/>/g) ?? []).find(tag => xmlAttribute(tag, 'Id') === relationshipId);
  const target = relationship ? xmlAttribute(relationship, 'Target') : undefined;
  if (!target) throw new Error(`Could not resolve the "${trackerSheetName}" worksheet file`);
  return target.startsWith('/') ? target.slice(1) : path.posix.normalize(`xl/${target}`);
};

const withBlogFormatValidation = (worksheet: string) => {
  const existing = worksheet.match(/<dataValidations\b[^>]*>([\s\S]*?)<\/dataValidations>/);
  if (existing) {
    const otherRules = (existing[1].match(/<dataValidation\b[^>]*>[\s\S]*?<\/dataValidation>/g) ?? [])
      .filter(rule => xmlAttribute(rule.match(/^<dataValidation\b[^>]*>/)?.[0] ?? '', 'sqref') !== validationRange);
    const rules = [...otherRules, validationXml];
    return worksheet.replace(existing[0], `<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`);
  }
  if (!worksheet.includes('</sheetData>')) throw new Error(`Could not add ${trackerSheetName} data validation: sheetData is missing`);
  return worksheet.replace('</sheetData>', `</sheetData><dataValidations count="1">${validationXml}</dataValidations>`);
};

export const hasBlogFormatDataValidation = async (file: string) => {
  const files = unzipSync(new Uint8Array(await readFile(file)));
  const worksheetPath = trackerWorksheetPath(files);
  const worksheet = strFromU8(files[worksheetPath] ?? new Uint8Array());
  return worksheet.includes(`sqref="${validationRange}"`) && worksheet.includes('<formula1>BlogFormatIds</formula1>');
};

export const ensureBlogFormatDataValidation = async (file: string) => {
  const files = unzipSync(new Uint8Array(await readFile(file)));
  const worksheetPath = trackerWorksheetPath(files);
  const worksheet = files[worksheetPath];
  if (!worksheet) throw new Error(`Workbook is missing ${worksheetPath}`);
  files[worksheetPath] = strToU8(withBlogFormatValidation(strFromU8(worksheet)));
  const temporary = `${file}.${process.pid}.validation.tmp`;
  await writeFile(temporary, zipSync(files, { level: 6 }));
  await rename(temporary, file);
};
