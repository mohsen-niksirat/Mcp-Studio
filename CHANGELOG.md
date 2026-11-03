# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.3] - 2026-11-02

### Changed
- **UI redesign with a documented design direction** (`DESIGN.md`): the
  studio moves from the default indigo-on-slate look to a deliberate
  "instrument panel" identity — emerald signal color ("run green", the
  product's core action), IBM Plex Sans + JetBrains Mono, a request/response
  chevron brand mark and favicon, flat surfaces without gradients or glow.

### Fixed
- **Fabricated conformance claims**: the benchmark view no longer shows
  hardcoded green-check "protocol conformance" items that were never
  measured; it shows real session facts (transport, negotiated protocol,
  server, connected-since) and states plainly that only latency is measured.
- **Text contrast below WCAG AA**: all low-contrast slate-500 text
  (≈4.2:1) raised to slate-400 (≈7.9:1) across every view, including input
  placeholders.
- **No visible keyboard focus** on list buttons, tabs and chips: one global
  `:focus-visible` ring now covers every interactive element.
- **No responsive layout**: the desktop sidebar becomes a scrollable tab
  strip on narrow viewports, every multi-pane view stacks vertically, and
  touch pointers get ≥44px targets. Verified at 390px.
- **Silent backend failure**: an app-level alert banner with a Retry button
  appears when the backend cannot be reached.
- **Generic "AI sparkle" icons** replaced with content-mapped glyphs;
  decorative gradients and functionless "IDE"/"AI" capsule badges removed;
  the one-off purple hue is gone from the palette.
- **Accessibility details**: icon-only buttons carry `aria-label`, list
  items expose `aria-current`, `prefers-reduced-motion` disables
  non-essential motion, and the palette hint shows `Ctrl K` on non-Apple
  platforms.

## [1.5.2] - 2026-11-02

### Fixed
- **Windows release archive was broken**: the desktop zip shipped
  `server/dist` without `node_modules`, so `MCP-Studio.exe` launched a
  server that died instantly with `Cannot find module 'express'` and the
  browser opened an error page. The release build now bundles the backend
  into a single self-contained `server/dist/index.js` (esbuild, all runtime
  dependencies inlined) — the desktop app works out of the box with only
  Node.js installed. (The v1.5.1 archive has the same defect; use v1.5.2.)

## [1.5.1] - 2026-11-02

### Security
- **Origin-restricted API surface**: the backend previously answered every
  endpoint (including server registration that spawns local processes) with
  fully open CORS; browser origins are now limited to the bundled UI
  (Vite dev server and the production/desktop origin), and WebSocket
  connections validate the `Origin` header the same way. Any website a user
  visits could previously drive the local backend cross-origin.
- **Secrets no longer leave the backend**: `env` values (imported tokens,
  credentials) are redacted in every REST response and WebSocket broadcast;
  the persisted store keeps the real values.
- **Hardened stdio spawning**: arguments are shell-quoted before the
  `shell: true` spawn (fixing args containing spaces, e.g. Windows paths)
  and arguments containing double quotes, line breaks, or NUL bytes are
  rejected with a clear error instead of being interpreted by the shell.

### Fixed
- **Remote transport operations**: `tools/list` had no SSE/streamable-http
  branch and always fell into the stdio path, so the Tools tab (and the
  benchmark) failed for every remote server; all MCP operations now
  dispatch on the active SDK client instead of the literal `'sse'` string,
  which also makes `streamable-http` servers fully usable.
- **Orphaned stdio processes**: a connect that failed after spawn (e.g.
  initialize timeout) now kills the child process immediately; previously
  the orphan leaked and could later hijack the active state with a
  `state:crashed` event and trigger an unwanted auto-reconnect.
- **Crash-retry slot stealing**: the automatic reconnect timer no longer
  fires when the user has switched to a different server in the meantime.
- **Remote connect hangs**: the SDK handshake is bounded by a 15s timeout
  and a failed remote connect tears down the half-open transport, so one
  silent endpoint can no longer wedge the serialized connect queue.
- **WebSocket robustness**: server- and socket-level `error` events are
  handled instead of crashing the process, and `broadcast()` tolerates
  closed sockets.
- **SSE traffic inspector**: response frames are no longer logged twice
  (once as a phantom notification); latency attribution stays with the
  owning request.
- **Chat proxy streaming**: an idle timeout re-arms on every streamed chunk
  so a stalled upstream cannot pin the response open forever, and the
  upstream request is aborted as soon as the browser disconnects.
- **REST input validation**: `POST /api/servers` and `/api/import/apply`
  validate transport, command/url, args, env, and header shapes at the
  boundary instead of persisting junk configs that only fail at connect.
- **Client: chat crash on corrupted storage**: the chat history/config
  `localStorage` initializers are guarded, so a corrupted entry can no
  longer white-screen the app on load.
- **Client: multi tool-call contract**: the OpenAI-compatible chat loop now
  executes every returned `tool_call` and answers with one `role: "tool"`
  message per call, instead of dropping all but the first (which caused
  API 400s on follow-up turns).
- **Client: import flow**: `importServers` checks `res.ok` and surfaces the
  server error, and re-imported servers merge by id instead of duplicating.
- **Client: schema form editing**: the raw JSON editor no longer fights the
  form fields (caret jumps / rewritten text mid-typing), and non-object
  JSON is rejected as form values.
- **Client: traffic view**: `/api/logs` is fetched once and merged with
  live WebSocket frames in memory (no refetch per frame), with a debounced
  search filter.
- **Client: stale async writes**: tool executions, server connects, and
  collection runs guard against out-of-order responses so results can no
  longer land under the wrong tool/server or revert concurrent edits.
- **Client: server modal**: state resets between opens, quoted arguments
  (`--root "C:\Program Files\server"`) parse correctly, and SSE URLs are
  validated before submit.
- **Client: command palette**: selecting a tool result now actually opens
  and selects that tool in the runner.
- **Client: misc**: code snippets escape shell metacharacters, chat history
  persistence is debounced (was: on every streaming token), imported JSON
  is shape-validated, and the WebSocket reconnect uses capped exponential
  backoff.

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
