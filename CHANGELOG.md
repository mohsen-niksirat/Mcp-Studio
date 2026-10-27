# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.3.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mohsen-niksirat/Mcp-Studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mohsen-niksirat/Mcp-Studio/releases/tag/v1.0.0
