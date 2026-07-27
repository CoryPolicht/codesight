// Route tag inference (issue #52).
//
// Two invariants keep tags honest:
//   1. Patterns anchor on word starts — `auth` must not fire inside `author`
//      or `unauthenticated`, `sql` not inside nothing-db words, etc.
//   2. Comments never produce tags: a comment documenting a route as public
//      must not tag it authenticated. Content is comment-stripped before
//      matching.
// Callers should additionally pass the narrowest content they can (handler
// span rather than whole file) via detectTagsScoped/sliceScopes.

const TAG_PATTERNS: [string, RegExp[]][] = [
  [
    "auth",
    [
      /\bauth\b/i,
      /\bauthenticat/i, // authenticate/authentication — not UNauthenticated (no word start)
      /\bauthoriz/i, // authorize/authorization — not author
      /Auth\b/, // requireAuth, withAuth (camelCase; \b-after keeps Author out)
      /Auth[A-Z]/, // AuthGuard, AuthService
      /\bjwt\b/i,
      /\btoken\b/i,
      /Token\b/, // accessToken, refreshToken
      /\bsession/i,
      /\bbearer\b/i,
      /\bpassport\b/i,
      /\bclerk\b/i,
      /betterAuth/,
      /better-auth/i,
    ],
  ],
  [
    "db",
    [
      /\bprisma\b/i,
      /\bdrizzle\b/i,
      /\btypeorm\b/i,
      /\bsequelize\b/i,
      /\bmongoose\b/i,
      /\bknex\b/i,
      /\bsql\b/i,
      /\bpostgres/i,
      /\bmysql\b/i,
      /\bsqlite\b/i,
      /\.query\(/i,
      /\.execute\(/i,
      /\.findMany\(/i,
      /\.findFirst\(/i,
      /\.insert\(/i,
      /\.update\(/i,
      /\.delete\(/i,
    ],
  ],
  ["cache", [/\bredis\b/i, /\bcache/i, /\bmemcache/i, /\.setex\(/i, /\.getex\(/i]],
  ["queue", [/\bbullmq\b/i, /\bbull\b/i, /\.add\(\s*['"`]/i, /\bqueue/i]],
  ["email", [/\bresend\b/i, /\bsendgrid\b/i, /\bnodemailer\b/i, /\.send\(\s*\{[\s\S]*?to:/i]],
  ["payment", [/\bstripe\b/i, /\bpolar\b/i, /\bpaddle\b/i, /\blemon/i, /\bcheckout\b/i]],
  ["webhook", [/\bwebhook/i]],
  ["upload", [/\bmulter\b/i, /\bformidable\b/i, /\bbusboy\b/i, /\bupload/i, /\bmultipart\b/i]],
  [
    "ai",
    [/\bopenai\b/i, /\banthropic\b/i, /\bclaude\b/i, /\.chat\.completions/i, /\.messages\.create/i],
  ],
];

/**
 * Remove comments so documentation never produces tags. Handles JS/TS block
 * and line comments (URL-safe: `https://` survives) and full/inline `#`
 * comments for Python-family files (`#` preceded by start-of-line or
 * whitespace, so string contents like "#fff" or `this.#field` survive).
 */
export function stripCommentsForTags(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/(^|\s)#.*$/gm, "$1");
}

export function detectTags(content: string): string[] {
  const stripped = stripCommentsForTags(content);
  const tags: string[] = [];
  for (const [tag, patterns] of TAG_PATTERNS) {
    if (patterns.some((p) => p.test(stripped))) {
      tags.push(tag);
    }
  }
  return tags;
}

/** Cap on a route's scope when the next route's start is unknown (last route
 * in file): far enough to cover a large handler, small enough not to swallow
 * an entire module. */
const MAX_SCOPE_CHARS = 4000;

/**
 * Per-route tag scoping for regex-based detectors: given the character offsets
 * where each route registration starts, tag each route from its own slice of
 * the file (registration start → next registration start) instead of the whole
 * file. Routes in one file with different policies stop inheriting each
 * other's tags.
 */
export function detectTagsScoped(content: string, starts: number[]): string[][] {
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : Math.min(content.length, start + MAX_SCOPE_CHARS);
    return detectTags(content.slice(start, end));
  });
}

/** Line-based variant for extractors that report line numbers (1-based). */
export function detectTagsForLineSpan(
  lines: string[],
  startLine: number,
  endLine: number
): string[] {
  const from = Math.max(0, startLine - 1);
  const to = Math.min(lines.length, Math.max(from + 1, endLine));
  return detectTags(lines.slice(from, to).join("\n"));
}
