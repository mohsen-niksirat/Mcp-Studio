# 🚀 MCP-Studio Launch Playbook

Ready-to-post copy for Reddit, Hacker News, X (Twitter), and Product Hunt to launch **MCP-Studio** and drive GitHub stars.

---

## 1. Reddit Posts

### 📌 Target 1: r/ClaudeAI & r/LocalLLaMA
**Title:**  
> I built MCP-Studio: An open-source "Postman" & visual testing IDE for Model Context Protocol (MCP) servers

**Post Body:**
```markdown
Hey everyone! 👋

Like many of you, I've been building custom Model Context Protocol (MCP) servers to give Claude and local AI models access to custom tools, databases, and APIs.

However, the developer experience for testing MCP servers was painful:
- Editing `claude_desktop_config.json` and restarting Claude Desktop 20 times just to test one tool.
- Blindly debugging stdio streams and raw JSON-RPC responses.
- No quick way to benchmark latency or generate integration code.

So I built **MCP-Studio** — a fast, visual testing studio & IDE designed specifically for MCP developers:

🌟 **Highlights:**
- 🛠️ **Dynamic Schema Form Generator**: Parses any tool's JSON Schema and builds intuitive, type-safe input controls with instant validation.
- 🤖 **AI Chat Sandbox**: Test your tools with an autonomous agent! Works with Google Gemini, local Ollama (Llama 3/Qwen), OpenAI, or a zero-key built-in simulator.
- 📡 **Live Protocol Inspector**: Real-time bidirectional JSON-RPC 2.0 stream with millisecond latency metrics.
- 💻 **1-Click Code Generator**: Generates copy-paste Python, TypeScript, and cURL snippets for any tool with your parameters.
- ⚡ **Zero-Install Web Demo**: Runs completely in the browser via GitHub Pages, plus a native lightweight 2.5MB Windows `.exe`.
- 📥 **Auto-Config Importer**: One-click import from Claude Desktop & Cursor.

It's 100% free and open-source (MIT).

🔗 **GitHub Repo:** https://github.com/mohsen-niksirat/Mcp-Studio
🌐 **Live Web Demo:** https://mohsen-niksirat.github.io/Mcp-Studio/
📦 **Windows Desktop .EXE:** Available in the Releases tab!

I'd love your feedback, feature ideas, and contributions! If you find it helpful, dropping a ⭐ on GitHub would mean the world.
```

---

### 📌 Target 2: r/webdev & r/programming
**Title:**  
> Show r/webdev: MCP-Studio – Visual IDE & Testing Studio for Model Context Protocol (React 19 + TypeScript + Go)

**Post Body:**
Focus on the technical architecture:
```markdown
Built with React 19, Tailwind CSS, Node.js WebSocket bridge, and a Go native desktop wrapper. The app inspects bidirectional JSON-RPC 2.0 over stdio processes and SSE streams, rendering dynamic forms directly from JSON Schema Draft-07.

Live web version runs in-browser with zero backend required via GitHub Pages.

Check it out: https://github.com/mohsen-niksirat/Mcp-Studio
```

---

## 2. Hacker News (Show HN)

**Title:**  
> Show HN: MCP-Studio – Open-source visual IDE and testing studio for MCP servers

**URL:** `https://github.com/mohsen-niksirat/Mcp-Studio`

**First Comment (from Maker):**
```markdown
Hi HN!

While writing tools for the Model Context Protocol (MCP), I found myself wishing for a Postman-like experience: something where I could point to a local `stdio` command or remote `SSE` URL, inspect the exposed tools and resources, test edge-case payloads in dynamic forms, and watch raw JSON-RPC frames stream in real-time.

MCP-Studio was built to fill that gap. Key capabilities:
1. Dynamic Schema Forms: Automatically builds UI controls for string, numbers, booleans, enums, and nested JSON.
2. AI Chat Sandbox: Connects to Gemini or local Ollama to let an LLM call your MCP tools autonomously.
3. Protocol Inspector: Logs every request/response pair with roundtrip latency jitter.
4. Native Windows .exe (2.5MB Go wrapper) + In-browser WebAssembly/TS simulator on GitHub Pages.

Feedback and PRs welcome:
- GitHub: https://github.com/mohsen-niksirat/Mcp-Studio
- Live Demo: https://mohsen-niksirat.github.io/Mcp-Studio/
```

---

## 3. Twitter / X Thread

**Tweet 1 (Hook):**  
> Testing MCP servers with Claude Desktop is clunky.
>
> So I built **MCP-Studio**: The open-source "Postman" and visual IDE for Model Context Protocol.
>
> ⚡ Auto-generated forms from JSON Schema
> 🤖 AI Chat Sandbox (Gemini + Ollama)
> 📡 Live JSON-RPC traffic inspector
> 💻 1-click Python/TS code generator
>
> Try it in your browser: 👇
> https://mohsen-niksirat.github.io/Mcp-Studio/

**Tweet 2:**  
> Features:
> • Hot-switch between local stdio (Python/Node/uvx) & remote SSE servers
> • 1-click import from Claude Desktop & Cursor configs
> • Roundtrip latency benchmarks
> • Zero-install Web Demo + 2.5MB Windows .exe
>
> ⭐ Star on GitHub: https://github.com/mohsen-niksirat/Mcp-Studio
>
> #MCP #ModelContextProtocol #AI #Claude #OpenSource #DevTools

---

## 4. Product Hunt Pitch

- **Tagline**: The open-source Postman for Model Context Protocol (MCP)
- **Description**: Connect, test, inspect, benchmark, and chat with your MCP servers using dynamic schema forms and autonomous AI agents.
- **Pricing**: 100% Free & Open Source (MIT)
