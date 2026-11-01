# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-11-01

### Added
- **Server config persistence**: registered servers survive backend restarts
  via `~/.mcp-studio/servers.json`, written atomically (tmp + rename); the
  built-in demo server never duplicates, corrupt stores fall back to
  defaults, and `MCP_STUDIO_DISABLE_PERSISTENCE=1` opts out.
- **Chat streaming (OpenAI/Ollama + Gemini)**: responses stream token by
  token through the existing secure proxy — OpenAI-compatible endpoints via
  `stream: true` and Gemini via `streamGenerateContent?alt=sse` — with an
  automatic non-streaming fallback when the upstream cannot stream or a
  function call is detected.
- **Automatic crash recovery**: after an unexpected stdio exit or a closed
  SSE/streamable-http connection the manager retries with exponential
  backoff (1s/2s/4s, capped at 30s per attempt, max 3 attempts) and
  publishes the attempt count in the state; manual disconnect cancels the
  retry.
- **Chat history export/import**: the AI Chat Sandbox can download the full
  conversation as JSON and re-import it, complementing localStorage.
- **Transport-aware code snippets + Go**: the snippet generator emits
  remote-transport snippets (Python httpx, TypeScript
  StreamableHTTPClientTransport, raw curl with auth headers) for
  sse/streamable-http servers, and adds a Go tab.
- **Server-side log filtering**: `GET /api/logs` accepts `direction`,
  `method`, `errorsOnly`, and `limit` query params; the TrafficView queries
  them with a configurable "Last N" selector and windows the rendered list
  to the newest 200 frames.
- **`streamable-http` transport**: remote MCP servers over Streamable HTTP
  (the modern MCP transport) are supported alongside SSE through the
  official MCP TypeScript SDK; both share the unified traffic logging.

### Fixed
- **JSON-RPC reply id matching**: a server replying with a string id to a
  numeric request id (or vice versa) no longer strands the pending request;
  matching is done on the canonical string form of the id.
- **JSON-RPC request timeout**: every RPC now carries a 10s timeout by
  default (configurable via `MCP_RPC_TIMEOUT_MS` or the constructor), so a
  silent stdio server can no longer hang `connect()` forever; timeouts
  reject with an explicit "request timed out" error and are logged.
- **connect/disconnect race**: concurrent `connect()` calls are serialized
  through an internal queue; a failed connect (spawn error, initialize
  failure, timeout) now releases the active slot so the next connect works
  without a server restart.
- **Express 5 migration**: the removed `app.get('*')` wildcard is replaced
  by a catch-all middleware (API/WS paths excluded, GET/HEAD only) and
  `express` is now declared at `^5.1.0` to match the code.
- **Chat proxy hardening**: upstream calls carry a 60s abort timeout
  (surfacing as 504); OpenAI `baseUrl` targets resolving to private /
  loopback / link-local addresses are rejected by default with
  `ALLOW_PRIVATE_BASE_URL=1` as the escape hatch; `apiKey` (512 chars) and
  payload (4 MB) size caps are enforced before any upstream call.
- **Benchmark input clamping**: `runBenchmark` clamps iterations into
  [1, 100], so `0`/negative/NaN inputs can no longer produce NaN or
  Infinity statistics.
- **Standalone web `addServer`**: keeps `command`/`args`/`env`/`url`/
  `headers` on the created config and rejects non-mock transports with a
  clear "in-browser standalone demo" message.
- **Mock-chat regex hygiene**: intent patterns are collected into a
  documented constant and the invalid `\-` escape inside a character class
  is removed.

### Changed
- **CI**: the pipeline now also builds the server and runs the full
  monorepo `pnpm build` so cross-workspace regressions fail before merge.

## [1.4.0] - 2026-10-31

### Added
- **SSE transport**: remote MCP servers over Server-Sent Events are now fully supported
  in the backend bridge using the official MCP TypeScript SDK (`SSEClientTransport` +
  `Client`) — connect/disconnect, crash detection on remote close, custom auth headers,
  and all tools/resources/prompts operations logged into the Protocol Inspector with
  the same event stream the stdio path produces.
