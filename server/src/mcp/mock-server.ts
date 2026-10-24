import os from 'os';
import { ToolItem, ResourceItem, ResourceTemplateItem, PromptItem } from '../types.js';

export class MockMCPServer {
  name = 'MCP-Studio Demo Server';
  version = '1.0.0';
  protocolVersion = '2024-11-05';

  getTools(): ToolItem[] {
    return [
      {
        name: 'math_calculator',
        description: 'Performs arithmetic calculations and expression evaluation.',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              description: 'The math operation to perform',
              enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'modulo']
            },
            a: {
              type: 'number',
              description: 'First operand'
            },
            b: {
              type: 'number',
              description: 'Second operand'
            },
            roundDecimals: {
              type: 'integer',
              description: 'Number of decimal places to round result to (default 2)'
            }
          },
          required: ['operation', 'a', 'b']
        }
      },
      {
        name: 'system_monitor',
        description: 'Retrieves current host operating system hardware and memory metrics.',
        inputSchema: {
          type: 'object',
          properties: {
            includeNetwork: {
              type: 'boolean',
              description: 'Whether to include network interface details'
            },
            unit: {
              type: 'string',
              description: 'Memory display unit',
              enum: ['MB', 'GB']
            }
          }
        }
      },
      {
        name: 'json_transformer',
        description: 'Parses, validates, and formats or queries JSON payload.',
        inputSchema: {
          type: 'object',
          properties: {
            jsonString: {
              type: 'string',
              description: 'Valid JSON string input'
            },
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
            count: {
              type: 'integer',
              description: 'Number of mock records to generate (1 to 20)'
            },
            role: {
              type: 'string',
              description: 'Role filter',
              enum: ['all', 'admin', 'developer', 'designer']
            }
          },
          required: ['count']
        }
      }
    ];
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
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
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }
        const factor = Math.pow(10, roundDecimals);
        const rounded = Math.round(result * factor) / factor;
        return {
          content: [
            {
              type: 'text',
              text: `Calculation Result: ${a} ${operation} ${b} = ${rounded}`
            }
          ],
          structuredData: {
            operation,
            a,
            b,
            result: rounded
          }
        };
      }

      case 'system_monitor': {
        const unit = args.unit === 'MB' ? 1024 * 1024 : 1024 * 1024 * 1024;
        const unitLabel = args.unit === 'MB' ? 'MB' : 'GB';
        const totalMem = (os.totalmem() / unit).toFixed(2);
        const freeMem = (os.freemem() / unit).toFixed(2);
        const usedMem = ((os.totalmem() - os.freemem()) / unit).toFixed(2);

        const data: any = {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          cpus: os.cpus().length,
          cpuModel: os.cpus()[0]?.model,
          uptimeSeconds: Math.floor(os.uptime()),
          memory: {
            total: `${totalMem} ${unitLabel}`,
            free: `${freeMem} ${unitLabel}`,
            used: `${usedMem} ${unitLabel}`,
            usagePercent: `${Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)}%`
          }
        };

        if (args.includeNetwork) {
          data.network = os.networkInterfaces();
        }

        return {
          content: [
            {
              type: 'text',
              text: `### System Host Metrics\n- **Platform:** ${data.platform} (${data.arch})\n- **CPU:** ${data.cpuModel} (${data.cpus} cores)\n- **Memory Usage:** ${data.memory.used} / ${data.memory.total} (${data.memory.usagePercent})\n- **Uptime:** ${Math.floor(data.uptimeSeconds / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`
            }
          ],
          structuredData: data
        };
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
        if (action === 'prettify') {
          outputText = JSON.stringify(parsed, null, 2);
        } else if (action === 'minify') {
          outputText = JSON.stringify(parsed);
        } else if (action === 'extractKeys') {
          const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
          outputText = JSON.stringify(keys, null, 2);
        } else if (action === 'countKeys') {
          const count = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0;
          outputText = `Total top-level keys: ${count}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: outputText
            }
          ]
        };
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

        return {
          content: [
            {
              type: 'text',
              text: `Generated ${users.length} mock user profile records.`
            }
          ],
          structuredData: users
        };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  }

  getResources(): ResourceItem[] {
    return [
      {
        uri: 'mock://system/specs',
        name: 'System Specs & Architecture',
        description: 'Live host OS specifications and hardware overview',
        mimeType: 'application/json'
      },
      {
        uri: 'mock://docs/getting-started',
        name: 'Model Context Protocol Guide',
        description: 'Comprehensive documentation on MCP architecture and protocol flow',
        mimeType: 'text/markdown'
      },
      {
        uri: 'mock://config/environment',
        name: 'Environment Blueprint',
        description: 'Configuration flags and runtime flags',
        mimeType: 'application/json'
      }
    ];
  }

  getResourceTemplates(): ResourceTemplateItem[] {
    return [
      {
        uriTemplate: 'mock://users/{userId}/profile',
        name: 'User Profile Template',
        description: 'Look up mock user profile by ID',
        mimeType: 'application/json'
      }
    ];
  }

  async readResource(uri: string): Promise<any> {
    if (uri === 'mock://system/specs') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                totalMemoryBytes: os.totalmem(),
                freeMemoryBytes: os.freemem(),
                nodeVersion: process.version
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (uri === 'mock://docs/getting-started') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: `# Model Context Protocol (MCP) Overview

The Model Context Protocol (MCP) enables AI applications (like Claude Desktop, Cursor, and Custom Agents) to connect seamlessly to data sources and tools.

## Core Capabilities
- **Tools**: Functions that the AI model can invoke to perform side effects or query dynamic data.
- **Resources**: Read-only contexts (files, database rows, API responses) that can be attached to conversations.
- **Prompts**: User-controlled prompt templates with typed arguments.

Built with love by **MCP-Studio**!
`
          }
        ]
      };
    }

    if (uri === 'mock://config/environment') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                app: 'mcp-studio',
                mode: 'development',
                version: '1.0.0',
                featureFlags: {
                  liveLogStream: true,
                  benchmarking: true,
                  schemaValidation: true
                }
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Match template mock://users/{userId}/profile
    const userMatch = uri.match(/^mock:\/\/users\/([^/]+)\/profile$/);
    if (userMatch) {
      const userId = userMatch[1];
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                id: userId,
                name: `User ${userId}`,
                email: `user_${userId}@studio.test`,
                tier: 'pro_developer',
                permissions: ['tools:call', 'resources:read']
              },
              null,
              2
            )
          }
        ]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  }

  getPrompts(): PromptItem[] {
    return [
      {
        name: 'code_review_assistant',
        description: 'Analyzes provided code for security vulnerabilities, edge cases, and performance.',
        arguments: [
          {
            name: 'code',
            description: 'The source code snippet to review',
            required: true
          },
          {
            name: 'language',
            description: 'Programming language (e.g. typescript, python, go)',
            required: false
          },
          {
            name: 'focusArea',
            description: 'Special focus (e.g. security, performance, readability)',
            required: false
          }
        ]
      },
      {
        name: 'sql_query_builder',
        description: 'Translates a natural language requirement into an optimized SQL query.',
        arguments: [
          {
            name: 'requirement',
            description: 'Plain English description of what data is needed',
            required: true
          },
          {
            name: 'dialect',
            description: 'SQL dialect (PostgreSQL, MySQL, SQLite)',
            required: false
          }
        ]
      }
    ];
  }

  async getPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
    if (name === 'code_review_assistant') {
      const { code = '', language = 'typescript', focusArea = 'security and best practices' } = args;
      return {
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
    }

    if (name === 'sql_query_builder') {
      const { requirement = '', dialect = 'PostgreSQL' } = args;
      return {
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
    }

    throw new Error(`Prompt not found: ${name}`);
  }
}
