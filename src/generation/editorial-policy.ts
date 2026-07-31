import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';

const prohibitedPromotionalPatterns = [
  { label: 'perfect or perfectly', pattern: /\bperfect(?:ly)?\b/giu },
  { label: 'unmatched', pattern: /\bunmatched\b/giu },
  { label: 'unrivaled', pattern: /\bunrival(?:ed|led)\b/giu },
  { label: 'unparalleled', pattern: /\bunparalleled\b/giu },
  { label: 'flawless or flawlessly', pattern: /\bflawless(?:ly)?\b/giu },
  { label: 'foolproof', pattern: /\bfoolproof\b/giu },
  { label: 'works best', pattern: /\b(?:often\s+)?works?\s+best\b/giu },
  { label: 'best-in-class', pattern: /\bbest(?:-|\s+)in(?:-|\s+)class\b/giu },
  { label: 'the best choice, option, approach, solution, or fit', pattern: /\bthe\s+best\s+(?:choice|option|approach|solution|fit)\b/giu },
  { label: 'ideal or ideally', pattern: /\bideal(?:ly)?\b/giu }
] as const;

export const prohibitedPromotionalLanguageGuidance = `Shared promotional-language policy for every blog format:
- Do not use empty promotional absolutes or superlatives, including perfect, perfectly, unmatched, unrivaled, unparalleled, flawless, flawlessly, foolproof, works best, best-in-class, "the best" choice/option/approach/solution/fit, ideal, or ideally.
- Replace them with concrete, conditional language that names the relevant requirement, evidence, tradeoff, implementation condition, or reader decision.
- This wording is prohibited even when it sounds natural in marketing copy; do not merely swap one prohibited superlative for another.`;

export interface PromotionalLanguageViolation {
  section_index: number;
  matched_text: string;
  policy_label: string;
}

export interface UnsupportedNumericThreshold {
  section_index: number;
  matched_text: string;
}

const consequentialNumberPattern = /(?:\$\s*\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\$?\s*\d+(?:[.,]\d+)?)?|\b\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?\s*(?:%|percent\b|px\b|ms\b|seconds?\b|minutes?\b|hours?\b|days?\b|weeks?\b|months?\b|years?\b))/giu;
const supportedNumericContext = /(?:\b(?:for example|illustrative|hypothetical|scenario|reader[- ]supplied|your input|your baseline|measured baseline|verified (?:input|rate|requirement)|current primary|current official|governing standard)\b|e\.g\.)/i;

const unsupportedThresholdsIn = (value: string, sectionIndex: number): UnsupportedNumericThreshold[] => {
  consequentialNumberPattern.lastIndex = 0;
  return [...value.matchAll(consequentialNumberPattern)].flatMap(match => {
    const matchIndex = match.index ?? 0;
    const currentLineStart = value.lastIndexOf('\n', matchIndex) + 1;
    const start = value.lastIndexOf('\n', Math.max(0, currentLineStart - 2)) + 1;
    const endOfLine = value.indexOf('\n', matchIndex + match[0].length);
    const end = endOfLine === -1 ? value.length : endOfLine;
    return supportedNumericContext.test(value.slice(start, end))
      ? []
      : [{ section_index: sectionIndex, matched_text: match[0] }];
  });
};

const violationsIn = (value: string, sectionIndex: number): PromotionalLanguageViolation[] =>
  prohibitedPromotionalPatterns.flatMap(({ label, pattern }) => {
    pattern.lastIndex = 0;
    return [...value.matchAll(pattern)].map(match => ({
      position: match.index,
      violation: {
        section_index: sectionIndex,
        matched_text: match[0],
        policy_label: label
      }
    }));
  }).sort((left, right) => left.position - right.position)
    .map(match => match.violation);

export const findProhibitedPromotionalLanguage = (
  plan: ArticlePlan,
  sections: StructuredSection[]
): PromotionalLanguageViolation[] => {
  const planText = [plan.title, plan.excerpt, ...plan.headings].join('\n');
  return [
    ...violationsIn(planText, 0),
    ...sections.flatMap((section, index) => violationsIn(section.content, index + 1))
  ];
};

export const findUnsupportedNumericThresholds = (
  plan: ArticlePlan,
  sections: StructuredSection[]
): UnsupportedNumericThreshold[] => {
  const planText = [plan.title, plan.excerpt, ...plan.headings].join('\n');
  return [
    ...unsupportedThresholdsIn(planText, 0),
    ...sections.flatMap((section, index) => unsupportedThresholdsIn(section.content, index + 1))
  ];
};
