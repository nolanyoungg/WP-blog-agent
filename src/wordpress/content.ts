import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { validateBlogDraft, type BlogDraft } from '../generation/blog.js';

const MAX_RENDERED_HTML_CHARACTERS = 500_000;
const forbiddenTags = new Set([
  'applet', 'audio', 'base', 'button', 'canvas', 'embed', 'form', 'frame', 'frameset',
  'iframe', 'input', 'link', 'math', 'meta', 'object', 'script', 'select', 'source',
  'style', 'svg', 'template', 'textarea', 'track', 'video'
]);
const allowedTags = [
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead',
  'tr', 'ul'
];
const urlAttributes = new Set(['action', 'formaction', 'href', 'poster', 'src', 'srcset', 'xlink:href']);

const unsafeUrl = (value: string) => /^(?:javascript|data|vbscript|file):/i.test(value.replace(/[\u0000-\u0020\u007f]+/g, ''));

export const validateRenderedHtml = (input: unknown): string => {
  const html = z.string().trim().min(1).max(MAX_RENDERED_HTML_CHARACTERS).parse(input);
  if (/<\?(?:php|=)|<%/i.test(html)) throw new Error('Rendered HTML contains a prohibited code-execution tag');

  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title'],
      code: ['class'],
      img: ['alt', 'src', 'title']
    },
    allowedClasses: {
      code: [/^language-[a-z0-9_-]+$/i]
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      '*': (tagName, attributes) => {
        const normalizedTag = tagName.toLowerCase();
        if (forbiddenTags.has(normalizedTag)) throw new Error(`Rendered HTML contains prohibited <${normalizedTag}> content`);
        if (!allowedTags.includes(normalizedTag)) throw new Error(`Rendered HTML contains unsupported <${normalizedTag}> content`);
        for (const [attribute, value] of Object.entries(attributes)) {
          const normalizedAttribute = attribute.toLowerCase();
          if (/^on[a-z]+$/.test(normalizedAttribute)) throw new Error(`Rendered HTML contains prohibited inline event handler ${normalizedAttribute}`);
          if (['style', 'srcdoc', 'xmlns'].includes(normalizedAttribute)) throw new Error(`Rendered HTML contains prohibited ${normalizedAttribute} content`);
          if (urlAttributes.has(normalizedAttribute) && unsafeUrl(value)) throw new Error(`Rendered HTML contains a prohibited executable URL in ${normalizedAttribute}`);
        }
        return { tagName: normalizedTag, attribs: attributes };
      }
    }
  });
};

export const renderBlogHtml = (draftInput: unknown): { draft: BlogDraft; html: string } => {
  const draft = validateBlogDraft(draftInput);
  const rendered = marked.parse(draft.body, { async: false, breaks: false, gfm: true, pedantic: false });
  return { draft, html: validateRenderedHtml(rendered) };
};
