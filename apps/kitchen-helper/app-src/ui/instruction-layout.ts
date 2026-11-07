/**
 * Deterministic text fitting for the fixed-size 640×480 HUD.
 *
 * FusionUI does not expose text metrics on the public API, so this module
 * estimates glyph widths and line breaks itself. It then emits explicit line
 * breaks ("\n") instead of leaving wrapping to the backend: the native wrapper
 * can split a Latin token such as "100g" in the middle of a line, and with a
 * mixture of CJK and Latin text its result is not predictable enough for a
 * fixed layout.
 *
 * A text block is either shown at a readable size in one go, or split into a
 * small number of pages that each fit the same box. The cooking screen maps the
 * existing up/down pager onto those pages.
 */

/** Full-width glyphs: CJK ideographs, kana, Hangul, full-width forms and CJK punctuation. */
function isWideGlyph(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

/** Approximate rendered width of one code point at the given font size. */
export function glyphWidth(codePoint: number, size: number): number {
  if (codePoint === 0x20 || codePoint === 0x09) return size * 0.3;
  if (isWideGlyph(codePoint)) return size;
  if (
    (codePoint >= 0x21 && codePoint <= 0x2f) ||
    (codePoint >= 0x3a && codePoint <= 0x40) ||
    (codePoint >= 0x5b && codePoint <= 0x60) ||
    (codePoint >= 0x7b && codePoint <= 0x7e)
  ) {
    return size * 0.4;
  }
  return size * 0.58;
}

/**
 * Rendered line advance for a `ui/widgets.ts` text style.
 *
 * The simulator's font backend advances by roughly 1.45× the font size plus the
 * explicit line space (measured from rendered frames: 38 px text advances 63 px
 * with an 8 px line space), so the estimate must include both.
 */
export function lineHeightFor(size: number): number {
  return Math.round(size * 1.45) + Math.max(2, Math.round(size * 0.22));
}

interface Token {
  readonly text: string;
  /** True when a line may end after this token. */
  readonly breakAfter: boolean;
  readonly width: number;
}

const WORD_CHAR = /[A-Za-z0-9_@#$%&*+=/\\<>~^.-]/;
const CLAUSE_END = /[，。；：、！？,;:!?]/;

/** Split a paragraph into breakable tokens: Latin words, CJK glyphs, spaces and punctuation. */
function tokenize(text: string, size: number): Token[] {
  const tokens: Token[] = [];
  const chars = Array.from(text);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] as string;
    const codePoint = char.codePointAt(0) ?? 0;
    if (char === " ") {
      tokens.push({ text: char, breakAfter: true, width: glyphWidth(codePoint, size) });
      continue;
    }
    if (WORD_CHAR.test(char)) {
      let word = char;
      while (index + 1 < chars.length && WORD_CHAR.test(chars[index + 1] as string)) {
        index += 1;
        word += chars[index] as string;
      }
      let width = 0;
      for (const part of word) width += glyphWidth(part.codePointAt(0) ?? 0, size);
      tokens.push({ text: word, breakAfter: false, width });
      continue;
    }
    tokens.push({
      text: char,
      breakAfter: isWideGlyph(codePoint) || CLAUSE_END.test(char),
      width: glyphWidth(codePoint, size),
    });
  }
  return tokens;
}

/** Hard-split one over-wide token across lines, appending completed lines. */
function splitToken(token: Token, size: number, width: number, lines: string[]): Token[] {
  const parts: Token[] = [];
  let current = "";
  let currentWidth = 0;
  for (const char of token.text) {
    const advance = glyphWidth(char.codePointAt(0) ?? 0, size);
    if (currentWidth > 0 && currentWidth + advance > width) {
      parts.push({ text: current, breakAfter: true, width: currentWidth });
      lines.push(current);
      current = char;
      currentWidth = advance;
    } else {
      current += char;
      currentWidth += advance;
    }
  }
  if (current) parts.push({ text: current, breakAfter: true, width: currentWidth });
  return parts;
}

/**
 * Break the text into display lines that fit `width`, keeping Latin words and
 * numbers intact and preferring breaks at CJK punctuation / spaces.
 */
export function lineLimitFor(size: number, width: number): number {
  // A little safety margin: a Latin glyph estimate can be a couple of pixels
  // short, and if the backend then wraps the line again the box overflows.
  return Math.max(size * 2, width - Math.max(4, Math.round(size * 0.2)));
}

/** Append "…" without pushing the line over the wrap limit (which would re-wrap it). */
function withEllipsis(line: string, size: number, width: number): string {
  const limit = lineLimitFor(size, width);
  const ellipsisWidth = glyphWidth(0x2026, size);
  let chars = Array.from(line.replace(/[，、；,\s]+$/u, ""));
  const widthOf = (text: string): number => {
    let total = 0;
    for (const char of text) total += glyphWidth(char.codePointAt(0) ?? 0, size);
    return total;
  };
  while (chars.length > 0 && widthOf(chars.join("")) + ellipsisWidth > limit) {
    chars = chars.slice(0, -1);
  }
  return `${chars.join("")}…`;
}

