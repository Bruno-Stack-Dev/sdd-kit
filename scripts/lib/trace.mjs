// Trace local e barato (.sdd/trace/<sessão>.jsonl), com campos compatíveis com OpenTelemetry.
//
// - Nunca grava conteúdo de arquivo nem saída de ferramenta; comandos são redigidos (segredos) e
//   truncados. Fail-open: qualquer erro de trace é engolido — observabilidade não bloqueia trabalho.
// - trace_id = sha256(session) (32 hex) → todos os spans da sessão no mesmo trace; span_id aleatório.
// - Desligável por projeto: observability.trace: false no sdd.config.yaml.
import { existsSync, appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { sanitize, sanitizeString, isSensitiveKey, REDACTED } from './sanitize.mjs';

export const TRACE_VERSION = 1;
const MAX_FIELD = 300;

export function traceIdFor(session) {
  return createHash('sha256').update(String(session ?? 'sem-sessao')).digest('hex').slice(0, 32);
}

export function newSpanId() {
  return randomBytes(8).toString('hex');
}

export function traceDir(root) {
  return join(root, '.sdd', 'trace');
}

function clean(v) {
  if (v === undefined || v === null) return undefined;
  return sanitizeString(v, MAX_FIELD);
}

/** `mcp__<servidor>__<ferramenta>` → { server, tool }; null para ferramentas que não são MCP. */
export function parseMcpTool(name) {
  const m = /^mcp__(.+?)__(.+)$/.exec(String(name ?? ''));
  return m ? { server: m[1], tool: m[2] } : null;
}

/** Resumo seguro do input de uma ferramenta (sem conteúdo). */
export function summarizeToolInput(tool, input = {}) {
  const out = {};
  if (input.file_path ?? input.notebook_path) out['file.path'] = clean(input.file_path ?? input.notebook_path);
  if (typeof input.command === 'string') out['tool.command'] = clean(input.command);
  if (typeof input.pattern === 'string') out['tool.pattern'] = clean(input.pattern);
  if (typeof input.path === 'string') out['tool.path'] = clean(input.path);
  if (input.skill) out['skill.name'] = clean(input.skill);
  if (input.subagent_type) out['agent.spawned'] = clean(input.subagent_type);
  const mcp = parseMcpTool(tool);
  if (mcp) { out['mcp.server'] = clean(mcp.server); out['mcp.tool'] = clean(mcp.tool); }
  // LSP: só a operação (findReferences, goToDefinition...), nunca o conteúdo.
  if (tool === 'LSP' && typeof input.operation === 'string') out['lsp.operation'] = clean(input.operation);
  if (tool === 'LSP' && typeof (input.filePath ?? input.file_path) === 'string') out['file.path'] = clean(input.filePath ?? input.file_path);
  return out;
}

/**
 * Grava um evento de trace. `name` no estilo pontuado (tool.called, file.modified, agent.stopped...).
 * attrs: atributos pequenos (sdd.spec, sdd.task, sdd.agent, tool.name...).
 */
export function traceEvent(root, { session, name, attrs = {}, status = 'ok', durationMs = null }) {
  try {
    const dir = traceDir(root);
    mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const rec = {
      v: TRACE_VERSION,
      ts: new Date(now).toISOString(),
      trace_id: traceIdFor(session),
      span_id: newSpanId(),
      parent_span_id: traceIdFor(session).slice(0, 16),
      name,
      session: session ?? null,
      status,
      ...(durationMs !== null ? { duration_ms: durationMs } : {}),
      attrs: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, isSensitiveKey(k) && typeof v === 'string' ? REDACTED : typeof v === 'string' ? clean(v) : sanitize(v, { maxString: MAX_FIELD, maxArray: 20 })])),
    };
    const file = join(dir, `${String(session ?? 'sem-sessao').replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`);
    appendFileSync(file, JSON.stringify(rec) + '\n');
    return rec;
  } catch {
    return null;
  }
}

/** Lê trace (todas as sessões ou uma) + eventos de domínio (.sdd/events.jsonl) numa linha do tempo. */
export function readTimeline(root, { session, spec, task, agent, traceId } = {}) {
  const items = [];
  const dir = traceDir(root);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { items.push({ source: 'trace', ...JSON.parse(line) }); } catch { /* linha parcial */ }
      }
    }
  }
  const evFile = join(root, '.sdd', 'events.jsonl');
  if (existsSync(evFile)) {
    for (const line of readFileSync(evFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        items.push({ source: 'event', ts: e.ts, trace_id: traceIdFor(e.session), span_id: e.id.replace(/-/g, '').slice(0, 16), name: e.type.toLowerCase().replace(/_/g, '.'), session: e.session ?? null, status: 'ok', attrs: { 'sdd.spec': e.spec, 'sdd.task': e.task, 'sdd.agent': e.agent, 'sdd.gate': e.gate } });
      } catch { /* linha parcial */ }
    }
  }
  return items
    .filter((i) => (!session || i.session === session) && (!traceId || i.trace_id === traceId))
    .filter((i) => (!spec || i.attrs?.['sdd.spec'] === spec || String(i.attrs?.['sdd.task'] ?? '').startsWith(`${spec}/`)))
    .filter((i) => (!task || i.attrs?.['sdd.task'] === task))
    .filter((i) => (!agent || i.attrs?.['sdd.agent'] === agent))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

/** Converte a linha do tempo para OTLP/HTTP JSON (resourceSpans). */
export function toOtlp(items, { serviceName = 'sdd-kit' } = {}) {
  // A mesma sanitização do trace e do dashboard: nada sai para o backend sem passar por ela.
  const attr = (k, v) => ({ key: k, value: typeof v === 'number' ? { intValue: String(Math.trunc(v)) } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: isSensitiveKey(k) ? REDACTED : sanitizeString(v, MAX_FIELD) } });
  const spans = items.map((i) => {
    const t = Date.parse(i.ts);
    const start = BigInt(Number.isFinite(t) ? t : 0) * 1_000_000n;
    const dur = Number.isFinite(i.duration_ms) ? Math.max(0, Math.round(i.duration_ms)) : 0;
    const end = start + BigInt(dur) * 1_000_000n;
    return {
      traceId: i.trace_id,
      spanId: i.span_id.padEnd(16, '0').slice(0, 16),
      parentSpanId: i.parent_span_id ?? undefined,
      name: i.name,
      kind: 1,
      startTimeUnixNano: String(start),
      endTimeUnixNano: String(end),
      attributes: [attr('sdd.source', i.source), ...(i.session ? [attr('session.id', i.session)] : []), ...Object.entries(i.attrs ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => attr(k, v))],
      status: { code: i.status === 'error' ? 2 : 1 },
    };
  });
  return { resourceSpans: [{ resource: { attributes: [attr('service.name', serviceName)] }, scopeSpans: [{ scope: { name: 'sdd-kit', version: String(TRACE_VERSION) }, spans }] }] };
}
