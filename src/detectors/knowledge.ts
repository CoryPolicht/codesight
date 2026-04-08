/**
 * Knowledge detector: scans .md files and extracts structured AI context.
 *
 * Handles:
 * - Obsidian vaults (frontmatter, [[backlinks]], #tags)
 * - ADRs / decision records
 * - Meeting notes, retrospectives, session logs
 * - Project specs / PRDs / backlogs
 * - Any markdown-based knowledge base
 *
 * Outputs a compact KnowledgeMap usable as AI context primer.
 */

import { readFileSafe } from "../scanner.js";
import { relative } from "node:path";
import type { KnowledgeMap, KnowledgeNote, KnowledgeNoteType } from "../types.js";

// Files that should never be classified as decision/meeting/etc — always general
const GENERIC_FILENAMES = new Set([
  "readme.md", "changelog.md", "contributing.md", "license.md",
  "code_of_conduct.md", "security.md", "authors.md", "contributors.md",
  "todo.md",
  // Note: index.md intentionally excluded — ADR tools like adr-tools use */index.md as the ADR file
]);

// ─── Note Type Detection ─────────────────────────────────────────────────────

function detectNoteType(filename: string, content: string): KnowledgeNoteType {
  const base = filename.toLowerCase().split("/").pop() || "";

  // Never mis-classify standard project files
  if (GENERIC_FILENAMES.has(base)) return "general";

  const lower = filename.toLowerCase();

  // Filename-first signals
  if (/\b(adr[-_]?\d*|decision|decide|decided)\b/.test(lower)) return "decision";
  if (/\b(meeting|standup|stand-up|sync|1on1|one-on-one|call|interview)\b/.test(lower)) return "meeting";
  if (/\b(retro|retrospective|post-mortem|postmortem)\b/.test(lower)) return "retro";
  if (/\b(prd|spec|requirement|roadmap|brief|proposal)\b/.test(lower)) return "spec";
  if (/\b(backlog|todo|tasks|issues|tickets)\b/.test(lower)) return "backlog";
  if (/\b(research|analysis|study|investigation|benchmark|comparison)\b/.test(lower)) return "research";
  if (/\b(session|log|journal|daily|weekly|standup)\b/.test(lower)) return "session";

  // Content-based fallback — require explicit status field or decision section
  if (/##\s*decision\b/i.test(content) && /##\s*(context|status|consequences)\b/i.test(content)) return "decision";
  if (/^status:\s*(decided|accepted|rejected|proposed)/im.test(content)) return "decision";
  if (/attendees:|action items:|participants:/i.test(content)) return "meeting";
  if (/what went well|what could be better|stop doing|start doing|keep doing/i.test(content)) return "retro";
  if (/##\s*(overview|goals?|requirements?|user stories)/i.test(content)) return "spec";

  return "general";
}

// ─── Frontmatter Parser ───────────────────────────────────────────────────────

function extractFrontmatter(content: string): Record<string, string | string[]> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fm: Record<string, string | string[]> = {};
  const lines = match[1].split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) { i++; continue; }
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();

    // YAML block sequence: key with empty value, followed by "  - item" lines
    if (raw === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s*/, "").trim().replace(/^["']|["']$/g, ""));
        i++;
      }
      fm[key] = items;
      continue;
    }

    // Inline list: "[a, b]"
    if (raw.startsWith("[") && raw.endsWith("]")) {
      fm[key] = raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      fm[key] = raw.replace(/^["']|["']$/g, "");
    }
    i++;
  }
  return fm;
}

// ─── Date Extraction ──────────────────────────────────────────────────────────

function extractDate(
  filename: string,
  fm: Record<string, string | string[]>
): string | undefined {
  const fmDate = fm.date || fm.created || fm.createdAt;
  if (fmDate && typeof fmDate === "string") {
    const d = fmDate.match(/\d{4}-\d{2}-\d{2}/);
    if (d) return d[0];
  }
  const fileDate = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (fileDate) return fileDate[1];
  return undefined;
}

// ─── Decision Extraction ──────────────────────────────────────────────────────

function extractDecisions(content: string): string[] {
  const decisions: string[] = [];

  // ADR format: ## Decision section content (first meaningful line)
  const adrSection = content.match(/##\s*Decision\s*\n+([\s\S]*?)(?=\n##|\n---|\n$)/i);
  if (adrSection) {
    const firstLine = adrSection[1].trim().split("\n").find((l) => l.trim().length > 10);
    if (firstLine) return [firstLine.replace(/^[-*>]\s*/, "").trim()];
  }

  // Pattern-based extraction
  // Phrases that look like decisions but are meta-commentary about ADR process, not actual decisions
  const DECISION_NOISE = /^(reject|accept|propose|update|supersede|deprecate)\s+the\s+adr/i;

  const patterns = [
    /(?:we\s+)?decided?\s+to\s+([^.!?\n]{10,150})/gi,
    /going\s+with\s+([^.!?\n]{5,120})/gi,
    /chose?\s+([^.!?\n]{5,80})\s+(?:over|instead\s+of)/gi,
    /(?:^|\n)\s*decision:\s*([^\n]{10,150})/gi,
    /will\s+(?:be\s+)?using?\s+([^.!?\n]{5,80})/gi,
  ];

  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const d = m[1].trim().replace(/[*_`]/g, "");
      if (d.length >= 10 && d.length <= 160 && !DECISION_NOISE.test(d)) decisions.push(d);
    }
  }

  return [...new Set(decisions)].slice(0, 3);
}

// ─── Open Question Extraction ─────────────────────────────────────────────────

function extractOpenQuestions(content: string): string[] {
  const questions: string[] = [];

  for (const line of content.split("\n")) {
    let t = line.trim();
    if (
      t.endsWith("?") &&
      !t.startsWith("#") &&
      !t.startsWith(">") &&
      t.length >= 15 &&
      t.length <= 200 &&
      !/[^\x00-\x7F]/.test(t) // skip non-ASCII (non-English questions)
    ) {
      t = cleanWikilinks(t.replace(/^[-*]\s*/, ""));
      if (t.length >= 15 && t.length <= 160) questions.push(t);
    }
  }

  // TODO / QUESTION markers
  const todoRe = /(?:TODO|QUESTION|OPEN|FIXME):\s*([^\n]{10,120})/gi;
  let m: RegExpExecArray | null;
  while ((m = todoRe.exec(content)) !== null) questions.push(cleanWikilinks(m[1].trim()));

  return [...new Set(questions)].slice(0, 5);
}

// ─── People Extraction ────────────────────────────────────────────────────────

// Common section/field labels that look like people names but aren't
const PEOPLE_BLACKLIST = new Set([
  "Decision Maker", "Decision Maker Name", "Decision Date", "Decision Title",
  "Decision Number", "Decision Reach", "Technical Story", "Team Members",
  "Team Members Present", "Key Points", "Action Items", "Next Steps",
  "Open Issues", "Related Decisions", "Related Work", "Follow Up",
  "Meeting Notes", "Meeting Date", "Meeting Time", "Attendees List",
  "Status Update", "Risk Assessment", "Success Metrics", "User Story",
  "Acceptance Criteria", "Definition Of", "Pull Request", "Issue Link",
  "Evaluate Charts", "Participants List", "Stakeholders Involved",
]);

function extractPeople(content: string): string[] {
  const people = new Set<string>();

  // Common placeholder handles to skip
  const HANDLE_BLACKLIST = new Set(["example", "username", "yourname", "user", "name", "email"]);

  // @mentions — ASCII only, no hyphens (npm packages), no template placeholders
  for (const m of content.matchAll(/@([a-zA-Z][a-zA-Z0-9_]{2,})/g)) {
    const handle = m[1];
    if (HANDLE_BLACKLIST.has(handle.toLowerCase())) continue;
    if (handle.includes("-")) continue; // npm scoped packages
    people.add(handle);
  }

  // [[First Last]] Obsidian wikilinks — two-word proper nouns only
  for (const m of content.matchAll(/\[\[([A-Z][a-z]+ [A-Z][a-z]+)(?:\|[^\]]+)?\]\]/g)) {
    const name = m[1];
    if (!PEOPLE_BLACKLIST.has(name)) people.add(name);
  }

  // "First Last:" at start of line — only scan meeting-like content to avoid ADR field labels
  const isMeetingLike = /attendees:|participants:|meeting\b|standup|1on1/i.test(content);
  if (isMeetingLike) {
    for (const m of content.matchAll(/^([A-Za-z][a-z]+ [A-Z][a-z]+):/gm)) {
      const name = m[1];
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      if (days.includes(name)) continue;
      if (PEOPLE_BLACKLIST.has(name)) continue;
      people.add(name);
    }
  }

  return [...people].slice(0, 10);
}

// ─── Tag Extraction ───────────────────────────────────────────────────────────

function extractTags(fm: Record<string, string | string[]>, content: string): string[] {
  const tags = new Set<string>();

  const fmTags = fm.tags;
  if (fmTags) {
    const list = Array.isArray(fmTags) ? fmTags : String(fmTags).split(/[,\s]+/);
    for (const t of list) {
      const clean = t.trim().replace(/^#/, "");
      if (clean) tags.add(clean);
    }
  }

  for (const m of content.matchAll(/(?:^|\s)#([a-zA-Z][\w-]{1,30})\b/g)) {
    tags.add(m[1]);
  }

  return [...tags].slice(0, 12);
}

// ─── Wikilink Cleanup ─────────────────────────────────────────────────────────

// Strip [[link|alias]] → alias, [[link]] → link, leaving plain text
function cleanWikilinks(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[link|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, "$1");            // [[link]] → link
}

// ─── Summary Extraction ───────────────────────────────────────────────────────

function extractSummary(content: string, maxLen = 160): string {
  const withoutFm = content.replace(/^---[\s\S]*?---\r?\n/, "");
  for (const line of withoutFm.split("\n")) {
    let t = line.trim();
    if (!t || t.length <= 20) continue;
    // Skip structural/non-prose lines
    if (t.startsWith("#")) continue;
    if (t.startsWith("---") || t.startsWith("===")) continue;
    if (t.startsWith("!")) continue;       // images
    if (t.startsWith("<")) continue;       // HTML tags
    if (t.startsWith("http")) continue;    // bare URLs
    if (t.startsWith("[!")) continue;      // callout blocks
    if (/^\[.*\]\(.*\)$/.test(t)) continue; // bare markdown links
    if (/^```/.test(t)) continue;          // code fences
    if (/^\|/.test(t)) continue;           // tables
    if (/^<!--/.test(t)) continue;         // HTML comments
    // Strip leading list/blockquote markers and clean wikilinks
    t = t.replace(/^[-*>]\s+/, "").replace(/^\d+\.\s+/, "");
    t = cleanWikilinks(t);
    if (t.length <= 15) continue;
    return t.length > maxLen ? t.slice(0, maxLen) + "…" : t;
  }
  return "";
}

// ─── Main Detector ────────────────────────────────────────────────────────────

// Files to always skip in knowledge mode
const SKIP_PATTERNS = [
  "node_modules", ".codesight", "CHANGELOG", "LICENSE", "CODE_OF_CONDUCT",
  "CONTRIBUTING", "SECURITY", ".github/", "dist/", "build/",
];

export async function detectKnowledge(
  files: string[],
  root: string
): Promise<KnowledgeMap> {
  const mdFiles = files.filter((f) => {
    if (!f.endsWith(".md") && !f.endsWith(".mdx")) return false;
    const rel = relative(root, f).replace(/\\/g, "/");
    return !SKIP_PATTERNS.some((p) => rel.includes(p));
  });

  const notes: KnowledgeNote[] = [];
  const allDecisions: string[] = [];
  const allQuestions: string[] = [];
  const allPeople = new Set<string>();
  const themeMap = new Map<string, number>();
  const projectSet = new Set<string>();

  for (const file of mdFiles) {
    const content = await readFileSafe(file);
    if (!content || content.trim().length < 30) continue;

    const rel = relative(root, file).replace(/\\/g, "/");
    const filename = rel.split("/").pop() || rel;
    const fm = extractFrontmatter(content);

    // Title: frontmatter > first H1 > filename
    const h1 = content.match(/^#\s+(.+)/m)?.[1]?.trim();
    const fmTitle = typeof fm.title === "string" ? fm.title : undefined;
    const title = fmTitle || h1 || filename.replace(/\.md$/, "").replace(/[-_]/g, " ");

    const type = detectNoteType(filename, content);
    const date = extractDate(filename, fm);
    const tags = extractTags(fm, content);
    const decisions = extractDecisions(content);
    const openQuestions = extractOpenQuestions(content);
    const people = extractPeople(content);
    const summary = extractSummary(content);

    // Collect H2 themes across notes — ASCII only to avoid non-English headers
    for (const m of content.matchAll(/^##\s+(.+)/gm)) {
      const raw = m[1].trim();
      if (/[^\x00-\x7F]/.test(raw)) continue; // skip non-ASCII (other languages)
      const theme = raw.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
      if (theme.length >= 3 && theme.length <= 40) {
        themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
      }
    }

    // Project detection from frontmatter or "Project: X" pattern
    const fmProject = fm.project;
    if (fmProject && typeof fmProject === "string") projectSet.add(fmProject);
    const projMatch = content.match(/^project:\s*([^\n]{2,40})/im);
    if (projMatch) projectSet.add(projMatch[1].trim());

    for (const d of decisions) {
      allDecisions.push(date ? `[${date}] ${d}` : d);
    }
    allQuestions.push(...openQuestions);
    for (const p of people) allPeople.add(p);

    notes.push({ file: rel, title, type, date, tags, summary, decisions, openQuestions, people });
  }

  // Sort by date descending (undated go last)
  notes.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const recurringThemes = [...themeMap.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);

  const datedNotes = notes.filter((n) => n.date);
  const dateRange =
    datedNotes.length >= 2
      ? { from: datedNotes[datedNotes.length - 1].date!, to: datedNotes[0].date! }
      : undefined;

  return {
    notes,
    totalNotes: notes.length,
    decisions: [...new Set(allDecisions)].slice(0, 20),
    openQuestions: [...new Set(allQuestions)].slice(0, 10),
    recurringThemes,
    people: [...allPeople].slice(0, 20),
    projects: [...projectSet].slice(0, 10),
    dateRange,
  };
}
