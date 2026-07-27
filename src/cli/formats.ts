import { config } from '../config/index.js';
import { ArticleFormatRegistry } from '../generation/article-format-registry.js';
import { syncBlogFormatSheet } from '../tracker/blog-format-sheet.js';

const command = process.argv[2] ?? 'validate';
const settings = config();
const registry = await ArticleFormatRegistry.load(settings.formatsDir);
if (command === 'validate') {
  process.stdout.write(`${JSON.stringify({ formats: registry.list().map(format => ({ id: format.id, h1_count: format.sections.length, example: format.example_path })) }, null, 2)}\n`);
} else if (command === 'sync') {
  const count = await syncBlogFormatSheet(settings.trackerPath, registry);
  process.stdout.write(`Synchronized ${count} blog formats into ${settings.trackerPath}\n`);
} else {
  throw new Error('Usage: formats <validate|sync>');
}