- **Crash auto-recovery in the UI**: the previously ignored `state:crashed` WebSocket
  event now clears stale entity lists and automatically issues a clean-session
  reconnect through the existing `/api/servers/:id/reconnect` endpoint.
- **Shared design system**: `surface`/`brand` color tokens, reusable UI primitives
  (`Button`, `Card`, `Badge`, `EmptyState`, `Spinner`, `StatusDot`), a `cn()` class
  helper, and component-layer CSS (`.glass`, `.code-block`, `.section-label`,
  `.focus-ring`).

### Fixed
- WebSocket reconnect timer leak in `App.tsx`: the pending 3s reconnect timer is now
  tracked and cleared on unmount instead of stacking untracked `setTimeout` calls.
- Stale tool selection in the Tools Runner: the selected tool now syncs with the live
  tool catalog instead of pointing at a tool that disappeared after a server switch.
- Protocol Inspector pause toggle now actually pauses follow-the-latest-frame behavior.
- `api.reconnect()` client method added to reach the backend reconnect endpoint.

### Changed
- Full UI refresh: Navbar, Sidebar, and every view (Tools, Resources, Prompts, Traffic,
  Benchmark, Chat, Collections, ServerModal, CommandPalette) rebuilt on the design
  system with consistent spacing, visible keyboard focus rings, unified empty states
  and spinners, and no hardcoded hex colors.

## [1.3.0] - 2026-10-28

### Added
- **CI pipeline** (`.github/workflows/ci.yml`): Node 20 & 22 matrix, pnpm store caching,
  frozen-lockfile install, `tsc --noEmit` for both workspaces, backend tests, client tests,
  and client build, with a status badge in the README.
- **Client test suite**: Vitest + Testing Library (jsdom) with **11 tests** covering
  `lib/chat-service.ts` (mock provider routing, tool-error reporting, missing Gemini key
  rejection, proxy request shape), `lib/api.ts` (request/error handling with mocked fetch,
  standalone-web fallback), and an `App.tsx` sidebar smoke test.
- **Secure server-side AI chat proxy**: `POST /api/chat/gemini` and `POST /api/chat/openai`
  receive provider keys in the request body over the local Express server and forward them
  in headers (`x-goog-api-key` / `Authorization: Bearer`) — the key never appears in any URL.
  Upstream responses are streamed back, upstream status codes propagate, and model names are
  validated before URL interpolation.
- **stdio crash resilience**: an unexpected exit of the active stdio process emits a
  `state:crashed` event, rejects in-flight JSON-RPC requests with the crash reason, and a
  `POST /api/servers/:id/reconnect` endpoint restores the connection.

### Fixed
- Upstream stream failures mid-response no longer crash the server process or hang clients.
- Stale stdio process exits (e.g. right after a reconnect) are no longer misreported as crashes.

### Changed
- The Node 20 CI leg installs with pnpm 10, since pnpm 11 requires Node ≥ 22.13.

## [1.2.0] - 2026-10-25

### Added
- Test Collections Scenario Runner: multi-step sequential test suites with output assertions,
  latency measurement, and JSON export/import.
- Raycast-style Command Palette (`Ctrl+K`) with fuzzy search across tools, workspaces, and actions.

## [1.1.0] - 2026-10-25

### Added
- 1-click Code Snippet generator (Python / TypeScript / cURL) for any executed tool.
- Hero banner and community submission guide with launch playbook.

## [1.0.0] - 2026-10-25

### Added
- Initial release: visual IDE for MCP servers with multi-server hot-switching, tool runner,
  resource explorer, prompt inspector, live JSON-RPC traffic view, benchmark suite,
  config importer, in-browser web demo, and Windows desktop executable.

[1.5.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mohsen-niksirat/Mcp-Studio/releases/tag/v1.0.0
