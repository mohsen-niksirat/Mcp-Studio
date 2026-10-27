import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from './App';

// Minimal WebSocket stand-in: App only assigns handlers and closes on unmount.
// A real socket would retry-reconnect every 3s and reach for the network.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((ev: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close(): void {}
}

describe('App', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    // No backend in tests: api falls back to the in-browser standalone engine.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the navigation sidebar without crashing in standalone mode', async () => {
    render(<App />);

    expect(await screen.findByText('Tools Runner')).toBeTruthy();
    expect(screen.getByText('Resources')).toBeTruthy();
    expect(screen.getByText('Protocol Inspector')).toBeTruthy();
  });
});
