# End-to-end tests

Playwright specs that drive the real stack: the Express backend on `:4999`
and the Vite dev server (proxying `/api` and `/ws`) on `:5173`. Playwright
starts and waits for both automatically — no manual setup is needed.

```bash
pnpm --filter mcp-studio-e2e test                # all local projects
pnpm --filter mcp-studio-e2e exec playwright test --project=chromium
pnpm --filter mcp-studio-e2e exec playwright test --headed
pnpm exec playwright show-trace e2e/test-results/<failed-test>/trace.zip
```

## Design constraints

- **The backend holds one global active-server state**, so tests run
  serially (`workers: 1`) and every spec establishes its own precondition
  (see `helpers.ts`) instead of trusting state left by a previous test.
- **The backend keeps every server added during a run**, so specs that add
  servers use names unique to the browser project
  (`E2E Fake Server (chromium)` and friends).
- The demo server's schema labels render a required-marker asterisk that is
  `aria-hidden` but still part of the label text, so field lookups use word
  boundary regexes (`getByLabel(/^a\b/)`) rather than exact strings.

## Browser support

CI runs **chromium only** (see the `e2e` job in `.github/workflows/ci.yml`).
Locally all three projects run: chromium and webkit are stable; **firefox on
machines without GPU acceleration** (software WebRender, `GFX1` warnings) is
much slower and can hang sporadically under a full-suite load — individual
specs pass reliably in isolation. If a local firefox run flakes, re-run the
firefox project on its own:

```bash
pnpm --filter mcp-studio-e2e exec playwright test --project=firefox
```
