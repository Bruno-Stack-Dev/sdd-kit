// Utilitários compartilhados pelos testes (zero-dep).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SDD_CLI = join(KIT_ROOT, 'scripts', 'sdd.mjs');
export const SDD_LINT = join(KIT_ROOT, 'scripts', 'sdd-lint.mjs');

/** Cria um diretório temporário com os arquivos dados ({ 'a/b.md': 'conteúdo' }). */
export function tempProject(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-test-'));
  for (const [rel, content] of Object.entries(files)) writeFile(dir, rel, content);
  return dir;
}

export function writeFile(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}

export function readFile(root, rel) {
  return readFileSync(join(root, rel), 'utf8');
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/** Roda um script Node com cwd dado. Devolve { status, stdout, stderr }. */
export function runNode(script, args = [], { cwd, input, env } = {}) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

export function runLint(cwd) {
  const r = runNode(SDD_LINT, [], { cwd });
  return { ...r, out: r.stdout + r.stderr };
}

export function runSdd(args, opts = {}) {
  const r = runNode(SDD_CLI, args, opts);
  return { ...r, out: r.stdout + r.stderr };
}

/** Frontmatter mínimo de spec válido, sobrescrevível. */
export function specDoc(fields = {}, body = '') {
  const fm = {
    'spec-id': 'SPEC-2026-100',
    titulo: 'Spec de teste',
    status: 'rascunho',
    cas: '1',
    'depende-de': '[]',
    ...fields,
  };
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n# Spec\n\n${body || '- **CA-01**: algo verificável'}\n`;
}
