import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOG_COMPLETION_SEED,
  BLOG_MAX_OUTPUT_TOKENS,
  buildChatCompletionRequest,
  parseChatCompletionResponse,
  parseHealthModelsResponse,
  parseLmStudioErrorDetail,
  parseModelLoadResponse,
  parseNativeModelsResponse,
  selectLlmCandidates
} from '../src/lmstudio/client.js';

const completion = (finishReason: string = 'stop', content: unknown = '---\ntitle: Example\n---\nArticle') => ({
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1_753_460_800,
  model: 'openai/gpt-oss-20b',
  choices: [{
    index: 0,
    finish_reason: finishReason,
    message: { role: 'assistant', content }
  }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
});

test('builds a deterministic bounded non-streaming chat-completion request', () => {
  const request = buildChatCompletionRequest('openai/gpt-oss-20b', 'Write the article');
  assert.equal(request.model, 'openai/gpt-oss-20b');
  assert.equal(request.temperature, 0);
  assert.equal(request.top_p, 1);
  assert.equal(request.seed, BLOG_COMPLETION_SEED);
  assert.equal(request.max_tokens, BLOG_MAX_OUTPUT_TOKENS);
  assert.equal(request.max_tokens, 8_192);
  assert.equal(request.stream, false);
  assert.deepEqual(request.messages.map(message => message.role), ['system', 'user']);
});

test('strictly validates health, native-model, and model-load response envelopes', () => {
  assert.deepEqual(parseHealthModelsResponse({
    object: 'list',
    data: [{ id: 'openai/gpt-oss-20b', object: 'model', owned_by: 'organization-owner' }]
  }).data[0]?.id, 'openai/gpt-oss-20b');
  assert.throws(() => parseHealthModelsResponse({ data: [] }), /health\/models/);

  const models = parseNativeModelsResponse({
    models: [{
      key: 'openai/gpt-oss-20b',
      type: 'llm',
      loaded_instances: [{ id: 'openai/gpt-oss-20b', config: { context_length: 16_384 } }]
    }]
  });
  assert.equal(models[0]?.loaded_instances[0]?.id, 'openai/gpt-oss-20b');
  assert.throws(() => parseNativeModelsResponse({ models: [{ key: 'broken', type: 'llm' }] }), /native models/);

  assert.equal(parseModelLoadResponse({
    type: 'llm',
    instance_id: 'openai/gpt-oss-20b',
    load_time_seconds: 1.2,
    status: 'loaded'
  }, 'openai/gpt-oss-20b'), 'openai/gpt-oss-20b');
  assert.throws(() => parseModelLoadResponse({
    type: 'embedding',
    instance_id: 'embed',
    load_time_seconds: 1,
    status: 'loaded'
  }, 'embed'), /Refusing non-LLM/);
  assert.throws(() => parseModelLoadResponse({ type: 'llm', status: 'loaded' }, 'broken'), /model load/);
});

test('accepts only a complete, nonempty chat completion with finish_reason stop', () => {
  assert.equal(parseChatCompletionResponse(completion(), 'openai/gpt-oss-20b').startsWith('---'), true);
  for (const reason of ['length', 'tool_calls', 'content_filter', 'cancelled']) {
    assert.throws(
      () => parseChatCompletionResponse(completion(reason), 'openai/gpt-oss-20b'),
      new RegExp(`finish_reason=${reason}`)
    );
  }
  assert.throws(() => parseChatCompletionResponse(completion('stop', '   '), 'openai/gpt-oss-20b'), /empty article content/);
  assert.throws(() => parseChatCompletionResponse(completion('stop', null), 'openai/gpt-oss-20b'), /chat completion/);
  assert.throws(() => parseChatCompletionResponse({ ...completion(), choices: [] }, 'openai/gpt-oss-20b'), /chat completion/);
  assert.throws(() => parseChatCompletionResponse({ choices: completion().choices }, 'openai/gpt-oss-20b'), /chat completion/);
});

test('bounds structured and plain-text LM Studio error details', () => {
  assert.equal(parseLmStudioErrorDetail(JSON.stringify({ error: { message: 'Model is unavailable' } })), 'Model is unavailable');
  assert.equal(parseLmStudioErrorDetail('x'.repeat(5_000)).length, 500);
});

test('selects only typed LLMs and prefers the primary even when it must be loaded', () => {
  const candidates = selectLlmCandidates('openai/gpt-oss-20b', [
    { key: 'openai/gpt-oss-20b', type: 'llm', loaded_instances: [] },
    { key: 'qwen/qwen2.5-coder-14b', type: 'llm', loaded_instances: [{ id: 'qwen-loaded' }] },
    { key: 'text-embedding-nomic-embed-text-v1.5', type: 'embedding', loaded_instances: [{ id: 'embed' }] }
  ]);
  assert.deepEqual(candidates, [
    { key: 'openai/gpt-oss-20b', instanceId: undefined, loaded: false },
    { key: 'qwen/qwen2.5-coder-14b', instanceId: 'qwen-loaded', loaded: true }
  ]);
});
