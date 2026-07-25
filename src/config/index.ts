import 'dotenv/config';
import path from 'node:path';

const bool = (name: string, fallback = false) => (process.env[name] ?? String(fallback)).toLowerCase() === 'true';
const number = (name: string, fallback: number) => { const value = Number(process.env[name] ?? fallback); if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`); return value; };
export const config = (overrides: Partial<Record<string, string>> = {}) => {
  const get = (name: string) => overrides[name] ?? process.env[name];
  const base = get('LMSTUDIO_BASE_URL') ?? 'http://192.168.1.35:1234';
  if (!/^https?:\/\//.test(base)) throw new Error('LMSTUDIO_BASE_URL must be an HTTP(S) URL');
  return {
    lm: { baseUrl: base.replace(/\/$/, ''), token: get('LMSTUDIO_API_TOKEN') ?? '', primaryModel: get('LMSTUDIO_PRIMARY_MODEL') ?? 'openai/gpt-oss-20b', allowFallbackLoad: (get('LMSTUDIO_ALLOW_FALLBACK_LOAD') ?? 'true') === 'true', timeoutMs: number('LMSTUDIO_TIMEOUT_MS', 120000), retryLimit: number('LMSTUDIO_RETRY_LIMIT', 1) },
    trackerPath: path.resolve(get('TRACKER_PATH') ?? 'manual-files/wordpress-blog-content-tracker.xlsx'), draftsDir: path.resolve(get('DRAFTS_DIR') ?? 'data/drafts'), runsDir: path.resolve(get('RUNS_DIR') ?? 'data/runs'), pollIntervalMs: number('POLL_INTERVAL_MS', 60000),
    messaging: {
      adapter: get('IMESSAGE_ADAPTER') ?? 'macos', recipient: get('IMESSAGE_RECIPIENT') ?? '', chatDb: (get('IMESSAGE_CHAT_DB') ?? '~/Library/Messages/chat.db').replace(/^~/, process.env.HOME ?? ''),
      relayUrl: (get('IMESSAGE_RELAY_URL') ?? '').replace(/\/$/, ''), relayToken: get('IMESSAGE_RELAY_TOKEN') ?? '', relayTimeoutMs: number('IMESSAGE_RELAY_TIMEOUT_MS', 30_000),
      relayListenHost: get('IMESSAGE_RELAY_LISTEN_HOST') ?? '127.0.0.1', relayListenPort: number('IMESSAGE_RELAY_LISTEN_PORT', 8787)
    },
    wordpress: { baseUrl: get('WORDPRESS_BASE_URL') ?? '', username: get('WORDPRESS_USERNAME') ?? '', password: get('WORDPRESS_APPLICATION_PASSWORD') ?? '', status: get('WORDPRESS_POST_STATUS') ?? 'draft', allowHttp: bool('WORDPRESS_ALLOW_HTTP') }
  };
};
export const requireWordPress = (c: ReturnType<typeof config>) => { const { baseUrl, username, password } = c.wordpress; if (!baseUrl || !username || !password) throw new Error('WordPress credentials are required unless --dry-run is used'); if (!c.wordpress.allowHttp && !baseUrl.startsWith('https://')) throw new Error('WORDPRESS_BASE_URL must use HTTPS (or set WORDPRESS_ALLOW_HTTP=true for development only)'); return c.wordpress; };
