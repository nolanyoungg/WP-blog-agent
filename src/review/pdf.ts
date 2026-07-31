import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { lexer, type Token, type Tokens } from 'marked';
import { parseDraft } from '../generation/article-markdown-renderer.js';

const colors = {
  ink: '#172033',
  muted: '#64748b',
  accent: '#2563eb',
  rule: '#dbe3ef',
  code: '#f1f5f9'
};

export const printable = (value: string) => value
  .replaceAll('\u00a0', ' ')
  .replaceAll('\u2010', '-')
  .replaceAll('\u2011', '-')
  .replaceAll('\u2012', '-')
  .replaceAll('\u2013', '-')
  .replace(/\s*\u2014\s*/g, ' - ')
  .replaceAll('\u202f', ' ')
  .replaceAll('\u2018', "'")
  .replaceAll('\u2019', "'")
  .replaceAll('\u201c', '"')
  .replaceAll('\u201d', '"')
  .replaceAll('\u2026', '...')
  .replaceAll('\u2190', '<-')
  .replaceAll('\u2191', 'up')
  .replaceAll('\u2192', '->')
  .replaceAll('\u2193', 'down')
  .replaceAll('\u2212', '-')
  .replaceAll('\u2264', '<=')
  .replaceAll('\u2265', '>=');

const inlineText = (tokens: Token[]): string => printable(tokens.map(token => {
  if (token.type === 'br') return '\n';
  if (token.type === 'image') return token.text || 'Image';
  if (token.type === 'link') {
    const label = inlineText(token.tokens ?? []);
    return token.href && token.href !== label ? `${label} (${token.href})` : label;
  }
  if ('tokens' in token && Array.isArray(token.tokens)) return inlineText(token.tokens);
  return 'text' in token && typeof token.text === 'string' ? token.text : '';
}).join(''));

const ensureRoom = (document: PDFKit.PDFDocument, height: number) => {
  if (document.y + height > document.page.height - document.page.margins.bottom) document.addPage();
};

const roomForFollowingBlock = (document: PDFKit.PDFDocument, tokens: Token[], start: number) => {
  const next = tokens.slice(start).find(token => token.type !== 'space' && token.type !== 'def');
  if (!next) return 0;
  if (next.type === 'paragraph' || next.type === 'text') {
    const left = document.x;
    const width = document.page.width - left - document.page.margins.right;
    document.font('Helvetica').fontSize(10.5);
    return Math.min(120, document.heightOfString(inlineText(next.tokens ?? [next]), { width, align: 'left', lineGap: 3 }));
  }
  if (next.type === 'list' || next.type === 'table' || next.type === 'blockquote' || next.type === 'code') return 64;
  return 0;
};

