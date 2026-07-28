import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { Message, MessageAdapter } from './types.js';

const exec = promisify(execFile);
const appleEpochMs = 978307200000;
const maxAttachmentBytes = 8 * 1024 * 1024;
const escapeAppleScript = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

export const parseReview = (text: string) => {
  const match = text.trim().match(/^(YES|NO)\s+(\S+)$/i);
  return match ? { decision: match[1].toLowerCase() === 'yes' ? 'approved' as const : 'rejected' as const, blogId: match[2] } : undefined;
};

export const stageMacOSAttachment = async (path: string, outbox: string) => {
  const source = await stat(path);
  if (!source.isFile()) throw new Error(`iMessage attachment is not a file: ${path}`);
  const directory = join(outbox, randomUUID());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stagedPath = join(directory, basename(path));
  await copyFile(path, stagedPath);
  await chmod(stagedPath, 0o600);
  return { path: stagedPath, cleanup: () => rm(directory, { recursive: true, force: true }) };
};

export class DryRunMessageAdapter implements MessageAdapter {
  async send(text: string) { process.stdout.write(`[dry-run iMessage] ${text}\n`); }
  async latestReplies(): Promise<Message[]> { return []; }
}

export class MacOSMessagesAdapter implements MessageAdapter {
  constructor(
    private readonly recipient: string,
    private readonly chatDb: string,
    private readonly attachmentOutbox: string,
    private readonly deliveryTimeoutMs: number,
    private readonly deliveryPollMs: number
  ) {
    if (process.platform !== 'darwin') throw new Error('The macOS Messages adapter can only run on macOS; use IMESSAGE_ADAPTER=dry-run elsewhere');
    if (!recipient) throw new Error('IMESSAGE_RECIPIENT is required for the macOS Messages adapter');
    if (deliveryTimeoutMs <= 0) throw new Error('IMESSAGE_DELIVERY_TIMEOUT_MS must be greater than zero');
    if (deliveryPollMs <= 0) throw new Error('IMESSAGE_DELIVERY_POLL_MS must be greater than zero');
  }

  private async attachmentCursor() {
    const query = `SELECT COALESCE(MAX(m.ROWID), 0) FROM message m JOIN handle h ON m.handle_id=h.ROWID WHERE h.id=${sqlString(this.recipient)} AND m.is_from_me=1;`;
    const { stdout } = await exec('sqlite3', ['-readonly', this.chatDb, query]);
    const value = Number(stdout.trim());
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Messages database returned an invalid outgoing-message cursor');
    return value;
  }

  private async waitForAttachment(filename: string, afterRowId: number) {
    const deadline = Date.now() + this.deliveryTimeoutMs;
    const query = `SELECT m.error, m.is_sent, m.is_delivered, a.transfer_state FROM message m JOIN handle h ON m.handle_id=h.ROWID JOIN message_attachment_join j ON j.message_id=m.ROWID JOIN attachment a ON a.ROWID=j.attachment_id WHERE h.id=${sqlString(this.recipient)} AND m.is_from_me=1 AND m.ROWID>${afterRowId} AND a.transfer_name=${sqlString(filename)} ORDER BY m.ROWID DESC LIMIT 1;`;
    while (Date.now() <= deadline) {
      const { stdout } = await exec('sqlite3', ['-readonly', '-separator', '\t', this.chatDb, query]);
      if (stdout.trim()) {
        const [error, sent, delivered, transferState] = stdout.trim().split('\t').map(Number);
        if (error) throw new Error(`Messages failed to send attachment ${filename} (error ${error}, transfer state ${transferState})`);
        if (sent === 1 || delivered === 1) return;
      }
      await new Promise(resolve => setTimeout(resolve, this.deliveryPollMs));
    }
    throw new Error(`Messages did not confirm attachment ${filename} within ${this.deliveryTimeoutMs}ms`);
  }

