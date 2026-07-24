import type { RunLog } from '../log.js';

export type NativeModel = { key: string; type: 'llm' | 'embedding'; loaded_instances?: Array<{ id: string }> };
export type LlmCandidate = { key: string; instanceId?: string; loaded: boolean };

export const selectLlmCandidates = (primaryModel: string, models: NativeModel[]): LlmCandidate[] => {
  const grouped = new Map<string, LlmCandidate>();
  for (const model of models) {
    if (model.type !== 'llm' || !model.key) continue;
    const loadedInstance = model.loaded_instances?.[0]?.id;
    const existing = grouped.get(model.key);
    if (!existing || (!existing.loaded && Boolean(loadedInstance))) grouped.set(model.key, { key: model.key, instanceId: loadedInstance, loaded: Boolean(loadedInstance) });
  }
  const primary = grouped.get(primaryModel);
  const loadedFallbacks = [...grouped.values()].filter(candidate => candidate.key !== primaryModel && candidate.loaded);
  const unloadedFallbacks = [...grouped.values()].filter(candidate => candidate.key !== primaryModel && !candidate.loaded);
  return [...(primary?.loaded ? [primary] : []), ...loadedFallbacks, ...unloadedFallbacks];
};

const textFrom = (body: any) => body?.choices?.[0]?.message?.content ?? body?.output?.find((x: any) => x.type === 'message')?.content ?? body?.output_text;

export class LMStudioClient {
  constructor(private readonly settings: { baseUrl: string; token: string; primaryModel: string; allowFallbackLoad: boolean; timeoutMs: number; retryLimit: number }, private readonly log: RunLog) {}

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const response = await fetch(`${this.settings.baseUrl}${path}`, { ...init, signal: controller.signal, headers: { 'content-type': 'application/json', ...(this.settings.token ? { authorization: `Bearer ${this.settings.token}` } : {}), ...init.headers } });
      if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
      return response.json();
    } finally { clearTimeout(timer); }
  }

  async health() {
    await this.request('/v1/models');
    await this.log.write('lmstudio.health_ok', { base_url: this.settings.baseUrl });
  }

  private async nativeModels(): Promise<NativeModel[]> {
    const body = await this.request('/api/v1/models');
    const models = Array.isArray(body.models) ? body.models : [];
    return models.filter((model: unknown): model is NativeModel => Boolean(model && typeof model === 'object' && typeof (model as NativeModel).key === 'string' && ((model as NativeModel).type === 'llm' || (model as NativeModel).type === 'embedding')));
  }

  private async load(model: string) {
    const body = await this.request('/api/v1/models/load', { method: 'POST', body: JSON.stringify({ model }) });
    if (body.type !== 'llm' || body.status !== 'loaded') throw new Error(`Refusing non-LLM or unsuccessful model load for ${model}`);
    await this.log.write('lmstudio.model_loaded', { model, instance_id: body.instance_id });
    return body.instance_id ?? model;
  }

  private async completion(model: string, prompt: string) {
    const body = await this.request('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'system', content: 'You write accurate, original WordPress blog articles. Never invent citations, sources, product claims, or technical facts.' }, { role: 'user', content: prompt }] }) });
    const text = textFrom(body);
    if (typeof text !== 'string' || !text.trim()) throw new Error(`LM Studio returned no article text for ${model}`);
    return text.trim();
  }

  async generate(prompt: string): Promise<{ markdown: string; model: string }> {
    await this.health();
    const candidates = selectLlmCandidates(this.settings.primaryModel, await this.nativeModels());
    if (!candidates.some(candidate => candidate.key === this.settings.primaryModel)) await this.log.write('lmstudio.primary_not_loaded', { model: this.settings.primaryModel });
    let last: unknown;
    for (const candidate of candidates) {
      try {
        if (!candidate.loaded && !this.settings.allowFallbackLoad) { await this.log.write('lmstudio.fallback_skipped_unloaded', { model: candidate.key }); continue; }
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
