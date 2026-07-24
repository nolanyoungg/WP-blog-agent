import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Message, MessageAdapter } from '../types.js';
const exec = promisify(execFile);
export const parseReview = (text: string) => { const match = text.trim().match(/^(YES|NO)\s+(\S+)$/i); return match ? { decision: match[1].toLowerCase() === 'yes' ? 'approved' as const : 'rejected' as const, blogId: match[2] } : undefined; };
export class DryRunMessageAdapter implements MessageAdapter { async send(text: string) { process.stdout.write(`[dry-run iMessage] ${text}\n`); } async latestReplies(): Promise<Message[]> { return []; } }
export class MacOSMessagesAdapter implements MessageAdapter {
  constructor(private readonly recipient: string, private readonly chatDb: string) { if (process.platform !== 'darwin') throw new Error('The macOS Messages adapter can only run on macOS; use IMESSAGE_ADAPTER=dry-run elsewhere'); if (!recipient) throw new Error('IMESSAGE_RECIPIENT is required for the macOS Messages adapter'); }
  async send(text: string, attachment?: string) { const script = attachment ? `tell application "Messages"\nset targetService to 1st service whose service type = iMessage\nset targetBuddy to buddy "${this.recipient.replaceAll('"', '\\"')}" of targetService\nsend "${text.replaceAll('"', '\\"')}" to targetBuddy\nsend POSIX file "${attachment.replaceAll('"', '\\"')}" to targetBuddy\nend tell` : `tell application "Messages" to send "${text.replaceAll('"', '\\"')}" to buddy "${this.recipient.replaceAll('"', '\\"')}" of (1st service whose service type = iMessage)`; await exec('osascript', ['-e', script]); }
  async latestReplies(): Promise<Message[]> { const query = `SELECT m.text, datetime(m.date/1000000000 + 978307200, 'unixepoch') FROM message m JOIN handle h ON m.handle_id=h.ROWID WHERE h.id=${JSON.stringify(this.recipient)} AND m.is_from_me=0 AND m.text IS NOT NULL ORDER BY m.date DESC LIMIT 50;`; const { stdout } = await exec('sqlite3', ['-separator', '\t', this.chatDb, query]); return stdout.trim().split('\n').filter(Boolean).map(line => { const [text, receivedAt] = line.split('\t'); return { text, receivedAt, sender: this.recipient }; }); }
}