const renderList = (document: PDFKit.PDFDocument, token: Tokens.List, depth = 0) => {
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${Number(token.start || 1) + index}.` : '\u2022';
    const directTokens = item.tokens.filter(itemToken => itemToken.type !== 'list');
    const nestedLists = item.tokens.filter((itemToken): itemToken is Tokens.List => itemToken.type === 'list');
    const text = inlineText(directTokens).trim();
    const left = document.page.margins.left + depth * 22;
    const markerLeft = left + 6;
    const textLeft = left + 28;
    const textWidth = document.page.width - textLeft - document.page.margins.right;
    if (text) {
      document.font('Helvetica').fontSize(10.5);
      const height = Math.max(document.currentLineHeight(), document.heightOfString(text, { width: textWidth, lineGap: 2 }));
      ensureRoom(document, height + 7);
      const top = document.y;
      document.font('Helvetica-Bold').fontSize(10.5).fillColor(colors.accent).text(marker, markerLeft, top, { width: 20, lineBreak: false });
      document.font('Helvetica').fontSize(10.5).fillColor(colors.ink).text(text, textLeft, top, {
        width: textWidth,
        lineGap: 2
      });
      document.x = left;
      document.y = top + height + 4;
    }
    for (const nestedList of nestedLists) renderList(document, nestedList, depth + 1);
  });
  document.x = document.page.margins.left;
  if (depth === 0) document.moveDown(0.3);
};

export const renderTable = (document: PDFKit.PDFDocument, token: Tokens.Table) => {
  const rows = [token.header, ...token.rows];
  const left = document.page.margins.left;
  const width = document.page.width - left - document.page.margins.right;
  const cellWidth = width / Math.max(token.header.length, 1);
  rows.forEach((row, rowIndex) => {
    const values = row.map(cell => inlineText(cell.tokens));
    const font = rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica';
    document.font(font).fontSize(8.5);
    const height = Math.max(28, ...values.map(value =>
      document.heightOfString(value, { width: cellWidth - 12, lineGap: 1 }) + 14
    ));
    ensureRoom(document, height);
    const top = document.y;
    document.save().rect(left, top, width, height).fill(rowIndex === 0 ? '#e8eef8' : rowIndex % 2 ? '#ffffff' : '#f8fafc').restore();
    values.forEach((value, column) => {
      document.font(font).fontSize(8.5).fillColor(colors.ink)
        .text(value, left + column * cellWidth + 6, top + 7, { width: cellWidth - 12, height: height - 14, lineGap: 1 });
    });
    document.x = left;
    document.y = top + height;
  });
  document.x = left;
  document.moveDown(0.7);
};

export const renderTokens = (document: PDFKit.PDFDocument, tokens: Token[]) => {
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    switch (token.type) {
      case 'space':
      case 'def':
        break;
      case 'heading': {
        const heading = token as Tokens.Heading;
        const size = heading.depth === 1 ? 19 : heading.depth === 2 ? 15 : 12;
        const headingRoom = heading.depth === 1 ? 110 : size + 50;
        ensureRoom(document, headingRoom + roomForFollowingBlock(document, tokens, tokenIndex + 1));
        document.moveDown(heading.depth === 1 ? 0.7 : 0.4);
        document.font('Helvetica-Bold').fontSize(size).fillColor(colors.ink)
          .text(inlineText(heading.tokens), { lineGap: 2 });
        document.moveDown(0.35);
        if (heading.depth === 1) {
          document.save().strokeColor(colors.accent).lineWidth(2).moveTo(document.x, document.y).lineTo(document.x + 54, document.y).stroke().restore();
          document.moveDown(0.55);
        }
        break;
      }
      case 'paragraph':
      case 'text': {
        const text = inlineText(token.tokens ?? [token]);
        const left = document.x;
        const width = document.page.width - left - document.page.margins.right;
        document.font('Helvetica').fontSize(10.5).fillColor(colors.ink);
        const height = document.heightOfString(text, { width, align: 'left', lineGap: 3 });
        const pageContentHeight = document.page.height - document.page.margins.top - document.page.margins.bottom;
        if (height <= pageContentHeight) ensureRoom(document, height);
        document.x = left;
        document.text(text, { width, align: 'left', lineGap: 3 });
        document.moveDown(0.7);
        break;
      }
      case 'list':
        renderList(document, token as Tokens.List);
        break;
      case 'blockquote': {
        const blockquote = token as Tokens.Blockquote;
        ensureRoom(document, 48);
        const top = document.y;
        document.save().strokeColor(colors.accent).lineWidth(3).moveTo(document.x, top).lineTo(document.x, top + 42).stroke().restore();
        document.x += 14;
        renderTokens(document, blockquote.tokens);
        document.x -= 14;
        break;
      }
      case 'code': {
        const code = printable(token.text);
        const height = document.heightOfString(code, { width: document.page.width - 112 }) + 20;
        ensureRoom(document, Math.min(height, 180));
        const top = document.y;
        document.save().roundedRect(56, top, document.page.width - 112, height, 5).fill(colors.code).restore();
        document.font('Courier').fontSize(8.5).fillColor(colors.ink).text(code, 66, top + 10, {
          width: document.page.width - 132,
          lineGap: 2
        });
        document.y = top + height + 10;
        break;
      }
      case 'table':
        renderTable(document, token as Tokens.Table);
        break;
      case 'hr':
        document.moveDown(0.4);
        document.save().strokeColor(colors.rule).lineWidth(1).moveTo(document.x, document.y).lineTo(document.page.width - document.page.margins.right, document.y).stroke().restore();
        document.moveDown(0.8);
        break;
      case 'html':
        document.font('Helvetica').fontSize(10.5).fillColor(colors.ink)
          .text(printable(token.text.replace(/<[^>]+>/g, '')), { lineGap: 3 });
        document.moveDown(0.7);
        break;
      default:
        if ('tokens' in token && Array.isArray(token.tokens)) renderTokens(document, token.tokens);
    }
  }
};

export const reviewPdfPath = (markdownPath: string) => path.join(
  path.dirname(markdownPath),
  `${path.basename(markdownPath, path.extname(markdownPath))}.pdf`
);

export const createReviewPdf = async (markdownPath: string, outputPath = reviewPdfPath(markdownPath)) => {
  const draft = await parseDraft(markdownPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const document = new PDFDocument({
    size: 'LETTER',
    margins: { top: 58, right: 56, bottom: 58, left: 56 },
    bufferPages: true,
    info: { Title: draft.title, Subject: 'WordPress blog review draft', Creator: 'WP Blog Agent' }
  });
  const output = createWriteStream(outputPath, { mode: 0o600 });
  const finished = new Promise<void>((resolve, reject) => {
    output.once('finish', resolve);
    output.once('error', reject);
    document.once('error', reject);
  });
  document.pipe(output);

  document.font('Helvetica-Bold').fontSize(9).fillColor(colors.accent).text('WORDPRESS BLOG REVIEW DRAFT');
  document.moveDown(0.75);
  document.font('Helvetica-Bold').fontSize(24).fillColor(colors.ink).text(printable(draft.title), { lineGap: 3 });
  document.moveDown(0.6);
  document.font('Helvetica').fontSize(9).fillColor(colors.muted)
    .text(`Generated for editorial review  |  Source: ${path.basename(markdownPath)}`);
  document.moveDown(1);
  document.save().strokeColor(colors.rule).lineWidth(1).moveTo(document.x, document.y).lineTo(document.page.width - document.page.margins.right, document.y).stroke().restore();
  document.moveDown(0.65);

  const tokens = lexer(draft.body);
  while (tokens[0]?.type === 'space') tokens.shift();
  if (tokens[0]?.type === 'heading' && printable(tokens[0].text).trim() === printable(draft.title).trim()) tokens.shift();
  renderTokens(document, tokens);

  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    document.switchToPage(index);
    const footerY = document.page.height - 38;
    const originalBottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document.strokeColor(colors.rule).lineWidth(0.7).moveTo(56, footerY - 8).lineTo(document.page.width - 56, footerY - 8).stroke();
    document.font('Helvetica').fontSize(8).fillColor(colors.muted)
      .text('WP Blog Agent - Review copy', 56, footerY, { width: 220, lineBreak: false });
    document.font('Helvetica').fontSize(8).fillColor(colors.muted)
      .text(`Page ${index + 1} of ${range.count}`, document.page.width - 156, footerY, { width: 100, align: 'right', lineBreak: false });
    document.page.margins.bottom = originalBottomMargin;
  }

  document.end();
  await finished;
  return outputPath;
};
