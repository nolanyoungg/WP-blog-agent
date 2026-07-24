import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLlmCandidates } from '../src/lmstudio/client.js';

test('selects only typed LLMs and prefers the loaded primary instance', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [{ id: 'openai/gpt-oss-20b' }] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [] },
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [] }
  ]);
  assert.deepEqual(candidates, [
    { key: 'openai/gpt-oss-20b', instanceId: 'openai/gpt-oss-20b', loaded: true },
    { key: 'qwen/qwen2.5-coder-14b', instanceId: undefined, loaded: false }
  ]);
});

test('does not select an unloaded primary or any embedding fallback', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [{ id: 'qwen/qwen2.5-coder-14b' }] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [{ id: 'text-embedding-nomic-embed-text-v1.5' }] }
  ]);
  assert.deepEqual(candidates, [{ key: 'qwen/qwen2.5-coder-14b', instanceId: 'qwen/qwen2.5-coder-14b', loaded: true }]);
});
