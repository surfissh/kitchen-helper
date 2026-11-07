import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchText, HttpError, postJson } from "../app-src/recipe/http.ts";

/** Replace global fetch; returns a restore fn. */
function stubFetch(handler: typeof fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

async function expectHttpError(
  errorP: Promise<unknown>,
  check: (error: HttpError) => void,
): Promise<void> {
  let caught: unknown = null;
  try {
    await errorP;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof HttpError)) {
    throw new Error(`expected an HttpError, got ${String(caught)}`);
  }
  check(caught);
}

test("the request timeout stays armed while the response body is read", async () => {
  let aborted = false;
  const restore = stubFetch((async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        signal.addEventListener("abort", () => {
          aborted = true;
          controller.error(new DOMException("aborted", "AbortError"));
        });
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch);
  try {
    await expectHttpError(fetchText("https://example.test/slow", { timeoutMs: 30 }), (error) => {
      assert.match(error.message, /timed out after 30 ms/);
    });
    assert.equal(aborted, true);
  } finally {
    restore();
  }
});

test("non-2xx responses surface as HttpError with the status", async () => {
  const restore = stubFetch(
    (async () =>
      new Response("nope", { status: 503, statusText: "Service Unavailable" })) as typeof fetch,
  );
  try {
    await expectHttpError(fetchText("https://example.test/down"), (error) => {
      assert.equal(error.status, 503);
      assert.match(error.message, /HTTP 503/);
    });
  } finally {
    restore();
  }
});

test("postJson sends JSON and parses the response body", async () => {
  let seen: { method?: string; body?: unknown; contentType?: string } = {};
  const restore = stubFetch((async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    seen = {
      method: init?.method,
      body: JSON.parse(String(init?.body ?? "null")) as unknown,
      contentType: headers["Content-Type"],
    };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch);
  try {
    const payload = await postJson<{ ok: boolean }>(
      "https://example.test/api",
      { hello: "world" },
      { timeoutMs: 1_000, headers: { Authorization: "Bearer token" } },
    );
    assert.deepEqual(payload, { ok: true });
    assert.equal(seen.method, "POST");
    assert.deepEqual(seen.body, { hello: "world" });
    assert.equal(seen.contentType, "application/json");
  } finally {
    restore();
  }
});
