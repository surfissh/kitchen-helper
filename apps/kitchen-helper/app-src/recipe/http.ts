/** Small fetch helpers with an explicit network budget and readable failures. */

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, url: string, status = 0) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export interface FetchOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
  readonly method?: "GET" | "POST";
  readonly body?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Transient failures worth retrying: no HTTP status, rate limits and 5xx. */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof HttpError)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

/**
 * Run one request and consume its body under a single deadline.
 *
 * The timeout must stay armed while the body is read: a non-streaming chat
 * completion arrives as one body that is produced by the model after the
 * response headers, so clearing the timer on headers alone would leave the
 * actual generation unbounded.
 */
async function requestOnce<T>(
  url: string,
  options: FetchOptions,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "User-Agent": "KitchenHelper-IrisView/1.0 (+HowToCook demo)",
        ...options.headers,
      },
      body: options.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status} for ${url}`, url, response.status);
    }
    return await consume(response);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isAbortError(error)) {
      throw new HttpError(`request timed out after ${timeoutMs} ms`, url);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError(`network request failed: ${reason}`, url);
  } finally {
    clearTimeout(timer);
  }
}

/** Retry budget for idempotent GETs; chat completions are never retried here. */
const GET_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 700;

/**
 * Read-only requests get a small retry budget.  The HowToCook site sits behind
 * a CDN that occasionally drops a connection or answers 429; a transient blip
 * must not turn into an error screen during a demo.  POSTs (model calls) keep a
 * single attempt because the model layer already retries malformed answers.
 */
async function request<T>(
  url: string,
  options: FetchOptions,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const attempts = (options.method ?? "GET") === "GET" ? GET_ATTEMPTS : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await requestOnce(url, options, consume);
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      const status = error instanceof HttpError ? error.status : 0;
      console.log(`KITCHEN_HELPER_HTTP_RETRY ${JSON.stringify({ url, attempt, status })}`);
      await delay(RETRY_BASE_DELAY_MS * attempt);
    }
  }
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  return request(url, options, (response) => response.text());
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return request(url, options, async (response) => (await response.json()) as T);
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: FetchOptions = {},
): Promise<T> {
  return request(
    url,
    {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
    },
    async (response) => (await response.json()) as T,
  );
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Strip tags and collapse whitespace; good enough for LLM input and fallback text. */
export function htmlToPlainText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|main)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
