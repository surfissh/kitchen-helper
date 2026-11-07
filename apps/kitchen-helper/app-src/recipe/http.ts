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

async function request(url: string, options: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
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
    return response;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(`request timed out after ${options.timeoutMs ?? 12_000} ms`, url);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new HttpError(`network request failed: ${reason}`, url);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await request(url, options);
  return response.text();
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await request(url, options);
  return (await response.json()) as T;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  options: FetchOptions = {},
): Promise<T> {
  const response = await request(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
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
