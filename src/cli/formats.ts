import { config } from '../config/index.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { syncBlogFormatDropdown } from '../tracker/blog-format-dropdown.js';

const command = process.argv[2] ?? 'validate';
const settings = config();
const registry = await ArticleFormatRegistry.load(settings.formatsDir);
if (command === 'validate') {
  process.stdout.write(`${JSON.stringify({
    formats: registry.list().map(format => ({ id: format.id, target_words: format.target_words, section_count: format.sections.length, definition: format.definition_path }))
  }, null, 2)}\n`);
} else if (command === 'sync') {
  const count = await syncBlogFormatDropdown(settings.trackerPath, registry);
  process.stdout.write(`Synchronized ${count} blog format IDs into the "blog_type" dropdown in ${settings.trackerPath}\n`);
} else {
  throw new Error('Usage: formats <validate|sync>');
}
