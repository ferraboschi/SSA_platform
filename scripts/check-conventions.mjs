#!/usr/bin/env node
// Project convention checker — no external deps.
//
// Enforces a handful of hard invariants across src/. Exits 1 (with file:line
// violations) if any is broken, else prints an OK line and exits 0.
//
// Rules:
//   1. No committed *.bak / *.old file under src/.
//   2. No `: any` type annotation or ` as any` cast (codebase is at ZERO).
//   3. Every `unstable_cache(` call site must carry a `tags:` option.
//   4. No `console.*` log that interpolates an env var matching /_TOKEN|_KEY|_SECRET/.
//   5. No Italian month-name array/map literal defined outside the single source
//      of truth (src/lib/dates/italian-months.ts) or seed/test files.
//
// Usage: node scripts/check-conventions.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const MONTHS_SRC = path.join("src", "lib", "dates", "italian-months.ts");

/** @type {{file:string, line:number, msg:string}[]} */
const violations = [];
const add = (file, line, msg) =>
  violations.push({ file: path.relative(ROOT, file), line, msg });

/** All tracked + untracked (non-ignored) files under src/, POSIX-relative to ROOT. */
function listSrcFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src"],
    { cwd: ROOT, encoding: "utf8" }
  );
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

const isTest = (rel) => /\.test\.[cm]?[jt]sx?$/.test(rel);
const isSeed = (rel) => /(^|\/)seed(s)?(\.|\/|-)/.test(rel) || /\/seed\.[cm]?[jt]sx?$/.test(rel);
const isCode = (rel) => /\.[cm]?[jt]sx?$/.test(rel);

const files = listSrcFiles();

// ---------------------------------------------------------------------------
// Rule 1: no committed *.bak / *.old under src/
// ---------------------------------------------------------------------------
for (const rel of files) {
  if (/\.(bak|old)$/i.test(rel)) {
    add(path.join(ROOT, rel), 1, `stale backup file committed under src/ (${rel})`);
  }
}

// ---------------------------------------------------------------------------
// Line-oriented rules over source files.
// ---------------------------------------------------------------------------
// Match a real `: any` annotation or ` as any` cast — not the word "any" in prose.
//   : any   ->  colon, optional ws, `any`, then a non-identifier boundary
//   as any  ->  `as` keyword, ws, `any`, boundary
const ANY_RE = /(:\s*any(?![\w$])|(?<![\w$])as\s+any(?![\w$]))/;
const SECRET_ENV_RE = /_TOKEN|_KEY|_SECRET/;
const MONTH_WORDS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];
// A redefinition of the calendar month map/array is what the convention bans
// ("Do not redefine month maps/arrays locally"). Its signature is a *quoted*
// calendar sequence that STARTS at Gennaio — i.e. `["Gennaio","Febbraio",…]`
// (the task's own example) — as opposed to a cherry-picked business window such
// as a May→Oct pipeline slice, which is legitimate domain data, not a re-impl
// of MONTH_NAMES_IT. So: require the run to begin at Gennaio, immediately
// followed by ≥1 more consecutive month name. Comments are stripped first, so
// prose can't trip it.
// `"Gennaio"` then, within a short span (allowing an intervening value like
// `: 0,` in a Record map), another month name. Covers both array literals
// `["Gennaio","Febbraio",…]` and object maps `{"Gennaio":0,"Febbraio":1,…}`.
const [JAN, ...REST] = MONTH_WORDS;
const MONTH_LITERAL_RE = new RegExp(
  `["']${JAN}["']\\s*[,:][^"'\\n]{0,8}["'](?:${REST.join("|")})["']`
);

// Remove `//` line comments and `/* ... */` block-comment bodies so prose inside
// comments (e.g. "URL: any /corsi/…") can't match the code regexes below. Not a
// full JS tokenizer — good enough for line-level linting and never matches code.
let inBlockComment = false;
function stripComments(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (inBlockComment) {
      const close = line.indexOf("*/", i);
      if (close === -1) return out; // rest of line is comment
      inBlockComment = false;
      i = close + 2;
      continue;
    }
    if (line[i] === "/" && line[i + 1] === "/") return out; // line comment
    if (line[i] === "/" && line[i + 1] === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    out += line[i++];
  }
  return out;
}

for (const rel of files) {
  if (!isCode(rel)) continue;
  const abs = path.join(ROOT, rel);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  inBlockComment = false; // reset per file

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComments(raw); // code only — comments removed
    const ln = i + 1;

    // Rule 2: `: any` / ` as any` (skip *.test.*)
    if (!isTest(rel) && ANY_RE.test(line)) {
      add(abs, ln, "`: any` / ` as any` is banned (keep the codebase any-free)");
    }

    // Rule 4: console.* logging a secret-looking env var
    if (
      /\bconsole\.\w+\s*\(/.test(line) &&
      /process\.env\.[A-Z0-9_]*(?:_TOKEN|_KEY|_SECRET)/.test(line) &&
      SECRET_ENV_RE.test(line)
    ) {
      add(abs, ln, "console.* must never log a secret env var (_TOKEN/_KEY/_SECRET)");
    }

    // Rule 5: Italian month array/map literal outside the source of truth
    if (
      rel !== MONTHS_SRC &&
      !isTest(rel) &&
      !isSeed(rel) &&
      MONTH_LITERAL_RE.test(line)
    ) {
      add(
        abs,
        ln,
        `Italian month literal defined outside ${MONTHS_SRC} — use MONTH_NAMES_IT`
      );
    }
  }

  // Rule 3: unstable_cache(...) must include a `tags:` option.
  // The call can span multiple lines; scan each occurrence's balanced arg list.
  let idx = 0;
  while ((idx = text.indexOf("unstable_cache(", idx)) !== -1) {
    const open = idx + "unstable_cache".length;
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const callText = text.slice(open, end + 1);
    if (!/\btags\s*:/.test(callText)) {
      const ln = text.slice(0, idx).split("\n").length;
      add(abs, ln, "unstable_cache(...) is missing a `tags:` option (required for revalidation)");
    }
    idx = end + 1;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (violations.length > 0) {
  console.error(`check-conventions: ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.msg}`);
  }
  console.error("\nFix the above or, if a match is a genuine false positive, tighten the check.");
  process.exit(1);
}

console.log(`check-conventions: OK — scanned ${files.length} file(s) under src/, 0 violations.`);
process.exit(0);
