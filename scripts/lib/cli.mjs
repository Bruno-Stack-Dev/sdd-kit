// Utilitários de linha de comando compartilhados pelos subcomandos do `sdd`.
import { resolve } from 'node:path';

export class UsageError extends Error {}

/** --flag, --flag=valor, --flag valor (quando o próximo não começa com --). */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { flags[camel(a.slice(2, eq))] = a.slice(eq + 1); continue; }
      const name = camel(a.slice(2));
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && VALUE_FLAGS.has(name)) { flags[name] = next; i++; }
      else flags[name] = true;
      continue;
    }
    positional.push(a);
  }
  return { positional, flags, root: resolve(flags.root ?? process.cwd()) };
}

// Flags que recebem valor como argumento separado.
const VALUE_FLAGS = new Set([
  'root', 'from', 'to', 'spec', 'task', 'plan', 'agent', 'gate', 'result', 'reason', 'slug', 'title',
  'pipeline', 'session', 'evidence', 'profile', 'target', 'out', 'key', 'trace', 'otlp', 'source',
  'license', 'trust', 'pack', 'include', 'exclude', 'format', 'since', 'id', 'kind', 'command',
  'meta', 'mode', 'tool', 'file', 'depends', 'ref', 'fromFile', 'suite', 'filter', 'packs', 'maxKb',
]);

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function fail(e) {
  if (e instanceof UsageError) {
    console.error(`sdd: ${e.message}`);
    process.exit(2);
  }
  console.error(`sdd: erro inesperado: ${e?.stack ?? e}`);
  process.exit(1);
}

export const ICON = { error: '✖', warn: '⚠', ok: '✓', info: '·', notRun: '○' };

/** Imprime itens { path, message } com um ícone. */
export function printIssues(items, icon, prefix = '') {
  for (const it of items) console.log(`${icon} ${prefix}${it.path ? `${it.path}: ` : ''}${it.message}`);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
