import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import net from 'net';
import dns from 'dns';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Hard caps so a runaway request cannot exhaust memory or header space. */
export const MAX_API_KEY_LENGTH = 512;
export const MAX_PAYLOAD_LENGTH = 4 * 1024 * 1024; // 4 MB JSON body
/** Upstream timeout: the proxy streams, but must not hang forever. */
export const UPSTREAM_TIMEOUT_MS = 60_000;
/**
 * Upstream base URLs pointing at private/internal addresses are rejected by
 * default to stop the proxy being used as an SSRF springboard. Set
 * ALLOW_PRIVATE_BASE_URL=1 to target local gateways (Ollama, LM Studio...).
 * Read per-request so tests and runtime config changes take effect.
 */
function allowPrivateBaseUrls(): boolean {
  return /^(1|true|yes)$/i.test(process.env.ALLOW_PRIVATE_BASE_URL || '');
}

export interface UpstreamResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<UpstreamResponse>;

interface ProxyRequestBody {
  apiKey?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  payload?: unknown;
  /** When true, Gemini is called via streamGenerateContent?alt=sse. */
  stream?: unknown;
}

/**
 * Reject base URLs that resolve to loopback, private, or link-local
 * addresses. DNS is resolved so an attacker cannot hide an internal target
 * behind a public-looking hostname.
 */
export async function isPrivateBaseUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true;
  }
  const host = parsed.hostname;
  // Literal IPs first.
  if (net.isIP(host)) {
    return isPrivateIp(host);
  }
  // Hostnames: resolve and check every returned address.
  const lookup = dns.promises.lookup;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    // Unresolvable host: the upstream fetch would fail anyway, but treat it
    // as private so we fail fast with a clear message.
    return true;
  }
}

export function isPrivateIp(ip: string): boolean {
  const v4 = ip.split('.').map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return (
      v4[0] === 10 ||
      v4[0] === 127 ||
      (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) ||
      (v4[0] === 192 && v4[1] === 168) ||
      (v4[0] === 169 && v4[1] === 254) ||
      v4[0] === 0
    );
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    /^::ffff:127\./.test(lower) ||
    /^::ffff:10\./.test(lower) ||
    /^::ffff:192\.168\./.test(lower) ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(lower)
  );
}

export function createChatProxyRouter(fetchImpl: FetchLike = fetch): Router {
  const router = Router();

  router.post('/api/chat/gemini', (req, res) => {
    const { apiKey, model, payload, stream } = (req.body || {}) as ProxyRequestBody;
    if (typeof apiKey !== 'string' || !apiKey) {
      return res.status(400).json({ error: 'apiKey is required' });
    }
    if (apiKey.length > MAX_API_KEY_LENGTH) {
      return res.status(400).json({ error: 'apiKey is too long' });
    }
    const serializedPayload = JSON.stringify(payload ?? {});
    if (serializedPayload.length > MAX_PAYLOAD_LENGTH) {
      return res.status(413).json({ error: 'payload is too large' });
    }
    const modelName = typeof model === 'string' && model ? model : 'gemini-2.0-flash';
    if (!/^[A-Za-z0-9._-]+$/.test(modelName)) {
      return res.status(400).json({ error: 'model must be a valid model identifier' });
    }
    // Streaming uses the SSE-flavored endpoint; the key still travels in the
    // x-goog-api-key header, never as a URL query param.
    const action =
      stream === true ? `${modelName}:streamGenerateContent?alt=sse` : `${modelName}:generateContent`;
    forwardUpstream(res, fetchImpl, `${GEMINI_BASE_URL}/models/${action}`, {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    }, serializedPayload);
  });

  router.post('/api/chat/openai', async (req, res) => {
    const { apiKey, baseUrl, payload } = (req.body || {}) as ProxyRequestBody;
    if (typeof apiKey === 'string' && apiKey.length > MAX_API_KEY_LENGTH) {
      return res.status(400).json({ error: 'apiKey is too long' });
    }
    const serializedPayload = JSON.stringify(payload ?? {});
    if (serializedPayload.length > MAX_PAYLOAD_LENGTH) {
      return res.status(413).json({ error: 'payload is too large' });
    }
    const base = typeof baseUrl === 'string' && baseUrl ? baseUrl.replace(/\/+$/, '') : OPENAI_DEFAULT_BASE_URL;
    if (!/^https?:\/\//i.test(base)) {
      return res.status(400).json({ error: 'baseUrl must be an http(s) URL' });
    }
    if (!allowPrivateBaseUrls() && base !== OPENAI_DEFAULT_BASE_URL) {
      if (await isPrivateBaseUrl(base)) {
        return res.status(400).json({
          error:
            'baseUrl resolves to a private/internal address; set ALLOW_PRIVATE_BASE_URL=1 to allow local gateways'
        });
      }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof apiKey === 'string' && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    forwardUpstream(res, fetchImpl, `${base}/chat/completions`, headers, serializedPayload);
  });

  return router;
}

function forwardUpstream(
  res: Response,
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: string
): void {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  fetchImpl(url, { method: 'POST', headers, body, signal: controller.signal })
    .then((upstream) => {
      clearTimeout(timeout);
      res.status(upstream.status);
      const contentType = upstream.headers?.get?.('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (!upstream.body) {
        res.end();
        return;
      }
      // Stream the upstream body straight through to the client.
      const passthrough = Readable.fromWeb(upstream.body);
      passthrough.on('error', () => {
        // Headers are already sent; all we can do is tear the connection down
        // instead of leaving it hanging (or crashing on an unhandled error).
        res.destroy();
      });
      passthrough.pipe(res);
    })
    .catch((err: unknown) => {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        if ((err as Error)?.name === 'AbortError') {
          res.status(504).json({ error: `Chat proxy upstream timed out after ${UPSTREAM_TIMEOUT_MS}ms` });
        } else {
          res.status(502).json({ error: `Chat proxy upstream request failed: ${message}` });
        }
      } else {
        res.end();
      }
    });
}
