import assert from 'assert';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createChatProxyRouter, FetchLike } from '../src/chat/chat-proxy.js';

const SECRET_KEY = 'test-secret-key-123';

interface CapturedRequest {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

function makeStubFetch(status: number, responseBody: unknown) {
  const calls: CapturedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(JSON.stringify(responseBody));
    return {
      status,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null)
      },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        }
      })
    };
  };
  return { calls, fetchImpl };
}

function startServer(router: express.Router): Promise<{ server: Server; port: number }> {
  const app = express();
  app.use(express.json());
  app.use(router);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      resolve({ server, port: address.port });
    });
  });
}

async function postJson(port: number, path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function runTests() {
  console.log('🧪 Starting Chat Proxy Tests...\n');

  // 1. Gemini: forwards to the upstream URL with the key in a header, never in the URL
  {
    const { calls, fetchImpl } = makeStubFetch(200, { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] });
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    const { status, json } = await postJson(port, '/api/chat/gemini', {
      apiKey: SECRET_KEY,
      model: 'gemini-2.0-flash',
      payload: { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] }
    });

    server.close();
    assert.strictEqual(status, 200, 'proxy should answer 200 when upstream succeeds');
    assert.strictEqual(json.candidates[0].content.parts[0].text, 'Hi', 'upstream body should be piped back');

    assert.strictEqual(calls.length, 1, 'exactly one upstream request expected');
    const upstream = calls[0];
    assert.strictEqual(
      upstream.url,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      'upstream URL should target the Gemini generateContent endpoint'
    );
    assert(!upstream.url.includes(SECRET_KEY), 'API key must never appear in the upstream URL');
    assert.strictEqual(
      upstream.init.headers?.['x-goog-api-key'],
      SECRET_KEY,
      'API key should be sent via the x-goog-api-key header'
    );
    const sentPayload = JSON.parse(upstream.init.body || '{}');
    assert.deepStrictEqual(
      sentPayload,
      { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] },
      'request payload should be forwarded verbatim'
    );
    console.log('✅ Gemini proxy forwards with key in header only');
  }

  // 2. Gemini: missing key is rejected locally with 400 and never reaches upstream
  {
    const { calls, fetchImpl } = makeStubFetch(200, {});
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    const { status, json } = await postJson(port, '/api/chat/gemini', {
      model: 'gemini-2.0-flash',
      payload: {}
    });

    server.close();
    assert.strictEqual(status, 400, 'missing apiKey should be rejected with 400');
    assert(json.error, '400 response should carry an error message');
    assert.strictEqual(calls.length, 0, 'no upstream request should happen without a key');
    console.log('✅ Gemini proxy rejects missing API key with 400');
  }

  // 3. OpenAI: forwards to the chat/completions endpoint with a Bearer header, never in the URL
  {
    const { calls, fetchImpl } = makeStubFetch(200, { choices: [{ message: { content: 'Hey' } }] });
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    const { status, json } = await postJson(port, '/api/chat/openai', {
      apiKey: SECRET_KEY,
      payload: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }] }
    });

    server.close();
    assert.strictEqual(status, 200);
    assert.strictEqual(json.choices[0].message.content, 'Hey', 'upstream body should be piped back');

    assert.strictEqual(calls.length, 1);
    const upstream = calls[0];
    assert.strictEqual(
      upstream.url,
      'https://api.openai.com/v1/chat/completions',
      'default upstream URL should be the OpenAI chat completions endpoint'
    );
    assert(!upstream.url.includes(SECRET_KEY), 'API key must never appear in the upstream URL');
    assert.strictEqual(
      upstream.init.headers?.['Authorization'],
      `Bearer ${SECRET_KEY}`,
      'API key should be sent via the Authorization header'
    );
    console.log('✅ OpenAI proxy forwards with Bearer header only');
  }

  // 4. OpenAI: honours a custom baseUrl (Ollama-style endpoints)
  {
    const { calls, fetchImpl } = makeStubFetch(200, { choices: [] });
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    await postJson(port, '/api/chat/openai', {
      baseUrl: 'http://localhost:11434/v1',
      payload: { model: 'llama3.1', messages: [] }
    });

    server.close();
    assert.strictEqual(calls[0].url, 'http://localhost:11434/v1/chat/completions');
    assert.strictEqual(calls[0].init.headers?.['Authorization'], undefined, 'no Authorization header without a key');
    console.log('✅ OpenAI proxy honours custom baseUrl and optional key');
  }

  // 5. Upstream failure status is propagated to the client
  {
    const { fetchImpl } = makeStubFetch(401, { error: { message: 'Invalid API key' } });
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    const { status, json } = await postJson(port, '/api/chat/gemini', {
      apiKey: SECRET_KEY,
      model: 'gemini-2.0-flash',
      payload: {}
    });

    server.close();
    assert.strictEqual(status, 401, 'upstream status should be propagated');
    assert.strictEqual(json.error?.message, 'Invalid API key', 'upstream error body should be piped back');
    console.log('✅ Upstream error status and body are propagated');
  }

  // 6. Upstream stream failing mid-flight must not hang the client or crash the process
  {
    const failingFetch: FetchLike = async () => ({
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('upstream stream blew up'));
        }
      })
    });
    const { server, port } = await startServer(createChatProxyRouter(failingFetch));

    let settled = false;
    const attempt = fetch(`http://127.0.0.1:${port}/api/chat/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: SECRET_KEY, model: 'gemini-2.0-flash', payload: {} })
    })
      .then(() => {
        settled = true;
      })
      .catch(() => {
        settled = true; // a reset connection is an acceptable outcome
      });
    await Promise.race([attempt, new Promise((_, reject) => setTimeout(() => reject(new Error('client request hung')), 5000))]);
    await attempt;

    server.close();
    assert(settled, 'client request should settle instead of hanging forever');
    console.log('✅ Upstream stream failure neither hangs the client nor crashes the process');
  }

  // 7. A crafted model identifier must be rejected before it reaches the upstream URL
  {
    const { calls, fetchImpl } = makeStubFetch(200, {});
    const { server, port } = await startServer(createChatProxyRouter(fetchImpl));

    const { status } = await postJson(port, '/api/chat/gemini', {
      apiKey: SECRET_KEY,
      model: 'evil/../../v1beta/models/x?key=leak',
      payload: {}
    });

    server.close();
    assert.strictEqual(status, 400, 'crafted model identifiers should be rejected with 400');
    assert.strictEqual(calls.length, 0, 'nothing should be forwarded for an invalid model');
    console.log('✅ Invalid model identifiers are rejected before reaching the upstream URL');
  }

  console.log('\n🎉 ALL CHAT PROXY TESTS PASSED!\n');
}

runTests().catch((err) => {
  // GitHub Actions turns "::error::" lines into public annotations.
  console.error(`${process.env.CI ? '::error::' : ''}Test failed:`, err?.stack || err);
  process.exit(1);
});
