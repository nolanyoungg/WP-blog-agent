import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWordPressContent } from '../src/wordpress/client.js';

test('omits the body title and publishes article sections below the theme title', () => {
  const source = '# A Useful Article\n\nOpening paragraph.\n\n# First Major Area\n\nDetails with a [reference](https://example.test/).\n\n## Existing Subsection\n\n| Item | Value |\n|---|---|\n| One | Two |\n';
  const html = renderWordPressContent(source, 'A Useful Article');
  assert.doesNotMatch(html, /<h1\b/i);
  assert.doesNotMatch(html, />A Useful Article<\/h[1-6]>/);
  assert.match(html, /<h2>First Major Area<\/h2>/);
  assert.match(html, /<h2>Existing Subsection<\/h2>/);
  assert.match(html, /<a href="https:\/\/example\.test\/">reference<\/a>/);
  assert.match(html, /<table>/);
  assert.match(html, /<p>Opening paragraph\.<\/p>/);
  assert.equal(source.startsWith('# A Useful Article'), true);
});

test('retains a nonmatching first body heading as a demoted section', () => {
  const html = renderWordPressContent('# A Different Heading\n\nDetails.', 'Post Title');
  assert.doesNotMatch(html, /<h1\b/i);
  assert.match(html, /<h2>A Different Heading<\/h2>/);
});
