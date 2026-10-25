import {
  ServerConfig,
  ServerState,
  ToolItem,
  ResourceItem,
  ResourceTemplateItem,
  PromptItem,
  JsonRpcMessageLog,
  BenchmarkStats
} from '../types';

export class BrowserMCPAdapter {
  private activeState: ServerState;
  private logs: JsonRpcMessageLog[] = [];
  private logListeners: ((log: JsonRpcMessageLog) => void)[] = [];

  constructor() {
    this.activeState = {
      config: {
        id: 'browser-demo-server',
        name: 'In-Browser MCP Engine',
        transport: 'mock',
        isBuiltIn: true,
        createdAt: Date.now()
      },
      status: 'connected',
      serverInfo: {
        name: 'MCP-Studio Web Simulator',
        version: '1.0.0 (WebAssembly & TS)',
        protocolVersion: '2024-11-05'
      },
      connectedAt: Date.now()
    };
  }

  onLog(listener: (log: JsonRpcMessageLog) => void) {
    this.logListeners.push(listener);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== listener);
    };
  }

  private addLog(log: Omit<JsonRpcMessageLog, 'id'>): JsonRpcMessageLog {
    const entry: JsonRpcMessageLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    };
    this.logs.push(entry);
    if (this.logs.length > 300) this.logs.shift();
    this.logListeners.forEach((l) => l(entry));
    return entry;
  }

  getActiveState(): ServerState {
    return this.activeState;
  }

  getServers(): ServerConfig[] {
    return [this.activeState.config];
  }

  getLogs(limit = 100): JsonRpcMessageLog[] {
    return this.logs.slice(-limit);
  }

  clearLogs(): void {
    this.logs = [];
  }

  listTools(): ToolItem[] {
    return [
      {
        name: 'math_calculator',
        description: 'Performs arithmetic calculations and expression evaluation (Running in-browser).',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              description: 'The math operation to perform',
              enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'modulo']
            },
            a: { type: 'number', description: 'First operand' },
            b: { type: 'number', description: 'Second operand' },
            roundDecimals: { type: 'integer', description: 'Number of decimal places (default 2)' }
          },
          required: ['operation', 'a', 'b']
        }
      },
      {
        name: 'system_monitor',
        description: 'Retrieves client-side browser navigator, hardware concurrency, and memory metrics.',
        inputSchema: {
          type: 'object',
          properties: {
            includeNetwork: { type: 'boolean', description: 'Include network connection info' },
            unit: { type: 'string', description: 'Display unit', enum: ['MB', 'GB'] }
          }
        }
      },
      {
        name: 'json_transformer',
        description: 'Parses, validates, and formats or queries JSON payload.',
        inputSchema: {
          type: 'object',
          properties: {
            jsonString: { type: 'string', description: 'Valid JSON string input' },
            action: {
              type: 'string',
              description: 'Transformation action',
              enum: ['prettify', 'minify', 'extractKeys', 'countKeys']
            }
          },
          required: ['jsonString', 'action']
        }
      },
      {
        name: 'generate_mock_users',
        description: 'Generates mock test users with avatars, names, and contact emails.',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'integer', description: 'Number of mock records to generate (1 to 20)' },
            role: { type: 'string', description: 'Role filter', enum: ['all', 'admin', 'developer', 'designer'] }
          },
          required: ['count']
        }
      }
    ];
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const start = Date.now();
    this.addLog({
      timestamp: start,
      direction: 'outgoing',
      method: 'tools/call',
      data: { name, arguments: args }
    });

    // Simulate real microsecond processing
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20) + 5));

    let res: any;
    switch (name) {
      case 'math_calculator': {
        const { operation, a = 0, b = 0, roundDecimals = 2 } = args;
        let result = 0;
        switch (operation) {
          case 'add': result = a + b; break;
          case 'subtract': result = a - b; break;
          case 'multiply': result = a * b; break;
          case 'divide':
            if (b === 0) throw new Error('Division by zero is not allowed');
            result = a / b;
            break;
          case 'power': result = Math.pow(a, b); break;
          case 'modulo': result = a % b; break;
          default: throw new Error(`Unsupported operation: ${operation}`);
        }
        const factor = Math.pow(10, roundDecimals);
        const rounded = Math.round(result * factor) / factor;
        res = {
          content: [{ type: 'text', text: `Calculation Result: ${a} ${operation} ${b} = ${rounded}` }],
          structuredData: { operation, a, b, result: rounded }
        };
        break;
      }

      case 'system_monitor': {
        const nav = typeof navigator !== 'undefined' ? navigator : ({} as any);
        const mem = (performance as any)?.memory;
        const totalMb = mem ? (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0) : '2048';
        const usedMb = mem ? (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1) : '85.4';

        const data: any = {
          platform: nav.userAgent || 'Browser Sandbox',
          language: nav.language || 'en-US',
          cpuCores: nav.hardwareConcurrency || 8,
          memory: {
            heapLimit: `${totalMb} MB`,
            heapUsed: `${usedMb} MB`
          },
          online: nav.onLine
        };

        if (args.includeNetwork && (nav as any).connection) {
          data.connection = {
            effectiveType: (nav as any).connection.effectiveType,
            downlink: `${(nav as any).connection.downlink} Mbps`,
            rtt: `${(nav as any).connection.rtt} ms`
          };
        }

        res = {
          content: [
            {
              type: 'text',
              text: `### In-Browser Host Metrics\n- **User Agent:** ${data.platform}\n- **CPU Cores:** ${data.cpuCores}\n- **Memory Heap:** ${data.memory.heapUsed} / ${data.memory.heapLimit}\n- **Network Status:** ${data.online ? 'Online' : 'Offline'}`
            }
          ],
          structuredData: data
        };
        break;
      }

      case 'json_transformer': {
        const { jsonString, action } = args;
        let parsed: any;
        try {
          parsed = JSON.parse(jsonString);
        } catch (e: any) {
          throw new Error(`Invalid JSON: ${e.message}`);
        }

        let outputText = '';
        if (action === 'prettify') outputText = JSON.stringify(parsed, null, 2);
        else if (action === 'minify') outputText = JSON.stringify(parsed);
        else if (action === 'extractKeys') outputText = JSON.stringify(Object.keys(parsed || {}), null, 2);
        else if (action === 'countKeys') outputText = `Total top-level keys: ${Object.keys(parsed || {}).length}`;

        res = { content: [{ type: 'text', text: outputText }] };
        break;
      }

      case 'generate_mock_users': {
        const count = Math.min(Math.max(Number(args.count) || 3, 1), 20);
        const roleFilter = args.role || 'all';
        const firstNames = ['Mohsen', 'Sara', 'Alex', 'Elena', 'David', 'Leila', 'Marcus', 'Chloe'];
        const lastNames = ['Miller', 'Naderi', 'Smith', 'Zhang', 'Vance', 'Dubois', 'Kowalski', 'Novak'];
        const roles = ['admin', 'developer', 'designer'];

        const users = Array.from({ length: count }, (_, i) => {
          const fn = firstNames[i % firstNames.length];
          const ln = lastNames[(i + 2) % lastNames.length];
          const role = roleFilter === 'all' ? roles[i % roles.length] : roleFilter;
          return {
            id: `usr_${1000 + i}`,
            fullName: `${fn} ${ln}`,
            email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
            role,
            status: i % 2 === 0 ? 'active' : 'idle',
            createdAt: new Date(Date.now() - i * 86400000).toISOString()
          };
        });

        res = {
          content: [{ type: 'text', text: `Generated ${users.length} mock user profile records.` }],
          structuredData: users
        };
        break;
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }

    const latencyMs = Date.now() - start;
    this.addLog({
      timestamp: Date.now(),
      direction: 'incoming',
      method: 'tools/call',
      data: res,
      latencyMs
    });

    return { ...res, latencyMs };
  }

  listResources(): { resources: ResourceItem[]; templates: ResourceTemplateItem[] } {
    return {
      resources: [
        {
          uri: 'mock://system/specs',
          name: 'Client OS & Browser Architecture',
          description: 'Live host specifications and WebGPU/Wasm runtime overview',
          mimeType: 'application/json'
        },
        {
          uri: 'mock://docs/getting-started',
          name: 'Model Context Protocol Guide',
          description: 'Interactive documentation on MCP protocol flow',
          mimeType: 'text/markdown'
        },
        {
          uri: 'mock://config/environment',
          name: 'Runtime Blueprint',
          description: 'Active features and client mode flags',
          mimeType: 'application/json'
        }
      ],
      templates: [
        {
          uriTemplate: 'mock://users/{userId}/profile',
          name: 'User Profile Template',
          description: 'Parameterized user profile query',
          mimeType: 'application/json'
        }
      ]
    };
  }

  async readResource(uri: string): Promise<any> {
    const start = Date.now();
    this.addLog({
      timestamp: start,
      direction: 'outgoing',
      method: 'resources/read',
      data: { uri }
    });

    await new Promise((r) => setTimeout(r, 10));

    let contentText = '';
    let mimeType = 'text/plain';

    if (uri === 'mock://system/specs') {
      mimeType = 'application/json';
      contentText = JSON.stringify(
        {
          environment: 'Browser Web Sandbox',
          mode: 'GitHub Pages Standalone',
          userAgent: navigator.userAgent,
          screenResolution: `${window.innerWidth}x${window.innerHeight}`,
          devicePixelRatio: window.devicePixelRatio
        },
        null,
        2
      );
    } else if (uri === 'mock://docs/getting-started') {
      mimeType = 'text/markdown';
      contentText = `# Model Context Protocol (MCP) Web Demo\n\nYou are viewing the interactive in-browser simulator for **MCP-Studio**!\n\n## Capabilities Tested In-Browser:\n- Dynamic JSON Schema Forms\n- Tools execution with latency tracking\n- Live JSON-RPC 2.0 streaming inspector\n- Latency benchmarks\n\nTo connect to local python/node servers, run \`npx mcp-studio\` locally!`;
    } else if (uri === 'mock://config/environment') {
      mimeType = 'application/json';
      contentText = JSON.stringify(
        {
          deployment: 'GitHub Pages',
          runtime: 'In-Browser Simulated Client',
          version: '1.0.0'
        },
        null,
        2
      );
    } else if (uri.startsWith('mock://users/')) {
      const match = uri.match(/^mock:\/\/users\/([^/]+)\/profile$/);
      const uid = match ? match[1] : '101';
      mimeType = 'application/json';
      contentText = JSON.stringify(
        {
          id: uid,
          name: `Simulated User ${uid}`,
          role: 'Full-Stack Engineer',
          permissions: ['tools:call', 'resources:read']
        },
        null,
        2
      );
    } else {
      throw new Error(`Resource not found: ${uri}`);
    }

    const res = { contents: [{ uri, mimeType, text: contentText }] };
    const latencyMs = Date.now() - start;

    this.addLog({
      timestamp: Date.now(),
      direction: 'incoming',
      method: 'resources/read',
      data: res,
      latencyMs
    });

    return { ...res, latencyMs };
  }

  listPrompts(): PromptItem[] {
    return [
      {
        name: 'code_review_assistant',
        description: 'Analyzes provided code for security vulnerabilities, edge cases, and performance.',
        arguments: [
          { name: 'code', description: 'The source code snippet to review', required: true },
          { name: 'language', description: 'Programming language (e.g. typescript, python, go)', required: false },
          { name: 'focusArea', description: 'Special focus (e.g. security, performance, readability)', required: false }
        ]
      },
      {
        name: 'sql_query_builder',
        description: 'Translates a natural language requirement into an optimized SQL query.',
        arguments: [
          { name: 'requirement', description: 'Plain English description of what data is needed', required: true },
          { name: 'dialect', description: 'SQL dialect (PostgreSQL, MySQL, SQLite)', required: false }
        ]
      }
    ];
  }

  async getPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
    const start = Date.now();
    this.addLog({
      timestamp: start,
      direction: 'outgoing',
      method: 'prompts/get',
      data: { name, arguments: args }
    });

    await new Promise((r) => setTimeout(r, 12));

    let res: any;
    if (name === 'code_review_assistant') {
      const { code = '', language = 'typescript', focusArea = 'security and best practices' } = args;
      res = {
        description: 'Code Review Request',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review the following ${language} code focusing on ${focusArea}:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide concrete recommendations and refactoring examples.`
            }
          }
        ]
      };
    } else if (name === 'sql_query_builder') {
      const { requirement = '', dialect = 'PostgreSQL' } = args;
      res = {
        description: 'SQL Query Generation Request',
        messages: [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are an expert database administrator. Write production-ready, SQL-injection safe queries in ${dialect}.`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Write an efficient SQL query for the following requirement: "${requirement}"`
            }
          }
        ]
      };
    } else {
      throw new Error(`Prompt not found: ${name}`);
    }

    const latencyMs = Date.now() - start;
    this.addLog({
      timestamp: Date.now(),
      direction: 'incoming',
      method: 'prompts/get',
      data: res,
      latencyMs
    });

    return { ...res, latencyMs };
  }

  async runBenchmark(iterations = 5): Promise<BenchmarkStats> {
    const results: any[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 8) + 2));
      results.push({
        toolName: 'tools/list (in-browser)',
        latencyMs: Date.now() - start,
        success: true,
        timestamp: Date.now()
      });
    }

    const latencies = results.map((r) => r.latencyMs);
    return {
      iterations,
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      successRate: 100,
      results
    };
  }
}
