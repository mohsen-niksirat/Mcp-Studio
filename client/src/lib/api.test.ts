import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The api module keeps standalone-mode state at module scope, so each test
// gets a fresh instance via resetModules + dynamic import.
let api: typeof import('./api')['api'];

beforeEach(async () => {
  vi.resetModules();
  ({ api } = await import('./api'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api (server-backed mode)', () => {
  it('callTool posts the tool name and arguments as JSON to the active server endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.callTool('math_calculator', { a: 1, b: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/servers/active/tools/call');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'math_calculator', arguments: { a: 1, b: 2 } });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('addServer surfaces the backend error message when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Name and transport are required' })
      })
    );

    await expect(api.addServer({ name: 'Broken' })).rejects.toThrow(
      'Name and transport are required'
    );
  });

  it('connect falls back to a default error message when the failure body is unreadable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        }
      })
    );

    await expect(api.connect('server-1')).rejects.toThrow('Connection failed');
  });
});

describe('api (standalone web fallback)', () => {
  it('getServers switches to the in-browser engine when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const data = await api.getServers();

    expect(api.isWebStandalone()).toBe(true);
    expect(data.servers.length).toBeGreaterThan(0);
    expect(data.servers[0].transport).toBe('mock');
  });
});
