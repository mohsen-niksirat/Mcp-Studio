import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig } from '../types.js';

/**
 * Persists the registered server configs under ~/.mcp-studio/servers.json
 * so registered servers survive backend restarts. Writes are atomic
 * (tmp file + rename) so a crash mid-write can never corrupt the store.
 */
export class ServerStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath =
      filePath || path.join(os.homedir(), '.mcp-studio', 'servers.json');
  }

  get location(): string {
    return this.filePath;
  }

  load(): ServerConfig[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Only well-formed entries survive a load.
      return parsed.filter(
        (s: any) =>
          s &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          typeof s.transport === 'string'
      );
    } catch {
      // Missing or corrupt store: start fresh rather than crash.
      return [];
    }
  }

  save(servers: ServerConfig[]): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(servers, null, 2), 'utf8');
    // Atomic on POSIX and on Windows (NTFS) for practical purposes.
    fs.renameSync(tmp, this.filePath);
  }
}
