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

const printable = (value: string) => value
  .replaceAll('\u2010', '-')
  .replaceAll('\u2011', '-')
  .replaceAll('\u2012', '-')
  .replaceAll('\u2013', '-')
  .replaceAll('\u2014', '-')
  .replaceAll('\u2018', "'")
  .replaceAll('\u2019', "'")
  .replaceAll('\u201c', '"')
  .replaceAll('\u201d', '"')
  .replaceAll('\u2026', '...');

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

const renderList = (document: PDFKit.PDFDocument, token: Tokens.List) => {
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${Number(token.start || 1) + index}.` : '\u2022';
    const text = inlineText(item.tokens);
    ensureRoom(document, 28);
    document.font('Helvetica-Bold').fontSize(10.5).fillColor(colors.accent).text(marker, 62, document.y, { width: 20 });
    document.font('Helvetica').fontSize(10.5).fillColor(colors.ink).text(text, 84, document.y - document.currentLineHeight(), {
      width: document.page.width - 84 - document.page.margins.right,
      lineGap: 2
    });
    document.moveDown(0.35);
  });
  document.moveDown(0.3);
};

const renderTable = (document: PDFKit.PDFDocument, token: Tokens.Table) => {
  const rows = [token.header, ...token.rows];
  const left = document.page.margins.left;
  const width = document.page.width - left - document.page.margins.right;
  const cellWidth = width / Math.max(token.header.length, 1);
  rows.forEach((row, rowIndex) => {
    ensureRoom(document, 34);
    const top = document.y;
    const values = row.map(cell => inlineText(cell.tokens));
    const height = Math.max(28, ...values.map(value => document.heightOfString(value, { width: cellWidth - 12 })));
    document.save().rect(left, top, width, height).fill(rowIndex === 0 ? '#e8eef8' : rowIndex % 2 ? '#ffffff' : '#f8fafc').restore();
    values.forEach((value, column) => {
      document.font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(colors.ink)
        .text(value, left + column * cellWidth + 6, top + 7, { width: cellWidth - 12, height: height - 10 });
    });
    document.y = top + height;
  });
  document.moveDown(0.7);
};

const renderTokens = (document: PDFKit.PDFDocument, tokens: Token[]) => {
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
        break;
      case 'heading': {
        const heading = token as Tokens.Heading;
        const size = heading.depth === 1 ? 19 : heading.depth === 2 ? 15 : 12;
        ensureRoom(document, heading.depth === 1 ? 110 : size + 50);
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
      case 'text':
        document.font('Helvetica').fontSize(10.5).fillColor(colors.ink)
          .text(inlineText(token.tokens ?? [token]), { align: 'left', lineGap: 3 });
        document.moveDown(0.7);
        break;
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
