// Peças comuns das telas: títulos de seção, pares chave/valor, linha de evento e filtros.
// Uma "página" é { head: string[], rows: { text, open? }[], tail: string[] }: `head`/`tail` fixos,
// `rows` rolam; linhas com `open` são selecionáveis (Enter abre o detalhe).
import { padEnd, truncate, clock, width as vw, stripAnsi } from '../text.mjs';

export const FILTERS = [
  { id: 'all', label: 'todos', test: () => true },
  { id: 'errors', label: 'erros', test: (e) => e.status === 'error' || e.status === 'warn' },
  { id: 'tools', label: 'ferramentas', test: (e) => ['tool', 'mcp', 'lsp'].includes(e.category) },
  { id: 'files', label: 'arquivos', test: (e) => e.category === 'file' },
  { id: 'security', label: 'segurança', test: (e) => e.category === 'security' || e.category === 'gate' },
  { id: 'tests', label: 'testes', test: (e) => e.category === 'test' || e.category === 'guardian' },
  { id: 'mcp', label: 'MCP', test: (e) => e.category === 'mcp' },
  { id: 'agent', label: 'com agente', test: (e) => !!e.agent },
];

export const shortAgent = (n) => (n ? String(n).replace(/^agente-/, '') : '—');

export function section(t, title, w, extra = '') {
  const label = ` ${title} `;
  return t.bold(t.cyan(label)) + (extra ? t.gray(` ${extra}`) : '') + t.gray(t.sym.h.repeat(Math.max(0, w - 1 - vw(label) - vw(extra) - (extra ? 1 : 0))));
}

export function kv(t, k, v, kw = 16) {
  return `${t.gray(padEnd(k, kw))} ${v ?? t.gray('—')}`;
}

const STATUS_OF_EVENT = { ok: 'ok', warn: 'warn', error: 'error' };

export function eventLine(t, e, w) {
  const who = padEnd(shortAgent(e.agent ?? (e.source === 'domain' ? 'estado' : 'sessão')), 16);
  const label = padEnd(e.label, 18);
  const icon = e.status === 'ok' ? t.gray(t.sym.bullet) : t.icon(STATUS_OF_EVENT[e.status]);
  return truncate(`${t.gray(clock(e.ts))} ${icon} ${who} ${e.status === 'error' ? t.red(label) : e.status === 'warn' ? t.yellow(label) : label} ${e.task && !String(e.summary).includes(e.task) ? `${e.task} ` : ''}${e.summary}`, w);
}

/** Aplica busca (texto) às linhas de uma página, mantendo cabeçalho e rodapé. */
export function applySearch(page, query) {
  if (!query) return page;
  const q = query.toLowerCase();
  const rows = page.rows.filter((r) => r.search !== false && String(r.plain ?? stripAnsi(r.text)).toLowerCase().includes(q));
  return { ...page, rows: rows.length ? rows : [{ text: `(nada encontrado para "${query}")` }] };
}

export function pct(p) {
  return p === null || p === undefined ? 'n/d' : `${Math.round(p)}%`;
}
