import { z } from 'zod';
import type { RunLog } from '../log.js';

export const BLOG_MAX_OUTPUT_TOKENS = 8_192;
export const BLOG_COMPLETION_SEED = 42;

const nonemptyString = z.string().trim().min(1);
const loadedInstanceSchema = z.object({ id: nonemptyString }).passthrough();
const nativeModelSchema = z.object({
  key: nonemptyString,
  type: z.enum(['llm', 'embedding']),
  loaded_instances: z.array(loadedInstanceSchema)
}).passthrough();

export const healthModelsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(z.object({
    id: nonemptyString,
    object: z.literal('model')
  }).passthrough())
}).passthrough();

export const nativeModelsResponseSchema = z.object({
  models: z.array(nativeModelSchema)
}).passthrough();

export const modelLoadResponseSchema = z.object({
  type: z.enum(['llm', 'embedding']),
  instance_id: nonemptyString,
  load_time_seconds: z.number().finite().nonnegative(),
  status: z.literal('loaded')
}).passthrough();

export const chatCompletionResponseSchema = z.object({
  id: nonemptyString,
  object: z.literal('chat.completion'),
  created: z.number().int().nonnegative(),
  model: nonemptyString,
  choices: z.array(z.object({
    index: z.number().int().nonnegative(),
    finish_reason: nonemptyString,
    message: z.object({
      role: z.literal('assistant'),
      content: z.string()
    }).passthrough()
  }).passthrough()).min(1)
}).passthrough();

const lmErrorResponseSchema = z.object({
  error: z.union([
    z.string(),
    z.object({ message: z.string() }).passthrough()
  ]).optional(),
  message: z.string().optional()
}).passthrough();

export type NativeModel = z.infer<typeof nativeModelSchema>;
export type LlmCandidate = { key: string; instanceId?: string; loaded: boolean };

