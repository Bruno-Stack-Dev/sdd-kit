// Exportador de contexto sanitizado: empacota o código do projeto num único arquivo local (Markdown
// ou XML) para revisão ou para colar num modelo — sem segredos, sem arquivos sensíveis, respeitando
// o .gitignore. Nada é enviado a lugar nenhum: o arquivo fica no disco para o usuário revisar.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { ENGINE_VERSION } from './engine.mjs';
import { walkFiles, isBinary, toPosix, relPosix } from './files.mjs';
import { scanText, redact, isSensitivePath } from './secrets.mjs';

export const REPOMIX = 'repomix@1.18.1';
export const DEFAULT_MAX_BYTES = 256 * 1024;

const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json', 'bun.lockb', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum', 'composer.lock', 'Gemfile.lock', 'packages.lock.json']);
// Além de isSensitivePath: arquivos de credencial de ferramentas e estado local do kit/cliente.
const EXTRA_SENSITIVE = [/(^|\/)\.npmrc$/, /(^|\/)\.pypirc$/, /(^|\/)\.git-credentials$/, /(^|\/)\.claude\/settings\.local\.json$/, /(^|\/)\.sdd\//, /(^|\/)\.git\//];
const NOISE = [/\.min\.(js|css)$/, /\.map$/];
// Padrões passados ao Repomix como --ignore (o Secretlint dele continua ligado).
export const REPOMIX_IGNORE = ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/id_rsa*', '**/id_ed25519*', '**/credentials*', '**/secrets/**', '**/.npmrc', '**/.pypirc', '**/.netrc', '.sdd/**', '.claude/settings.local.json'];

const LANG = { '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.ts': 'ts', '.tsx': 'tsx', '.jsx': 'jsx', '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.sh': 'bash', '.ps1': 'powershell', '.sql': 'sql', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.md': 'markdown', '.html': 'html', '.css': 'css', '.vue': 'vue', '.xml': 'xml' };

/** Glob simples → RegExp. `**` cruza diretórios; padrão sem `/` casa com o nome em qualquer nível. */
export function globToRegExp(glob) {
  const g = String(glob).replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(g.includes('/') ? `^${re}$` : `(^|/)${re}$`);
}

/** Candidatos: git (respeita .gitignore, inclui não rastreados não ignorados) ou varredura. */
export function candidateFiles(root) {
  const r = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && !r.error) return { files: [...new Set(r.stdout.split('\0').filter(Boolean))].sort(), source: 'git' };
  return { files: walkFiles(root).map((f) => relPosix(root, f)).sort(), source: 'walk' };
}

/**
 * Seleciona o que entra. Devolve { included: [{path, bytes, text, redactions}], excluded: [{path, reason, detail?}], source }.
 * Segredo detectado → arquivo excluído (ou redigido com `redactSecrets`). Nunca devolve o valor do segredo.
 */
export function selectFiles(root, { include = [], exclude = [], maxBytes = DEFAULT_MAX_BYTES, includeLockfiles = false, redactSecrets = false } = {}) {
  const { files, source } = candidateFiles(root);
  const inc = include.map(globToRegExp);
  const exc = exclude.map(globToRegExp);
  const included = [];
  const excluded = [];
  for (const rel of files) {
    const p = toPosix(rel);
    const abs = join(root, p);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    if (isSensitivePath(p) || EXTRA_SENSITIVE.some((re) => re.test(p))) { excluded.push({ path: p, reason: 'sensível' }); continue; }
    if (inc.length && !inc.some((re) => re.test(p))) continue;
    if (exc.some((re) => re.test(p))) { excluded.push({ path: p, reason: 'exclude' }); continue; }
    const base = p.split('/').pop();
    if (!includeLockfiles && LOCKFILES.has(base)) { excluded.push({ path: p, reason: 'lockfile' }); continue; }
    if (NOISE.some((re) => re.test(p))) { excluded.push({ path: p, reason: 'gerado/minificado' }); continue; }
    const bytes = statSync(abs).size;
    if (bytes > maxBytes) { excluded.push({ path: p, reason: 'tamanho', detail: `${Math.round(bytes / 1024)} KiB` }); continue; }
    if (isBinary(abs)) { excluded.push({ path: p, reason: 'binário' }); continue; }
    let text = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    const hits = scanText(text);
    if (hits.length) {
      const detail = hits.map((h) => `L${h.line} ${h.id}`).join(', ');
      if (!redactSecrets) { excluded.push({ path: p, reason: 'segredo', detail }); continue; }
      text = redact(text);
      included.push({ path: p, bytes, text, redactions: detail });
      continue;
    }
    included.push({ path: p, bytes, text, redactions: null });
  }
  return { included, excluded, source };
}

