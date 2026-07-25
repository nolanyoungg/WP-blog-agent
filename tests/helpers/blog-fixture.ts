const prose = `A reliable publishing workflow begins with a clear purpose, a defined audience, and source material that can be checked before publication. Editors should separate confirmed facts from assumptions, use concrete language, and keep every recommendation tied to the article topic. A consistent review process also makes revisions easier to understand and reduces accidental changes between drafts.`;

export const validArticleBody = (title = 'A Reliable WordPress Publishing Workflow') => `# ${title}

Use this practical guide to plan, draft, review, and publish a dependable WordPress article without losing editorial context or introducing avoidable risk.

## Introduction

${prose}

${prose}

## Plan the Article

${prose}

${prose}

## Draft and Review Carefully

${prose}

${prose}

## Practical Steps or Examples

${prose}

${prose}

## Conclusion

${prose}

${prose}`;

export const validGeneratedMarkdown = (overrides: {
  title?: string;
  excerpt?: string;
  slug?: string;
  categories?: string[];
  tags?: string[];
  body?: string;
} = {}) => {
  const title = overrides.title ?? 'A Reliable WordPress Publishing Workflow';
  const excerpt = overrides.excerpt ?? 'A practical guide to planning, reviewing, and publishing a dependable WordPress article with clear safety boundaries.';
  const slug = overrides.slug ?? 'reliable-wordpress-publishing-workflow';
  const categories = overrides.categories ?? ['WordPress'];
  const tags = overrides.tags ?? ['publishing', 'workflow'];
  const body = overrides.body ?? validArticleBody(title);
  return `---
title: "${title}"
excerpt: "${excerpt}"
slug: "${slug}"
categories:
${categories.map(value => `  - "${value}"`).join('\n')}
tags:
${tags.map(value => `  - "${value}"`).join('\n')}
---

${body}`;
};

export const validDraftObject = () => ({
  title: 'A Reliable WordPress Publishing Workflow',
  excerpt: 'A practical guide to planning, reviewing, and publishing a dependable WordPress article with clear safety boundaries.',
  slug: 'reliable-wordpress-publishing-workflow',
  categories: ['WordPress'],
  tags: ['publishing', 'workflow'],
  body: validArticleBody()
});
