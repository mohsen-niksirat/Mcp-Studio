import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig } from '../types.js';

export interface DetectedConfig {
  source: 'claude' | 'cursor' | 'antigravity';
  filePath: string;
  servers: ServerConfig[];
}

export class ConfigImporter {
  static getCandidatePaths(): { source: 'claude' | 'cursor' | 'antigravity'; path: string }[] {
    const home = os.homedir();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    
    return [
      {
        source: 'claude',
        path: path.join(appData, 'Claude', 'claude_desktop_config.json')
      },
      {
        source: 'cursor',
        path: path.join(home, '.cursor', 'mcp.json')
      },
      {
        source: 'antigravity',
        path: path.join(home, '.gemini', 'antigravity', 'mcp.json')
      }
    ];
  }

  static detectConfigs(): DetectedConfig[] {
    const results: DetectedConfig[] = [];
    const candidates = this.getCandidatePaths();

    for (const candidate of candidates) {
      if (fs.existsSync(candidate.path)) {
        try {
          const raw = fs.readFileSync(candidate.path, 'utf8');
          const parsed = JSON.parse(raw);
          const servers: ServerConfig[] = [];

          // Standard format: { mcpServers: { [name]: { command, args, env, url } } }
          const mcpDict = parsed.mcpServers || parsed.servers || {};
          for (const [key, val] of Object.entries<any>(mcpDict)) {
            if (val && typeof val === 'object') {
              if (val.command) {
                servers.push({
                  id: `imported-${candidate.source}-${key}-${Date.now()}`,
                  name: `${key} (${candidate.source})`,
                  transport: 'stdio',
                  command: val.command,
                  args: Array.isArray(val.args) ? val.args : [],
                  env: val.env || {},
                  source: candidate.source,
                  createdAt: Date.now()
                });
              } else if (val.url) {
                servers.push({
                  id: `imported-${candidate.source}-${key}-${Date.now()}`,
                  name: `${key} (${candidate.source})`,
                  transport: 'sse',
                  url: val.url,
                  headers: val.headers || {},
                  source: candidate.source,
                  createdAt: Date.now()
                });
              }
            }
          }

          if (servers.length > 0) {
            results.push({
              source: candidate.source,
              filePath: candidate.path,
              servers
            });
          }
        } catch (err) {
          console.warn(`[ConfigImporter] Failed to parse ${candidate.path}:`, err);
        }
      }
    }

    return results;
  }
}
