import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { MessageAdapter } from './types.js';

const maxBodyBytes = 12 * 1024 * 1024;

class RelayRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const reply = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
};

const authorized = (request: IncomingMessage, expectedToken: string) => {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(value.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const body = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBodyBytes) throw new RelayRequestError(413, `Request body exceeds ${maxBodyBytes} bytes`);
    chunks.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new RelayRequestError(400, 'Request body must be valid JSON'); }
};

const attachmentPath = async (attachment: unknown) => {
  if (!attachment || typeof attachment !== 'object') return undefined;
  const candidate = attachment as { filename?: unknown; contentBase64?: unknown };
  if (typeof candidate.filename !== 'string' || typeof candidate.contentBase64 !== 'string') throw new RelayRequestError(400, 'Attachment must contain filename and contentBase64');
  const filename = basename(candidate.filename);
  if (!filename || filename !== candidate.filename || !/^[A-Za-z0-9+/]*={0,2}$/.test(candidate.contentBase64)) throw new RelayRequestError(400, 'Attachment is invalid');
  const contents = Buffer.from(candidate.contentBase64, 'base64');
  if (!contents.length || contents.length > maxBodyBytes || contents.toString('base64') !== candidate.contentBase64) throw new RelayRequestError(400, 'Attachment is invalid');
  const directory = await mkdtemp(join(tmpdir(), 'wp-blog-agent-relay-'));
  const path = join(directory, filename);
  await writeFile(path, contents, { mode: 0o600 });
  return { path, directory };
};

export type RelayServerOptions = { adapter: MessageAdapter; token: string; host?: string; port?: number };
export type RunningRelayServer = { url: string; close: () => Promise<void> };

export const startRelayServer = async ({ adapter, token, host = '127.0.0.1', port = 8787 }: RelayServerOptions): Promise<RunningRelayServer> => {
  if (!token) throw new Error('IMESSAGE_RELAY_TOKEN is required to start the relay server');
  const server: Server = createServer((request, response) => {
    void (async () => {
      try {
        if (!authorized(request, token)) throw new RelayRequestError(401, 'Unauthorized');
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (request.method === 'GET' && path === '/health') { reply(response, 200, { ok: true, data: { status: 'ok' } }); return; }
        if (request.method === 'GET' && path === '/v1/replies') { reply(response, 200, { ok: true, data: { replies: await adapter.latestReplies() } }); return; }
        if (request.method !== 'POST' || path !== '/v1/messages') throw new RelayRequestError(404, 'Not found');
        const payload = await body(request);
        if (!payload || typeof payload !== 'object' || typeof (payload as { text?: unknown }).text !== 'string') throw new RelayRequestError(400, 'Message text is required');
        const attachment = await attachmentPath((payload as { attachment?: unknown }).attachment);
        try { await adapter.send((payload as { text: string }).text, attachment?.path); }
        finally { if (attachment) await rm(attachment.directory, { recursive: true, force: true }); }
        reply(response, 200, { ok: true, data: {} });
      } catch (error) {
        const known = error instanceof RelayRequestError ? error : new RelayRequestError(500, 'Relay operation failed');
        reply(response, known.status, { ok: false, error: known.message });
      }
    })();
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  const address = server.address() as AddressInfo;
  return { url: `http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
};
