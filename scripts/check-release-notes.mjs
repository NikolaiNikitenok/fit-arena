// Push deployments must add player-facing notes. Invalid/zero/unavailable before
// SHAs fail closed, including initial branch creation; an explicit workflow_dispatch
// remains available for an initial deployment or rollback without new notes.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE = 'src/updates/changelog.ts';
const LITERAL = String.raw`('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")`;
const translatedString = new RegExp(String.raw`^\s*t\(\s*${LITERAL}\s*\)`);

function textValue(literal) {
  return literal.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, escape) => {
    if (/^[ux][0-9a-fA-F]+$/.test(escape)) return String.fromCodePoint(parseInt(escape.slice(1), 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[escape] ?? escape;
  });
}

function latest(source) {
  const array = /export\s+const\s+CHANGELOG\b[^=]*=\s*\[/.exec(source);
  const entry = array && /^\s*\{\s*n:\s*(\d+)\s*,/.exec(source.slice(array.index + array[0].length));
  if (!entry || !Number.isSafeInteger(Number(entry[1]))) throw new Error('Cannot read latest CHANGELOG entry number.');
  const body = source.slice(array.index + array[0].length + entry[0].length);
  return { n: Number(entry[1]), body: body.split(/^\s*\},/m)[0] };
}

export function validateReleaseNotes(before, current) {
  const base = latest(before);
  const next = latest(current);
  if (before === current || next.n <= base.n) throw new Error('Every production push needs a new CHANGELOG entry with n greater than the previous release.');
  const titleField = /\btitle:\s*/.exec(next.body);
  const title = titleField && translatedString.exec(next.body.slice(titleField.index + titleField[0].length));
  if (!title || !textValue(title[1]).trim()) throw new Error('The new release needs a nonempty translated title.');
  const itemsField = /\bitems:\s*\[/.exec(next.body);
  if (!itemsField) throw new Error('The new release needs nonempty translated items.');
  let rest = next.body.slice(itemsField.index + itemsField[0].length);
  let count = 0;
  while (!/^\s*\]/.test(rest)) {
    const item = translatedString.exec(rest);
    if (!item || !textValue(item[1]).trim()) throw new Error('The new release needs nonempty translated items.');
    count++;
    rest = rest.slice(item[0].length);
    if (/^\s*\]/.test(rest)) break;
    const comma = /^\s*,/.exec(rest);
    if (!comma) throw new Error('Cannot read the new release items.');
    rest = rest.slice(comma[0].length);
  }
  if (!count) throw new Error('The new release needs nonempty translated items.');
  return next.n;
}

export function checkReleaseNotes(baseSha, cwd = process.cwd()) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha ?? '') || /^0+$/.test(baseSha)) {
    throw new Error('RELEASE_BASE_SHA must be a nonzero commit SHA. Initial deployments require explicit workflow_dispatch.');
  }
  let before;
  try {
    before = execFileSync('git', ['show', `${baseSha}:${FILE}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Cannot read base release notes. Fetch the before commit or use explicit workflow_dispatch for an initial deployment/rollback.');
  }
  return validateReleaseNotes(before, readFileSync(resolve(cwd, FILE), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(`Player release notes checked: n=${checkReleaseNotes(process.env.RELEASE_BASE_SHA)}.`);
  } catch (error) {
    // Do not print git diagnostics, environment values, or source contents.
    console.error(`Release notes check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