function tree(paths) {
  const root = {};
  for (const p of paths) {
    let node = root;
    for (const part of p.split('/')) node = node[part] ??= {};
  }
  const lines = [];
  const walk = (node, prefix) => {
    const keys = Object.keys(node).sort((a, b) => (Object.keys(node[b]).length > 0) - (Object.keys(node[a]).length > 0) || a.localeCompare(b));
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${k}${Object.keys(node[k]).length ? '/' : ''}`);
      walk(node[k], prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}

export function summarize(sel) {
  const chars = sel.included.reduce((n, f) => n + f.text.length, 0);
  const byReason = {};
  for (const e of sel.excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  return { files: sel.included.length, bytes: sel.included.reduce((n, f) => n + f.bytes, 0), est_tokens: Math.ceil(chars / 4), excluded: sel.excluded.length, excluded_by_reason: byReason, redacted: sel.included.filter((f) => f.redactions).length, source: sel.source };
}

/** Renderiza o pacote (markdown | xml). */
export function renderContext(sel, { name = 'projeto', format = 'markdown', now = new Date() } = {}) {
  const s = summarize(sel);
  const reasons = Object.entries(s.excluded_by_reason).map(([k, v]) => `${k}: ${v}`).join(', ') || 'nenhum';
  const note = `Gerado por \`sdd export-context\` em ${now.toISOString()} (SDD Kit ${ENGINE_VERSION}). Arquivo local — nada foi enviado. Revise antes de compartilhar.`;
  if (format === 'xml') {
    const esc = (t) => t.replace(/]]>/g, ']]]]><![CDATA[>');
    const out = [`<context project="${name.replace(/"/g, '&quot;')}" generated="${now.toISOString()}" engine="${ENGINE_VERSION}" files="${s.files}" est_tokens="${s.est_tokens}">`, `<note>${note}</note>`, `<excluded>${reasons}</excluded>`, `<tree><![CDATA[\n${tree(sel.included.map((f) => f.path))}\n]]></tree>`];
    for (const f of sel.included) out.push(`<file path="${f.path}"${f.redactions ? ' redacted="true"' : ''}><![CDATA[\n${esc(f.text)}\n]]></file>`);
    out.push('</context>');
    return out.join('\n') + '\n';
  }
  const out = [`# Contexto do projeto — ${name}`, '', `> ${note}`, `> Arquivos: ${s.files} · ~${s.est_tokens} tokens · excluídos: ${s.excluded} (${reasons})${s.redacted ? ` · redigidos: ${s.redacted}` : ''}`, `> Fonte da lista: ${s.source === 'git' ? 'git (respeita .gitignore)' : 'varredura do diretório (sem git: .gitignore não aplicado, só diretórios padrão ignorados)'}`, '', '## Estrutura', '', '```text', tree(sel.included.map((f) => f.path)), '```', '', '## Arquivos', ''];
  for (const f of sel.included) {
    const run = Math.max(2, ...[...f.text.matchAll(/`+/g)].map((m) => m[0].length));
    const fence = '`'.repeat(run + 1);
    out.push(`### ${f.path}${f.redactions ? ' (segredos redigidos)' : ''}`, '', `${fence}${LANG[extname(f.path).toLowerCase()] ?? ''}`, f.text.replace(/\n$/, ''), fence, '');
  }
  return out.join('\n');
}

/** Garante que exports dentro de .sdd/context/ não sejam versionados. */
export function ensureContextIgnored(root) {
  const gi = join(root, '.sdd', '.gitignore');
  if (!existsSync(gi)) return;
  const t = readFileSync(gi, 'utf8');
  if (!/^context\/$/m.test(t)) appendFileSync(gi, `${t.endsWith('\n') ? '' : '\n'}context/\n`);
}

export function writeContext(root, outFile, content) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, content);
  if (toPosix(outFile).includes('/.sdd/context/')) ensureContextIgnored(root);
}

/** Comando do Repomix equivalente (Secretlint ligado; nunca --no-security-check). */
export function repomixArgs({ out, include = [], style = 'markdown' }) {
  const args = ['--yes', REPOMIX, '--style', style, '-o', out, '--ignore', REPOMIX_IGNORE.join(',')];
  if (include.length) args.push('--include', include.join(','));
  return args;
}
