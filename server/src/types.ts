export type TransportType = 'stdio' | 'sse' | 'mock';

export interface ServerConfig {
  id: string;
  name: string;
  transport: TransportType;
  // stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse fields
  url?: string;
  headers?: Record<string, string>;
  // metadata
  isBuiltIn?: boolean;
  source?: 'manual' | 'claude' | 'cursor' | 'antigravity';
  createdAt: number;
}

export type ServerStatusType = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ServerState {
  config: ServerConfig;
  status: ServerStatusType;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
    protocolVersion?: string;
  };
  connectedAt?: number;
  lastPingMs?: number;
}

export interface JsonRpcMessageLog {
  id: string;
  timestamp: number;
  direction: 'outgoing' | 'incoming';
  method?: string;
  rpcId?: string | number;
  data: any;
  latencyMs?: number;
  isError?: boolean;
}

export interface ToolInputSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface ToolItem {
  name: string;
  description?: string;
  inputSchema: ToolInputSchema;
}

export interface ResourceItem {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplateItem {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptItem {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface BenchmarkResult {
  toolName?: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}
