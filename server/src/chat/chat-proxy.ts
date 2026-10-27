import { Router, Request, Response } from 'express';
import { Readable } from 'stream';

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export interface UpstreamResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<UpstreamResponse>;

interface ProxyRequestBody {
  apiKey?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  payload?: unknown;
}

export function createChatProxyRouter(fetchImpl: FetchLike = fetch): Router {
  const router = Router();

  router.post('/api/chat/gemini', (req, res) => {
    const { apiKey, model, payload } = (req.body || {}) as ProxyRequestBody;
    if (typeof apiKey !== 'string' || !apiKey) {
      return res.status(400).json({ error: 'apiKey is required' });
    }
    const modelName = typeof model === 'string' && model ? model : 'gemini-2.0-flash';
    if (!/^[A-Za-z0-9._-]+$/.test(modelName)) {
      return res.status(400).json({ error: 'model must be a valid model identifier' });
    }
    // The key travels in the x-goog-api-key header, never as a URL query param.
    forwardUpstream(res, fetchImpl, `${GEMINI_BASE_URL}/models/${modelName}:generateContent`, {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    }, JSON.stringify(payload ?? {}));
  });

  router.post('/api/chat/openai', (req, res) => {
    const { apiKey, baseUrl, payload } = (req.body || {}) as ProxyRequestBody;
    const base = typeof baseUrl === 'string' && baseUrl ? baseUrl.replace(/\/+$/, '') : OPENAI_DEFAULT_BASE_URL;
    if (!/^https?:\/\//i.test(base)) {
      return res.status(400).json({ error: 'baseUrl must be an http(s) URL' });
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof apiKey === 'string' && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    forwardUpstream(res, fetchImpl, `${base}/chat/completions`, headers, JSON.stringify(payload ?? {}));
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
  fetchImpl(url, { method: 'POST', headers, body })
    .then((upstream) => {
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
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(502).json({ error: `Chat proxy upstream request failed: ${message}` });
      } else {
        res.end();
      }
    });
}
