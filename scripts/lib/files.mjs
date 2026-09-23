// Utilitários de arquivo sem dependência: varredura com exclusões, arquivos versionados no git,
// localização de executáveis no PATH (sem executá-los).
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative, delimiter, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.sdd', '.venv', 'venv', '__pycache__', '.next', '.nuxt', 'target', 'vendor', '.pytest_cache']);

export function toPosix(p) {
  return p.replace(/\\/g, '/');
}

/** Lista arquivos recursivamente a partir de `start` (arquivo ou diretório), pulando IGNORED_DIRS. */
export function walkFiles(start, { ignore = IGNORED_DIRS } = {}) {
  if (!existsSync(start)) return [];
  const st = statSync(start);
  if (st.isFile()) return [start];
  const out = [];
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out.sort();
}

/** Arquivos versionados (git ls-files). null se não for um repositório git. */
export function gitTrackedFiles(root) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || r.error) return null;
  return r.stdout.split('\0').filter(Boolean);
}

/** Heurística de binário: byte NUL nos primeiros 8 KB. */
export function isBinary(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally { closeSync(fd); }
}

/** Procura um executável no PATH sem executá-lo. */
export function findOnPath(name) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = join(dir, name + (ext && extname(name) ? '' : ext));
      try { if (statSync(p).isFile()) return p; } catch { /* não está aqui */ }
    }
  }
  return null;
}

export function relPosix(root, p) {
  return toPosix(relative(root, p));
}
