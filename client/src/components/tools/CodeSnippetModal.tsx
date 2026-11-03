import React, { useState } from 'react';
import { Check, Code2, Copy, X } from 'lucide-react';
import { ServerState, ToolItem } from '../../types';
import { Button } from '../ui/primitives';

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: ToolItem;
  args: Record<string, any>;
  /** Active server state: used to tailor remote-transport snippets. */
  activeState?: ServerState | null;
}

type Lang = 'python' | 'typescript' | 'curl' | 'go';

const REMOTE_TRANSPORTS = new Set(['sse', 'streamable-http']);

// Escape a value embedded in a double-quoted string literal (Python/TS/Go).
const escapeDoubleQuotedLiteral = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Escape a value embedded in a POSIX shell single-quoted argument.
const escapeShellSingleQuoted = (value: string): string => value.replace(/'/g, `'\\''`);

// Escape a value embedded in a POSIX shell double-quoted argument.
const escapeShellDoubleQuoted = (value: string): string => value.replace(/"/g, '\\"');

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  tool,
  args,
  activeState
}) => {
  const [lang, setLang] = useState<Lang>('python');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const argsJson = JSON.stringify(args, null, 2);
  const isRemote = REMOTE_TRANSPORTS.has(activeState?.config.transport || '');
  const remoteUrl = activeState?.config.url || 'http://localhost:8000/mcp';
  const headerEntries = Object.entries(activeState?.config.headers || {});

  const snippets: Record<Lang, string> = {
    python: isRemote ? `import asyncio
import httpx

MCP_URL = "${remoteUrl}"
HEADERS = ${JSON.stringify(Object.fromEntries(headerEntries), null, 2).replace(/"([^"]+)":/g, '"$1":')}

async def call_tool():
    async with httpx.AsyncClient(timeout=30) as client:
        # 1) Initialize the MCP session
        init = await client.post(MCP_URL, headers=HEADERS, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "my-app", "version": "1.0.0"}
            }
        })
        session_id = init.headers.get("mcp-session-id")

        # 2) Call the tool: ${tool.name}
        result = await client.post(
            MCP_URL,
            headers={**HEADERS, "mcp-session-id": session_id or ""},
            json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": "${escapeDoubleQuotedLiteral(tool.name)}", "arguments": ${argsJson}}
            }
        )
        print(result.json())

asyncio.run(call_tool())
` : `import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run():
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@modelcontextprotocol/server-example"]
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Call MCP Tool: ${tool.name}
            result = await session.call_tool(
                name="${escapeDoubleQuotedLiteral(tool.name)}",
                arguments=${argsJson}
            )
            print(result)

if __name__ == "__main__":
    asyncio.run(run())
`,
    typescript: isRemote ? `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL("${remoteUrl}"),${
      headerEntries.length > 0
        ? `
    { requestInit: { headers: ${JSON.stringify(Object.fromEntries(headerEntries))} } }`
        : ''
    }
  );

  const client = new Client({ name: "my-app", version: "1.0.0" });
  await client.connect(transport);

  // Call MCP Tool: ${tool.name}
  const result = await client.callTool({
    name: "${escapeDoubleQuotedLiteral(tool.name)}",
    arguments: ${argsJson}
  });

  console.log("Result:", result);
}

main().catch(console.error);
` : `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-example"]
  });

  const client = new Client({ name: "my-app", version: "1.0.0" });
  await client.connect(transport);

  // Call MCP Tool: ${tool.name}
  const result = await client.callTool({
    name: "${escapeDoubleQuotedLiteral(tool.name)}",
    arguments: ${argsJson}
  });

  console.log("Result:", result);
}

main().catch(console.error);
`,
    curl: isRemote ? `# Streamable HTTP / SSE MCP call via curl
curl -X POST ${remoteUrl} \\
  -H "Content-Type: application/json" \\${
    headerEntries.length > 0
      ? headerEntries.map(
          ([k, v]) => `
  -H "${escapeShellDoubleQuoted(k)}: ${escapeShellDoubleQuoted(v)}" \\`
        ).join('')
      : ''
  }
  -d '${escapeShellSingleQuoted(
    JSON.stringify(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: tool.name, arguments: args }
      },
      null,
      2
    )
  )}'
` : `# Direct JSON-RPC call via the MCP-Studio bridge API
curl -X POST http://localhost:4999/api/servers/active/tools/call \\
  -H "Content-Type: application/json" \\
  -d '${escapeShellSingleQuoted(JSON.stringify({ name: tool.name, arguments: args }, null, 2))}'
`,
    go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// Minimal JSON-RPC 2.0 call against the MCP-Studio bridge API.
func main() {
	payload := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "${escapeDoubleQuotedLiteral(tool.name)}",
			"arguments": ${argsJson},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Fatalf("marshal payload: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost,
		"http://localhost:4999/api/servers/active/tools/call",
		bytes.NewReader(body))
	if err != nil {
		log.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Fatalf("call failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Fatalf("decode response: %v", err)
	}
	fmt.Printf("Result: %+v\\n", result)
}
`
  };

  const activeCode = snippets[lang];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const langs: { id: Lang; label: string }[] = [
    { id: 'python', label: 'Python' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'go', label: 'Go' },
    { id: 'curl', label: 'cURL' }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="snippet-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-surface-950 border border-surface-800 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center">
              <Code2 className="h-4 w-4 text-brand-400" />
            </div>
            <div>
              <h3 id="snippet-modal-title" className="text-sm font-semibold text-slate-100">
                Code Snippet Generator
              </h3>
              <p className="text-xs text-slate-400">
                Integration code for{' '}
                <span className="font-mono text-brand-300 font-medium">
                  {tool.name}
                </span>
                {isRemote && (
                  <span className="ml-2 text-[10px] font-mono text-slate-400 uppercase">
                    {activeState?.config.transport} · {remoteUrl}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close snippet dialog"
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-md hover:bg-surface-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Language tabs */}
        <div className="px-5 py-3 border-b border-surface-800 flex items-center justify-between">
          <div className="flex items-center gap-1 bg-surface-900 border border-surface-800 rounded-md p-0.5">
            {langs.map((l) => (
              <button
                key={l.id}
                onClick={() => setLang(l.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  lang === l.id
                    ? 'bg-surface-800 text-slate-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <Button size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>

        {/* Code */}
        <div className="p-5 bg-surface-950 overflow-x-auto max-h-[55vh]">
          <pre className="font-mono text-xs text-slate-200 leading-relaxed whitespace-pre">
            {activeCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