const schemaError = (label: string, error: z.ZodError) => {
  const detail = error.issues
    .slice(0, 5)
    .map(issue => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid LM Studio ${label} response: ${detail}`);
};

export const parseHealthModelsResponse = (input: unknown) => {
  const parsed = healthModelsResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('health/models', parsed.error);
  return parsed.data;
};

export const parseNativeModelsResponse = (input: unknown): NativeModel[] => {
  const parsed = nativeModelsResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('native models', parsed.error);
  return parsed.data.models;
};

export const parseModelLoadResponse = (input: unknown, requestedModel: string): string => {
  const parsed = modelLoadResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('model load', parsed.error);
  if (parsed.data.type !== 'llm') throw new Error(`Refusing non-LLM model load response for ${requestedModel}`);
  return parsed.data.instance_id;
};

export const parseChatCompletionResponse = (input: unknown, requestedModel: string): string => {
  const parsed = chatCompletionResponseSchema.safeParse(input);
  if (!parsed.success) throw schemaError('chat completion', parsed.error);
  const choice = parsed.data.choices[0]!;
  if (choice.finish_reason !== 'stop') {
    throw new Error(`LM Studio response for ${requestedModel} ended with non-success finish_reason=${choice.finish_reason}; refusing partial output`);
  }
  const content = choice.message.content.trim();
  if (!content) throw new Error(`LM Studio returned empty article content for ${requestedModel}`);
  return content;
};

export const parseLmStudioErrorDetail = (input: string): string => {
  const bounded = input.slice(0, 2_000);
  try {
    const parsed = lmErrorResponseSchema.safeParse(JSON.parse(bounded));
    if (parsed.success) {
      const detail = typeof parsed.data.error === 'string'
        ? parsed.data.error
        : parsed.data.error?.message ?? parsed.data.message;
      if (detail?.trim()) return detail.trim().slice(0, 500);
    }
  } catch {
    // Fall back to bounded plain text below.
  }
  return bounded.trim().slice(0, 500);
};

export const buildChatCompletionRequest = (model: string, prompt: string) => ({
  model,
  temperature: 0,
  top_p: 1,
  seed: BLOG_COMPLETION_SEED,
  max_tokens: BLOG_MAX_OUTPUT_TOKENS,
  stream: false,
  messages: [
    {
      role: 'system' as const,
      content: 'You write accurate, original WordPress blog articles. Follow the requested Markdown and front matter contract exactly. Never emit raw HTML or executable content. Never invent citations, sources, product claims, or technical facts.'
    },
    { role: 'user' as const, content: prompt }
  ]
});

export const selectLlmCandidates = (primaryModel: string, models: NativeModel[]): LlmCandidate[] => {
  const grouped = new Map<string, LlmCandidate>();
  for (const model of models) {
    if (model.type !== 'llm') continue;
    const loadedInstance = model.loaded_instances[0]?.id;
    const existing = grouped.get(model.key);
    if (!existing || (!existing.loaded && Boolean(loadedInstance))) {
      grouped.set(model.key, { key: model.key, instanceId: loadedInstance, loaded: Boolean(loadedInstance) });
    }
  }
  const primary = grouped.get(primaryModel);
  const loadedFallbacks = [...grouped.values()].filter(candidate => candidate.key !== primaryModel && candidate.loaded);
  const unloadedFallbacks = [...grouped.values()].filter(candidate => candidate.key !== primaryModel && !candidate.loaded);
  return [...(primary ? [primary] : []), ...loadedFallbacks, ...unloadedFallbacks];
};

export class LMStudioClient {
  constructor(
    private readonly settings: {
      baseUrl: string;
      token: string;
      primaryModel: string;
      allowFallbackLoad: boolean;
      timeoutMs: number;
      retryLimit: number;
    },
    private readonly log: RunLog
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await fetch(`${this.settings.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.settings.token ? { authorization: `Bearer ${this.settings.token}` } : {}),
          ...init.headers
        }
      });
      if (!response.ok) {
        const detail = parseLmStudioErrorDetail(await response.text());
        throw new Error(`${init.method ?? 'GET'} ${path} returned ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error(`${init.method ?? 'GET'} ${path} returned invalid JSON`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    parseHealthModelsResponse(await this.request('/v1/models'));
    await this.log.write('lmstudio.health_ok', { base_url: this.settings.baseUrl });
  }

  private async nativeModels(): Promise<NativeModel[]> {
    return parseNativeModelsResponse(await this.request('/api/v1/models'));
  }

  private async load(model: string) {
    const instanceId = parseModelLoadResponse(
      await this.request('/api/v1/models/load', { method: 'POST', body: JSON.stringify({ model }) }),
      model
    );
    await this.log.write('lmstudio.model_loaded', { model, instance_id: instanceId });
    return instanceId;
  }

  private async completion(model: string, prompt: string) {
    const body = await this.request('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(buildChatCompletionRequest(model, prompt))
    });
    return parseChatCompletionResponse(body, model);
  }

  async generate(prompt: string): Promise<{ markdown: string; model: string }> {
    await this.health();
    const candidates = selectLlmCandidates(this.settings.primaryModel, await this.nativeModels());
    const primary = candidates.find(candidate => candidate.key === this.settings.primaryModel);
    if (!primary?.loaded) await this.log.write('lmstudio.primary_not_loaded', { model: this.settings.primaryModel });
    let last: unknown;
    for (const candidate of candidates) {
      try {
        if (!candidate.loaded && !this.settings.allowFallbackLoad) {
          await this.log.write('lmstudio.model_skipped_unloaded', { model: candidate.key });
          continue;
        }
        const model = candidate.loaded ? (candidate.instanceId ?? candidate.key) : await this.load(candidate.key);
        for (let attempt = 0; attempt <= this.settings.retryLimit; attempt++) {
          try {
            const markdown = await this.completion(model, prompt);
            await this.log.write('lmstudio.generation_succeeded', { model, attempt });
            return { markdown, model };
          } catch (error) {
            last = error;
            await this.log.write('lmstudio.generation_failed', { model, attempt, error: String(error) });
          }
        }
      } catch (error) {
        last = error;
        await this.log.write('lmstudio.model_failed', { model: candidate.key, error: String(error) });
      }
    }
    throw new Error(`No LM Studio LLM completed generation. ${String(last ?? '')}`);
  }
}
