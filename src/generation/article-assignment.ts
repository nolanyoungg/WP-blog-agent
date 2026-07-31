import type { ArticlePlan } from './article-generator.js';
import type { StructuredSection } from './article-markdown-renderer.js';

export interface AdvertisedSequence {
  count: number;
  label: string;
}

const sequencePattern = /\b(\d{1,3})\s+(steps?|ways?|questions?|tips?|items?|reasons?|mistakes?|strategies?|checks?|ideas?|examples?|principles?|practices?)\b/i;
const topPattern = /\btop\s+(\d{1,3})\b/i;

export const advertisedSequence = (topic: string): AdvertisedSequence | undefined => {
  const matched = topic.match(sequencePattern);
  if (matched) return { count: Number(matched[1]), label: matched[2]!.toLowerCase() };
  const top = topic.match(topPattern);
  return top ? { count: Number(top[1]), label: 'items' } : undefined;
};

export const validatePlanAssignment = (topic: string, plan: ArticlePlan) => {
  const promise = advertisedSequence(topic);
  if (promise && !new RegExp(`\\b${promise.count}\\b`).test(plan.title)) {
    throw new Error(`Article title must preserve the assigned ${promise.count}-${promise.label} promise from the tracker topic`);
  }
};

const orderedMarkers = (content: string) => content.split(/\r?\n/)
  .map(line => line.match(/^\s*(?:#{1,6}\s+)?(?:\*\*)?(?:step\s+)?(\d{1,3})(?:[.)]|\s*[:\-])\s+/i))
  .filter((match): match is RegExpMatchArray => Boolean(match))
  .map(match => Number(match[1]));

const hasCompleteExplicitSequence = (numbers: number[], expected: number) => {
  for (let start = 0; start <= numbers.length - expected; start++) {
    if (numbers.slice(start, start + expected).every((number, index) => number === index + 1)) return true;
  }
  return false;
};

export const fulfillsAdvertisedSequence = (topic: string, sections: StructuredSection[]) => {
  const promise = advertisedSequence(topic);
  if (!promise) return true;
  const numbers = sections.flatMap(section => orderedMarkers(section.content));
  return numbers.length === promise.count && numbers.every((number, index) => number === index + 1);
};

export const extraneousAdvertisedSequenceSection = (topic: string, sections: StructuredSection[]) => {
  const promise = advertisedSequence(topic);
  if (!promise) return undefined;
  const markers = sections.flatMap((section, sectionIndex) =>
    orderedMarkers(section.content).map(number => ({ number, sectionIndex }))
  );
  const numbers = markers.map(marker => marker.number);
  for (let start = 0; start <= numbers.length - promise.count; start++) {
    if (!hasCompleteExplicitSequence(numbers.slice(start, start + promise.count), promise.count)) continue;
    return markers.find((_, index) => index < start || index >= start + promise.count)?.sectionIndex;
  }
  return undefined;
};

export const advertisedSequenceRepairSection = (sections: StructuredSection[], plan: ArticlePlan) => {
  const scored = sections.map((section, index) => {
    const heading = plan.headings[index] ?? section.heading;
    const boundaryPenalty = index === 0 || index === sections.length - 1 ? -1000 : 0;
    const purposeScore = /\b(checklist|steps?|mistakes?|questions?|ways?|tips?|readiness)\b/i.test(heading) ? 100 : 0;
    const sequenceScore = orderedMarkers(section.content).length * 20;
    return { index, score: boundaryPenalty + purposeScore + sequenceScore };
  });
  return scored.sort((left, right) => right.score - left.score)[0]?.index ?? 0;
};
