import { config } from '../config/index.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { EditorialGuidanceRegistry } from '../generation/editorial-guidance.js';
import { syncBlogFormatDropdown } from '../tracker/blog-format-dropdown.js';

const command = process.argv[2] ?? 'validate';
const settings = config();
const registry = await ArticleFormatRegistry.load(settings.formatsDir);
const editorialGuidance = await EditorialGuidanceRegistry.load(settings.editorialGuidancePath);
if (command === 'validate') {
  const genericGuidance = editorialGuidance.forTopic('');
  process.stdout.write(`${JSON.stringify({
    formats: registry.list().map(format => ({ id: format.id, h1_count: format.sections.length, example: format.example_path })),
    editorial_guidance: { file: settings.editorialGuidancePath, universal_constraints: genericGuidance.prompt.split('\n').filter(line => line.startsWith('- ')).length }
  }, null, 2)}\n`);
} else if (command === 'sync') {
  const count = await syncBlogFormatDropdown(settings.trackerPath, registry);
  process.stdout.write(`Synchronized ${count} blog format IDs into the "blog_type" dropdown in ${settings.trackerPath}\n`);
} else {
  throw new Error('Usage: formats <validate|sync>');
}