  async send(text: string, attachment?: string) {
    const recipient = escapeAppleScript(this.recipient);
    const message = escapeAppleScript(text);
    if (!attachment) {
      await exec('osascript', ['-e', `tell application "Messages" to send "${message}" to participant "${recipient}" of (1st account whose service type = iMessage)`]);
      return;
    }

    const staged = await stageMacOSAttachment(attachment, this.attachmentOutbox);
    try {
      const cursor = await this.attachmentCursor();
      const script = `set attachmentFile to POSIX file "${escapeAppleScript(staged.path)}"\ntell application "Messages"\nset targetAccount to 1st account whose service type = iMessage\nset targetParticipant to participant "${recipient}" of targetAccount\nsend attachmentFile to targetParticipant\nend tell`;
      await exec('osascript', ['-e', script]);
      await this.waitForAttachment(basename(staged.path), cursor);
      await exec('osascript', ['-e', `tell application "Messages" to send "${message}" to participant "${recipient}" of (1st account whose service type = iMessage)`]);
    } finally {
      await staged.cleanup();
    }
  }

  async latestReplies(): Promise<Message[]> {
    const query = `SELECT m.text, m.date FROM message m JOIN handle h ON m.handle_id=h.ROWID WHERE h.id=${sqlString(this.recipient)} AND m.is_from_me=0 AND m.text IS NOT NULL ORDER BY m.date DESC LIMIT 50;`;
    const { stdout } = await exec('sqlite3', ['-separator', '\t', this.chatDb, query]);
    return stdout.trim().split('\n').filter(Boolean).flatMap(line => {
      const [text, appleDate] = line.split('\t');
      const numericDate = Number(appleDate);
      return Number.isFinite(numericDate) ? [{ text, receivedAt: new Date(appleEpochMs + numericDate / 1_000_000).toISOString(), sender: this.recipient }] : [];
    });
  }
}

type RelayAttachment = { filename: string; contentBase64: string };
type RelayResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export class RelayMessagesAdapter implements MessageAdapter {
  constructor(private readonly relayUrl: string, private readonly token: string, private readonly timeoutMs: number) {
    if (!/^https?:\/\//.test(relayUrl)) throw new Error('IMESSAGE_RELAY_URL must be an HTTP(S) URL when IMESSAGE_ADAPTER=relay');
    if (!token) throw new Error('IMESSAGE_RELAY_TOKEN is required when IMESSAGE_ADAPTER=relay');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.relayUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { authorization: `Bearer ${this.token}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }
      });
      const body = await response.json().catch(() => undefined) as RelayResponse<T> | undefined;
      if (!response.ok || !body || !body.ok) throw new Error(`iMessage relay ${init.method ?? 'GET'} ${path} failed: ${body && !body.ok ? body.error : response.status}`);
      return body.data;
    } finally { clearTimeout(timer); }
  }

  private async attachment(path: string): Promise<RelayAttachment> {
    const details = await stat(path);
    if (!details.isFile()) throw new Error(`iMessage attachment is not a file: ${path}`);
    if (details.size > maxAttachmentBytes) throw new Error(`iMessage attachment exceeds ${maxAttachmentBytes} bytes: ${path}`);
    return { filename: basename(path), contentBase64: (await readFile(path)).toString('base64') };
  }

  async send(text: string, attachmentPath?: string) {
    await this.request('/v1/messages', { method: 'POST', body: JSON.stringify({ text, ...(attachmentPath ? { attachment: await this.attachment(attachmentPath) } : {}) }) });
  }

  async latestReplies(): Promise<Message[]> {
    const data = await this.request<{ replies: unknown }>('/v1/replies');
    if (!Array.isArray(data.replies)) throw new Error('iMessage relay returned an invalid replies payload');
    return data.replies.flatMap(reply => {
      if (!reply || typeof reply !== 'object') return [];
      const candidate = reply as Partial<Message>;
      return typeof candidate.text === 'string' && typeof candidate.sender === 'string' && typeof candidate.receivedAt === 'string' && Number.isFinite(Date.parse(candidate.receivedAt)) ? [{ text: candidate.text, sender: candidate.sender, receivedAt: candidate.receivedAt }] : [];
    });
  }
}
