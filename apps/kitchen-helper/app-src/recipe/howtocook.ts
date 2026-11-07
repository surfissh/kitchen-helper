/**
 * HowToCook adapter.
 *
 * The public site is the primary source.  A search returns the first recipe
 * match; the detail page exposes an "Edit on GitHub" link that gives us the
 * canonical Markdown path, which we read through the GitHub contents API
 * (base64).  If GitHub is unreachable we fall back to the visible text of the
 * detail page so the LLM still has something useful to structure.
 */

import { Buffer } from "node:buffer";
import {
  HOWTOCOOK_BRANCH,
  HOWTOCOOK_REPO,
  HOWTOCOOK_SITE,
  HOWTOCOOK_TIMEOUT_MS,
} from "../config.ts";
import { RecipePipelineError } from "./errors.ts";
import { decodeHtmlEntities, fetchJson, fetchText, htmlToPlainText, HttpError } from "./http.ts";

const ZH_CULTURE_COOKIE = ".AspNetCore.Culture=c%3Dzh-CN%7Cuic%3Dzh-CN";

export interface RecipeSearchResult {
  readonly id: string;
  readonly titleZh: string;
  readonly pageUrl: string;
  readonly summaryZh: string;
}

export interface RecipeMaterial {
  readonly search: RecipeSearchResult;
  /** Canonical Markdown when GitHub is reachable. */
  readonly markdown: string | null;
  /** Visible detail-page text, used when Markdown is unavailable. */
  readonly pageText: string;
  readonly markdownUrl: string | null;
}

function siteHeaders(): Record<string, string> {
  return {
    Cookie: ZH_CULTURE_COOKIE,
    "Accept-Language": "zh-CN,zh;q=0.9",
    Accept: "text/html,application/xhtml+xml",
  };
}

/** Search the public HowToCook site and return the best match. */
export async function searchHowToCook(query: string): Promise<RecipeSearchResult> {
  const url = `${HOWTOCOOK_SITE}/Dashboard/Index?q=${encodeURIComponent(query)}`;
  let html: string;
  try {
    html = await fetchText(url, { timeoutMs: HOWTOCOOK_TIMEOUT_MS, headers: siteHeaders() });
  } catch (error) {
    throw toPipelineError(error, "network", "HowToCook search failed");
  }
  const match = /href="\/Recipes\/Detail\/(\d+)"/.exec(html);
  if (!match) {
    throw new RecipePipelineError(
      "not-found",
      `no HowToCook recipe matched "${query}"`,
      "search-page: no /Recipes/Detail links",
    );
  }
  const id = match[1] as string;
  const card = html.slice(match.index, match.index + 4_000);
  const titleMatch = /<span class="fs-5 fw-semibold">([\s\S]*?)<\/span>/.exec(card);
  const summaryMatch = /<p class="text-muted[^"]*">([\s\S]*?)<\/p>/.exec(card);
  const titleZh = titleMatch
    ? decodeHtmlEntities(titleMatch[1] as string)
        .replace(/<[^>]+>/g, "")
        .trim()
    : query;
  const summaryZh = summaryMatch
    ? decodeHtmlEntities(summaryMatch[1] as string)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  return {
    id,
    titleZh,
    pageUrl: `${HOWTOCOOK_SITE}/Recipes/Detail/${id}`,
    summaryZh,
  };
}

interface GitHubContentResponse {
  readonly content?: string;
  readonly encoding?: string;
  readonly path?: string;
}

/** Read the canonical Markdown through the GitHub contents API. */
async function fetchGitHubMarkdown(path: string): Promise<string | null> {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `https://api.github.com/repos/${HOWTOCOOK_REPO}/contents/${encoded}?ref=${HOWTOCOOK_BRANCH}`;
  try {
    const payload = await fetchJson<GitHubContentResponse>(url, {
      timeoutMs: HOWTOCOOK_TIMEOUT_MS,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!payload.content || payload.encoding !== "base64") return null;
    return Buffer.from(payload.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Extract the Markdown path from the detail page's GitHub edit link. */
export function extractMarkdownPath(html: string): string | null {
  const match =
    /github\.com\/Anduin2017\/HowToCook\/(?:edit|blob)\/master\/([^"'\s]+)/i.exec(html) ??
    /github\.com\/Anduin2017\/HowToCook\/(?:edit|blob)\/master\/([^"'\s]+)/i.exec(
      decodeHtmlEntities(html),
    );
  if (!match) return null;
  return decodeURIComponent(decodeHtmlEntities(match[1] as string)).replace(/^\/+/, "");
}

export function extractPageTitle(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!title) return "";
  return decodeHtmlEntities(title[1] as string)
    .replace(/\s*\|\s*How To Cook.*$/i, "")
    .replace(/的做法.*$/, "")
    .trim();
}

/** Read the detail page and resolve the richest text available. */
export async function fetchRecipeMaterial(search: RecipeSearchResult): Promise<RecipeMaterial> {
  let html: string;
  try {
    html = await fetchText(search.pageUrl, {
      timeoutMs: HOWTOCOOK_TIMEOUT_MS,
      headers: siteHeaders(),
    });
  } catch (error) {
    throw toPipelineError(error, "network", "HowToCook detail page failed");
  }
  const markdownPath = extractMarkdownPath(html);
  const markdown = markdownPath ? await fetchGitHubMarkdown(markdownPath) : null;
  const pageTitle = extractPageTitle(html);
  const pageText = htmlToPlainText(html);
  return {
    search: {
      ...search,
      titleZh: pageTitle || search.titleZh,
    },
    markdown,
    pageText,
    markdownUrl: markdownPath
      ? `https://github.com/${HOWTOCOOK_REPO}/blob/${HOWTOCOOK_BRANCH}/${markdownPath}`
      : null,
  };
}

function toPipelineError(error: unknown, code: "network", context: string): RecipePipelineError {
  if (error instanceof RecipePipelineError) return error;
  const detail = error instanceof HttpError ? `${error.message}` : String(error);
  return new RecipePipelineError(code, `${context}: ${detail}`, detail);
}

/** Exposed for tests. */
export const searchUrlFor = (query: string): string =>
  `${HOWTOCOOK_SITE}/Dashboard/Index?q=${encodeURIComponent(query)}`;
