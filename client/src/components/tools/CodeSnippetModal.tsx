import React, { useState } from 'react';
import { X, Copy, Check, Code2, Terminal, FileCode } from 'lucide-react';
import { ToolItem } from '../../types';

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: ToolItem;
  args: Record<string, any>;
}

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  tool,
  args
}) => {
  const [lang, setLang] = useState<'python' | 'typescript' | 'curl'>('python');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const argsJson = JSON.stringify(args, null, 2);

  const getPythonSnippet = () => {
    return `import asyncio
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
`;
  };

  const getTypeScriptSnippet = () => {
    return `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
`;
  };

  const getCurlSnippet = () => {
    return `# Direct JSON-RPC Call via MCP-Studio Bridge API
curl -X POST http://localhost:4999/api/servers/active/tools/call \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ name: tool.name, arguments: args }, null, 2)}'
`;
  };

  const activeCode =
    lang === 'python'
      ? getPythonSnippet()
      : lang === 'typescript'
      ? getTypeScriptSnippet()
      : getCurlSnippet();

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-2">
            <Code2 className="h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Code Snippet Generator
              </h3>
              <p className="text-xs text-slate-400">
                Integration code for tool: <span className="font-mono text-indigo-300 font-bold">{tool.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Language Tabs & Copy Button */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setLang('python')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                lang === 'python'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Python
            </button>
            <button
              onClick={() => setLang('typescript')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                lang === 'typescript'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              TypeScript
            </button>
            <button
              onClick={() => setLang('curl')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                lang === 'curl'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              cURL (JSON-RPC)
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-all"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Code Content */}
        <div className="p-6 bg-[#090d16] overflow-x-auto max-h-[55vh]">
          <pre className="font-mono text-xs text-indigo-200 leading-relaxed selection:bg-indigo-500/30 whitespace-pre">
            {activeCode}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <span>Ready to paste into your AI agent or backend service</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