export function wrapLines(text: string, size: number, width: number): string[] {
  const limit = lineLimitFor(size, width);
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim().length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    let lineWidth = 0;
    const flush = (): void => {
      lines.push(line.replace(/\s+$/u, ""));
      line = "";
      lineWidth = 0;
    };
    for (const token of tokenize(paragraph.trim(), size)) {
      if (token.text === " " && line.length === 0) continue;
      if (token.width > limit) {
        if (line.length > 0) flush();
        const parts = splitToken(token, size, limit, lines);
        for (const part of parts) {
          if (lineWidth > 0 && lineWidth + part.width > limit) flush();
          line += part.text;
          lineWidth += part.width;
        }
        continue;
      }
      if (lineWidth > 0 && lineWidth + token.width > limit) flush();
      if (token.text === " " && line.length === 0) continue;
      line += token.text;
      lineWidth += token.width;
    }
    if (line.length > 0) flush();
  }
  return fixLineStartPunctuation(lines);
}

/** Punctuation that must not start a display line. */
const LINE_START_FORBIDDEN = /^[，。；：、！？,;:!?）】」』》〉…—]/u;

/**
 * Pull the previous line's last character down when a line would otherwise
 * start with closing punctuation (basic CJK line-breaking rule).
 */
function fixLineStartPunctuation(input: string[]): string[] {
  const lines = input.slice();
  for (let index = 1; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    if (!LINE_START_FORBIDDEN.test(current)) continue;
    const previous = lines[index - 1] ?? "";
    if (previous.length <= 1) continue;
    const chars = Array.from(previous);
    const moved = chars.pop() as string;
    lines[index - 1] = chars.join("");
    lines[index] = `${moved}${current}`;
  }
  return lines.length > 0 ? lines : [""];
}

/** Number of display lines the text needs at the given size and width. */
export function countWrappedLines(text: string, size: number, width: number): number {
  return wrapLines(text, size, width).length;
}

export interface FitBlockOptions {
  readonly width: number;
  readonly height: number;
  /** Candidate sizes from largest to smallest. */
  readonly sizes: readonly number[];
}

export interface FittedBlock {
  readonly size: number;
  readonly text: string;
  readonly truncated: boolean;
}

/** Fit a single text block into the box, shrinking and finally truncating it. */
export function fitTextBlock(text: string, options: FitBlockOptions): FittedBlock {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { size: options.sizes[0] ?? 16, text: "", truncated: false };
  }
  for (const size of options.sizes) {
    const lines = wrapLines(trimmed, size, options.width);
    if (lines.length * lineHeightFor(size) <= options.height) {
      return { size, text: lines.join("\n"), truncated: false };
    }
  }
  const size = options.sizes[options.sizes.length - 1] ?? 16;
  const maxLines = Math.max(1, Math.floor(options.height / lineHeightFor(size)));
  const lines = wrapLines(trimmed, size, options.width);
  if (lines.length <= maxLines) {
    return { size, text: lines.join("\n"), truncated: false };
  }
  const kept = lines.slice(0, maxLines);
  kept[kept.length - 1] = withEllipsis(kept[kept.length - 1] ?? "", size, options.width);
  return { size, text: kept.join("\n"), truncated: true };
}

export interface InstructionLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly sizes?: readonly number[];
  /** Maximum number of pages; the pager only has three positions. */
  readonly maxPages?: number;
}

export interface InstructionLayout {
  readonly size: number;
  readonly pages: readonly string[];
  readonly truncated: boolean;
}

const DEFAULT_INSTRUCTION_SIZES = [38, 34, 30, 27, 24, 22] as const;
/** Below this size a single page is harder to read than a two-page spread. */
const MIN_READABLE_SINGLE_PAGE = 27;

function paginate(
  text: string,
  size: number,
  options: InstructionLayoutOptions,
): { pages: string[]; truncated: boolean } {
  const lines = wrapLines(text, size, options.width);
  const maxLines = Math.max(1, Math.floor(options.height / lineHeightFor(size)));
  const maxPages = Math.max(1, options.maxPages ?? 3);
  const capacity = maxLines * maxPages;
  const truncated = lines.length > capacity;
  const kept = truncated ? lines.slice(0, capacity) : lines;
  if (truncated && kept.length > 0) {
    kept[kept.length - 1] = withEllipsis(kept[kept.length - 1] ?? "", size, options.width);
  }
  const pages: string[] = [];
  for (let index = 0; index < kept.length; index += maxLines) {
    pages.push(kept.slice(index, index + maxLines).join("\n"));
  }
  return { pages, truncated };
}

/**
 * Lay out a cooking instruction: one page at the largest readable size when it
 * fits, otherwise several pages at the largest size the pager can hold.
 */
export function layoutInstruction(
  text: string,
  options: InstructionLayoutOptions,
): InstructionLayout {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { size: options.sizes?.[0] ?? 38, pages: [""], truncated: false };
  }
  const sizes = options.sizes ?? DEFAULT_INSTRUCTION_SIZES;
  const readableSingle = sizes.find(
    (size) =>
      size >= MIN_READABLE_SINGLE_PAGE &&
      wrapLines(trimmed, size, options.width).length * lineHeightFor(size) <= options.height,
  );
  if (readableSingle !== undefined) {
    return {
      size: readableSingle,
      pages: [wrapLines(trimmed, readableSingle, options.width).join("\n")],
      truncated: false,
    };
  }
  // No readable single page: take the largest font the pager can hold.
  for (const size of sizes) {
    const result = paginate(trimmed, size, options);
    if (result.pages.length <= (options.maxPages ?? 3)) {
      return { size, pages: result.pages, truncated: result.truncated };
    }
  }
  const fallbackSize = sizes[sizes.length - 1] ?? 22;
  const fallback = paginate(trimmed, fallbackSize, options);
  return { size: fallbackSize, pages: fallback.pages, truncated: fallback.truncated };
}
