import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLlmCandidates, structuredArgumentsFromResponses } from '../src/lmstudio/client.js';

test('selects only the configured primary LLM by default', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [{ id: 'openai/gpt-oss-20b' }] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [] },
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [] }
  ]);
  assert.deepEqual(candidates, [
    { key: 'openai/gpt-oss-20b', instanceId: 'openai/gpt-oss-20b', loaded: true }
  ]);
});

test('keeps an unloaded primary eligible without selecting a loaded fallback', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [{ id: 'qwen/qwen2.5-coder-14b' }] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [{ id: 'text-embedding-nomic-embed-text-v1.5' }] }
  ]);
  assert.deepEqual(candidates, [{ key: 'openai/gpt-oss-20b', instanceId: undefined, loaded: false }]);
});

test('never selects another model when the configured model is available', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [{ id: 'openai/gpt-oss-20b' }] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [] }
  ]);
  assert.deepEqual(candidates, [
    { key: 'openai/gpt-oss-20b', instanceId: 'openai/gpt-oss-20b', loaded: true }
  ]);
});

test('extracts structured function arguments from an LM Studio Responses result', () => {
  const body = {
    status: 'completed',
    output: [
      { type: 'reasoning', content: [] },
      { type: 'function_call', name: 'submit_wordpress_article', arguments: '{"title":"Example"}' }
    ]
  };
  assert.equal(structuredArgumentsFromResponses(body, 'submit_wordpress_article'), '{"title":"Example"}');
  assert.throws(() => structuredArgumentsFromResponses({ output: [] }, 'submit_wordpress_article'), /returned no submit_wordpress_article arguments/);
});
