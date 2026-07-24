import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
export class RunLog { readonly file: string; constructor(dir: string) { this.file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`); } async write(event: string, fields: Record<string, unknown> = {}) { await mkdir(path.dirname(this.file), { recursive: true }); const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }); await appendFile(this.file, `${line}\n`); process.stdout.write(`${line}\n`); } }
