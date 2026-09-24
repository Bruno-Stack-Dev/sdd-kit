// Dependências declaradas nos manifestos do projeto (package.json, pyproject, requirements, Pipfile,
// go.mod, Cargo.toml). Leitura por formato, sem dependência: um leitor de TOML mínimo, por seção,
// que só enxerga o que é dependência (nome do projeto, versão e licença ficam de fora).
import { readFileSync } from 'node:fs';
import { walkFiles, relPosix } from './files.mjs';

const MANIFEST_RE = /(^|[\\/])(package\.json|pyproject\.toml|requirements[^\\/]*\.txt|Pipfile|go\.mod|Cargo\.toml)$/;
const MAX_MANIFESTS = 50;
// Nome de distribuição no início de um requisito PEP 508 (`pkg[extra]>=1 ; marker`).
const PEP508_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;

/** Corta o comentário `#` que está fora de string. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

/** Saldo de colchetes e chaves fora de string — >0 enquanto um valor multilinha não fechou. */
function openBrackets(text) {
  let depth = 0;
  let quote = null;
  for (const ch of text) {
    if (quote) { if (ch === quote) quote = null; } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
  }
  return depth;
}

/** Entradas `chave = valor` de um TOML, com a seção em que estão (arrays multilinha juntados). */
export function tomlEntries(text) {
  const out = [];
  let section = '';
  let pending = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (pending) {
      pending.value += `\n${line}`;
      if (openBrackets(pending.value) <= 0) { out.push(pending); pending = null; }
      continue;
    }
    const header = line.match(/^\s*\[\[?([^[\]]+)\]\]?\s*$/);
    if (header) {
      section = header[1].split('.').map((s) => s.trim().replace(/^["']|["']$/g, '')).join('.');
      continue;
    }
    const kv = line.match(/^\s*(["']?)([^"'=\s]+)\1\s*=\s*(.*)$/);
    if (!kv) continue;
    const entry = { section, key: kv[2], value: kv[3] };
    if (openBrackets(entry.value) > 0) pending = entry;
    else out.push(entry);
  }
  if (pending) out.push(pending);
  return out;
}

const quoted = (value) => [...value.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
const pep508 = (req) => req.match(PEP508_NAME)?.[1] ?? null;

function pyprojectDeps(text) {
  const deps = [];
  for (const { section, key, value } of tomlEntries(text)) {
    if ((section === 'project' && key === 'dependencies')
      || section === 'project.optional-dependencies'
      || section === 'dependency-groups') {
      deps.push(...quoted(value).map(pep508));
    } else if (/^tool\.poetry\.(dev-)?dependencies$|^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section)) {
      if (key !== 'python') deps.push(key.split('.')[0]);
    }
  }
  return deps;
}

function pipfileDeps(text) {
  return tomlEntries(text).filter((e) => e.section === 'packages' || e.section === 'dev-packages').map((e) => e.key);
}

function cargoDeps(text) {
  const deps = [];
  const tables = new Set();
  for (const { section, key } of tomlEntries(text)) {
    if (/(^|\.)(dev-|build-)?dependencies$/.test(section)) deps.push(key.split('.')[0]);
    const table = section.match(/(?:^|\.)(?:dev-|build-)?dependencies\.([^.]+)$/);
    if (table) tables.add(table[1]);
  }
  return [...deps, ...tables];
}

function requirementsDeps(text) {
  const deps = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line || line.startsWith('-')) continue;
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=~!;@,]|$)/);
    if (m) deps.push(m[1]);
  }
  return deps;
}

function goModDeps(text) {
  const deps = [];
  let block = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (block) {
      if (line === ')') { block = false; continue; }
      const m = line.match(/^(\S+)\s+v\S+$/);
      if (m) deps.push(m[1]);
      continue;
    }
    if (/^require\s*\($/.test(line)) { block = true; continue; }
    const single = line.match(/^require\s+(\S+)\s+v\S+$/);
    if (single) deps.push(single[1]);
  }
  return deps;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function depsOf(file) {
  if (file.endsWith('package.json')) {
    const pkg = readJson(file);
    return Object.keys({ ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) });
  }
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('pyproject.toml')) return pyprojectDeps(text);
  if (file.endsWith('Pipfile')) return pipfileDeps(text);
  if (file.endsWith('Cargo.toml')) return cargoDeps(text);
  if (file.endsWith('go.mod')) return goModDeps(text);
  return requirementsDeps(text);
}

/**
 * Dependências declaradas, por manifesto. `.claude/` fica de fora: os scripts das skills do kit
 * não são dependências do produto.
 */
export function manifestDependencies(root) {
  const manifests = walkFiles(root)
    .filter((p) => MANIFEST_RE.test(p))
    .filter((p) => !relPosix(root, p).startsWith('.claude/'))
    .slice(0, MAX_MANIFESTS);
  return manifests.map((f) => {
    const deps = new Set(depsOf(f).filter(Boolean).map((n) => String(n).toLowerCase().trim()));
    return { file: relPosix(root, f), deps: [...deps].sort() };
  });
}
