// style.css is split across files: style.css itself, then the files in style/.
// index.html links them in name order, and that order is the cascade order, so
// this covers the contract that keeps it true.
//
// - index.html links style.css, then every style/ file once in name order,
//   then menu-bg.css. A part left unlinked, linked twice or linked out of
//   order changes which rule wins.
// - Every file is whole. In one file an unclosed block swallows the next
//   section, where someone sees it; split across files the next file parses
//   cleanly and the break hides.
// - Nothing in style/ resolves a URL against the repo root. A relative url()
//   there points inside style/, and an @import costs the round trip the
//   <link>s avoid.
// - readStyleSource() hands the text checks every stylesheet, in link order.
// Each check is first run against an input it must reject.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { readStyleSource } from './lib/game-source.mjs';

const root = new URL('../', import.meta.url);
const parts = readdirSync(new URL('style/', root), { recursive: true }).filter((f) => f.endsWith('.css')).sort();
const files = ['style.css', ...parts.map((f) => `style/${f}`)];
assert.ok(parts.length, 'style/ holds no stylesheet');

/** The stylesheets an HTML page links, in document order, without query strings. */
const stylesheetHrefs = (html) => [...html.matchAll(/<link\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => /\brel="stylesheet"/.test(tag))
  .map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1].replace(/\?.*$/, ''));

/** Throws unless no comment or string is left open and the braces balance. */
const wholeFile = (text, name) => {
  let depth = 0, comment = false, quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (comment) { if (c === '*' && text[i + 1] === '/') { comment = false; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '/' && text[i + 1] === '*') { comment = true; i++; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}') assert.ok(--depth >= 0, `${name} closes a block it never opened`);
  }
  assert.equal(comment, false, `${name} leaves a comment open`);
  assert.equal(quote, '', `${name} leaves a string open`);
  assert.equal(depth, 0, `${name} leaves ${depth} block(s) open`);
};

/** The url()s in a stylesheet that resolve against its own folder: everything but #fragments and data: URIs. */
const folderRelativeUrls = (text) => [...text
  // A data: URI can hold its own url(), so take those out before reading the rest.
  .replace(/url\(\s*(['"])data:[\s\S]*?\1\s*\)/g, 'url(data:)')
  .matchAll(/\burl\(\s*['"]?([^'")\s]*)/g)]
  .map((match) => match[1])
  .filter((url) => !url.startsWith('#') && !url.startsWith('data:'));

// ---------------------------------------------------------------------------
// Each check rejects what it exists to catch.
// ---------------------------------------------------------------------------
assert.deepEqual(
  stylesheetHrefs('<link href="b.css?v=2" rel="stylesheet"><link rel="preload" href="f.woff2" as="font">\n<link rel="stylesheet" href="a.css" />'),
  ['b.css', 'a.css'],
  'stylesheetHrefs() must keep document order, drop query strings and skip other links',
);
assert.throws(() => wholeFile('a { color: red;', 'probe'), /probe leaves 1 block\(s\) open/);
assert.throws(() => wholeFile('a { color: red; } }', 'probe'), /probe closes a block it never opened/);
assert.throws(() => wholeFile('a { color: red; } /* unfinished', 'probe'), /probe leaves a comment open/);
assert.throws(() => wholeFile("a::after { content: '}; }", 'probe'), /probe leaves a string open/);
assert.doesNotThrow(() => wholeFile(`a::after { content: "}"; } /* { */ b::after { content: '\\'{'; }`, 'probe'),
  'braces inside strings, escaped quotes and comments must not count');
assert.deepEqual(folderRelativeUrls(`a { background: url('assets/x.png'); } b { background: url(../y.png); }`),
  ['assets/x.png', '../y.png']);
assert.deepEqual(folderRelativeUrls(`a { filter: url(#glow); mask: url("data:image/svg+xml,%3Csvg%3E%3Crect filter='url(%23n)'/%3E%3C/svg%3E"); }`),
  [], 'a #fragment, and a url() inside a data: URI, resolve against nothing on disk');

// ---------------------------------------------------------------------------
// index.html links the stylesheets in the order that decides the cascade.
// ---------------------------------------------------------------------------
assert.deepEqual(stylesheetHrefs(readFileSync(new URL('index.html', root), 'utf8')), [...files, 'menu-bg.css'],
  'index.html must link style.css, then every style/ file once in name order, then menu-bg.css');

// ---------------------------------------------------------------------------
// Every file is whole, and nothing in style/ needs the repo root as its base.
// The fonts are why the design system stays in style.css: their src is
// relative to it.
// ---------------------------------------------------------------------------
let lines = 0;
for (const file of files) {
  const text = readFileSync(new URL(file, root), 'utf8');
  lines += text.split('\n').length - 1;
  wholeFile(text, file);
  if (file === 'style.css') continue;
  assert.doesNotMatch(text, /@import\b/, `${file}: @import fetches a round trip late — link it from index.html instead`);
  assert.deepEqual(folderRelativeUrls(text), [],
    `${file}: these url()s resolve against style/, not the page — keep their rules in style.css`);
}

// ---------------------------------------------------------------------------
// readStyleSource() holds every stylesheet, in link order.
// ---------------------------------------------------------------------------
const source = readStyleSource();
let at = -1;
for (const file of files) {
  const found = source.indexOf(readFileSync(new URL(file, root), 'utf8'));
  assert.ok(found > at, `readStyleSource() is missing ${file}, or holds it out of link order`);
  at = found;
}

console.log(`Style parts OK: style.css + ${parts.length} files in style/ (${lines} lines), linked in name order, `
  + 'each whole, no URL relative to style/; readStyleSource() holds them all in that order; every check rejects a bad probe.');
