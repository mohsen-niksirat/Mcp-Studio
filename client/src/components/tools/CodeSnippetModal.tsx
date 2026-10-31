import React, { useState } from 'react';
import { Check, Code2, Copy, X } from 'lucide-react';
import { ToolItem } from '../../types';
import { Button } from '../ui/primitives';

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: ToolItem;
  args: Record<string, any>;
}

type Lang = 'python' | 'typescript' | 'curl';

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  tool,
  args
}) => {
  const [lang, setLang] = useState<Lang>('python');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const argsJson = JSON.stringify(args, null, 2);

  const snippets: Record<Lang, string> = {
    python: `import asyncio
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
                name="${tool.name}",
                arguments=${argsJson}
            )
            print(result)

if __name__ == "__main__":
    asyncio.run(run())
`,
    typescript: `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
    name: "${tool.name}",
    arguments: ${argsJson}
  });

  console.log("Result:", result);
}

main().catch(console.error);
`,
    curl: `# Direct JSON-RPC call via the MCP-Studio bridge API
curl -X POST http://localhost:4999/api/servers/active/tools/call \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ name: tool.name, arguments: args }, null, 2)}'
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
              <p className="text-xs text-slate-500">
                Integration code for{' '}
                <span className="font-mono text-brand-300 font-medium">
                  {tool.name}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
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
