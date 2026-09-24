// Event store do dashboard: lê INCREMENTALMENTE os dois logs que o kit já grava — nenhum sistema
// de eventos novo.
//   .sdd/events.jsonl     eventos de domínio (autoridade do estado; reducer determinístico)
//   .sdd/trace/*.jsonl    trace operacional dos hooks (ferramentas, arquivos, política, agentes)
//
// - Tail por offset: cada leitura só processa bytes novos; linha sem \n final fica pendente até a
//   próxima leitura (escrita em andamento); arquivo que encolheu = rotação/truncamento → relê do zero.
// - Linha inválida conta como `invalid` e não interrompe nada (o dashboard é observador).
// - Tudo passa pelo sanitizer central antes de chegar a qualquer formatador.
import { existsSync, openSync, readSync, closeSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { sanitize, sanitizeString, displaySafe } from '../sanitize.mjs';

/** Sanitizado + sem caracteres de controle em todo texto (o que vai para a tela e o JSON). */
export function safeDeep(v) {
  if (typeof v === 'string') return displaySafe(v);
  if (Array.isArray(v)) return v.map(safeDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, safeDeep(x)]));
  return v;
}
import { parseMcpTool } from '../trace.mjs';

const CHUNK = 1 << 20;

/** Leitor incremental de um arquivo JSONL. */
export class JsonlTail {
  /**
   * @param {string} file
   * @param {{ objectsOnly?: boolean, acceptUnterminated?: boolean }} [opts]
   *   objectsOnly: JSON que não é objeto conta como linha inválida (trace). Para o log de domínio,
   *   `false`: o valor segue para o reducer, que o registra como anomalia — como `computeState`.
   *   acceptUnterminated: a última linha sem \n, se for JSON válido, já é entregue (como `readEvents`);
   *   quando o \n chegar, a mesma linha não é entregue de novo.
   */
  constructor(file, { objectsOnly = true, acceptUnterminated = false } = {}) {
    this.file = file;
    this.objectsOnly = objectsOnly;
    this.acceptUnterminated = acceptUnterminated;
    this.emittedPartial = null;
    this.offset = 0;
    this.partial = '';
    this.decoder = new StringDecoder('utf8');
    this.lineNo = 0;
    this.invalid = [];
    this.resets = 0;
  }

  reset() {
    this.offset = 0;
    this.partial = '';
    this.decoder = new StringDecoder('utf8');
    this.lineNo = 0;
    this.invalid = [];
    this.resets++;
  }

  /** Há bytes novos (ou o arquivo encolheu)? Só um stat. */
  changed() {
    try { const s = statSync(this.file).size; return s !== this.offset; } catch { return this.offset > 0; }
  }

  /**
   * Lê o que foi acrescentado desde a última chamada.
   * @returns {{ records: object[], reset: boolean, missing: boolean }}
   */
  read() {
    let size;
    try { size = statSync(this.file).size; } catch {
      const had = this.offset > 0;
      if (had) this.reset();
      return { records: [], reset: had, missing: true };
    }
    let reset = false;
    if (size < this.offset) { this.reset(); reset = true; }
    if (size === this.offset) return { records: [], reset, missing: false };
    let text = this.partial;
    let fd;
    try {
      fd = openSync(this.file, 'r');
      const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - this.offset));
      let pos = this.offset;
      while (pos < size) {
        const n = readSync(fd, buf, 0, Math.min(buf.length, size - pos), pos);
        if (n <= 0) break;
        text += this.decoder.write(buf.subarray(0, n));
        pos += n;
      }
      this.offset = pos;
    } catch {
      return { records: [], reset, missing: false };
    } finally {
      if (fd !== undefined) try { closeSync(fd); } catch { /* já fechado */ }
    }
    const lines = text.split('\n');
    this.partial = lines.pop() ?? '';
    const records = [];
    const take = (t) => {
      try {
        const v = JSON.parse(t);
        if (!this.objectsOnly || (v && typeof v === 'object' && !Array.isArray(v))) records.push(v);
        else this.invalid.push({ line: this.lineNo, message: 'linha não é um objeto JSON' });
      } catch { this.invalid.push({ line: this.lineNo, message: 'linha não é JSON válido' }); }
      if (this.invalid.length > 200) this.invalid.shift();
    };
    lines.forEach((line, i) => {
      this.lineNo++;
      const t = line.trim();
      // A linha já entregue sem \n (acceptUnterminated) só ganhou o terminador agora.
      if (i === 0 && this.emittedPartial !== null && t === this.emittedPartial) { this.emittedPartial = null; return; }
      if (i === 0) this.emittedPartial = null;
      if (t) take(t);
    });
    if (this.acceptUnterminated && this.partial.trim() && this.emittedPartial === null) {
      const t = this.partial.trim();
      let ok = true;
      try { JSON.parse(t); } catch { ok = false; /* ainda sendo escrita (ou truncada) */ }
      if (ok) { take(t); this.emittedPartial = t; }
    }
    return { records, reset, missing: false };
  }

  /** Cauda sem \n que não é JSON válido (escrita interrompida, como em `readEvents`). */
  get truncatedTail() {
    const t = this.partial.trim();
    if (!t) return false;
    try { JSON.parse(t); return false; } catch { return true; }
  }
}

/** Tails de .sdd/trace/*.jsonl; arquivos novos (sessões novas) entram a cada leitura. */
export class TraceDirTail {
  constructor(dir) {
    this.dir = dir;
    this.tails = new Map();
  }

  changed() {
    if (!existsSync(this.dir)) return this.tails.size > 0;
    let names;
    try { names = readdirSync(this.dir).filter((f) => f.endsWith('.jsonl')); } catch { return false; }
    if (names.length !== this.tails.size) return true;
    return names.some((n) => !this.tails.has(n) || this.tails.get(n).changed());
  }

  read() {
    const out = [];
    let reset = false;
    let names = [];
    try { names = existsSync(this.dir) ? readdirSync(this.dir).filter((f) => f.endsWith('.jsonl')).sort() : []; } catch { names = []; }
    for (const gone of [...this.tails.keys()].filter((n) => !names.includes(n))) { this.tails.delete(gone); reset = true; }
    for (const n of names) {
      if (!this.tails.has(n)) this.tails.set(n, new JsonlTail(join(this.dir, n)));
      const r = this.tails.get(n).read();
      if (r.reset) reset = true;
      out.push(...r.records);
    }
    return { records: out, reset };
  }

  get invalidCount() {
    let n = 0;
    for (const t of this.tails.values()) n += t.invalid.length;
    return n;
  }
}

// ------------------------------------------------------------------------------------------------
// Normalização
// ------------------------------------------------------------------------------------------------

const DOMAIN_CATEGORY = [
  [/^(SESSION|DISCOVERY)_/, 'lifecycle'], [/^(SPEC|PLAN)_/, 'spec'], [/^TASK_/, 'task'], [/^TEST_/, 'test'],
  [/^GUARDIAN_/, 'guardian'], [/^GATE_/, 'gate'],
];
const DOMAIN_ERROR = new Set(['TEST_FAILED', 'GUARDIAN_REJECTED', 'GATE_BLOCKED']);
const DOMAIN_WARN = new Set(['TASK_BLOCKED', 'TASK_REOPENED', 'TASK_CANCELLED']);
const READ_TOOLS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
const short = (s, n = 80) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '');

/**
 * Evento de domínio → ObservedEvent. `agentOf(taskId)` resolve o agente de eventos de tarefa que
 * não trazem `--agent` (ex.: TASK_COMPLETED), a partir do estado.
 */
export function normalizeDomain(ev, agentOf = () => null) {
  const type = String(ev.type ?? 'UNKNOWN');
  const meta = safeDeep(sanitize(ev.meta ?? {}, { maxString: 300, maxArray: 20 }));
  const reason = typeof meta.reason === 'string' ? meta.reason : null;
  const target = str(ev.task) ?? str(ev.spec) ?? str(ev.gate) ?? str(ev.session) ?? '';
  return {
    id: str(ev.id) ?? `${type}:${ev.ts}`,
    ts: str(ev.ts) ?? '',
    source: 'domain',
    name: type.toLowerCase().replace(/_/g, '.'),
    label: type,
    category: DOMAIN_CATEGORY.find(([re]) => re.test(type))?.[1] ?? 'other',
    status: DOMAIN_ERROR.has(type) ? 'error' : DOMAIN_WARN.has(type) ? 'warn' : 'ok',
    session: str(ev.session),
    agent: str(ev.agent) ?? (ev.task ? agentOf(String(ev.task)) : null),
    task: str(ev.task),
    spec: str(ev.spec) ?? (typeof ev.task === 'string' && ev.task.includes('/') ? ev.task.split('/')[0] : null),
    gate: str(ev.gate),
    summary: displaySafe(sanitizeString(short([ev.gate ? `${ev.gate}${ev.spec ? `@${ev.spec}` : ''}` : target, reason ? `— ${reason}` : meta.command ? `— ${meta.command}` : ''].filter(Boolean).join(' '), 120))),
    durationMs: null,
    attrs: meta,
  };
}

/** Registro de trace → ObservedEvent. */
export function normalizeTrace(rec) {
  const attrs = safeDeep(sanitize(rec.attrs ?? {}, { maxString: 300, maxArray: 20 }));
  const name = String(rec.name ?? 'unknown');
  const tool = str(attrs['tool.name']);
  const mcp = attrs['mcp.server'] ? { server: String(attrs['mcp.server']), tool: String(attrs['mcp.tool'] ?? '') } : parseMcpTool(tool);
  const file = str(attrs['file.path']);
  let category = 'other';
  let label = name.toUpperCase().replace(/\./g, '_');
  let status = rec.status === 'error' ? 'error' : 'ok';
  let summary = '';
  if (name === 'policy.decision') {
    const d = String(attrs['policy.decision'] ?? '?');
    category = 'security';
    label = `POLICY_${d.toUpperCase()}`;
    status = d === 'deny' ? 'error' : 'warn';
    summary = [attrs['policy.rule'], tool, file ?? attrs['tool.command']].filter(Boolean).join(' · ');
  } else if (name.startsWith('agent.') || name.startsWith('session.')) {
    category = 'lifecycle';
    summary = str(attrs['sdd.task']) ?? str(attrs['session.source']) ?? str(attrs['session.reason']) ?? '';
  } else if (name === 'file.modified') {
    category = 'file';
    summary = file ?? tool ?? '';
  } else if (name === 'tool.called' || name === 'tool.completed') {
    const done = name === 'tool.completed';
    if (mcp) { category = 'mcp'; label = done ? 'MCP_COMPLETED' : 'MCP_CALLED'; summary = `${mcp.server} · ${mcp.tool}`; }
    else if (tool === 'LSP') { category = 'lsp'; label = `LSP_${String(attrs['lsp.operation'] ?? 'CALL').replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase().replace(/^_/, '')}`; summary = file ?? ''; }
    else if (READ_TOOLS.has(tool)) { category = 'file'; label = tool === 'Read' || tool === 'NotebookRead' ? 'FILE_READ' : 'SEARCH'; summary = file ?? str(attrs['tool.pattern']) ?? str(attrs['tool.path']) ?? ''; }
    else if (WRITE_TOOLS.has(tool)) { category = 'file'; label = done ? 'FILE_WRITTEN' : 'FILE_WRITE'; summary = file ?? ''; }
    else {
      category = 'tool';
      label = done ? 'TOOL_COMPLETED' : 'TOOL_CALLED';
      summary = [tool, attrs['tool.command'] ?? attrs['skill.name'] ?? attrs['agent.spawned']].filter(Boolean).join(' · ');
    }
    if (done && rec.status === 'error') label = `${label.replace(/_(COMPLETED|WRITTEN)$/, '')}_FAILED`;
  }
  return {
    id: str(rec.span_id) ?? `${name}:${rec.ts}`,
    ts: str(rec.ts) ?? '',
    source: 'trace',
    name,
    label,
    category,
    status,
    session: str(rec.session),
    agent: str(attrs['sdd.agent']),
    task: str(attrs['sdd.task']),
    spec: str(attrs['sdd.spec']),
    gate: null,
    summary: short(displaySafe(sanitizeString(summary ?? '')), 120),
    durationMs: typeof rec.duration_ms === 'number' ? rec.duration_ms : null,
    attrs,
  };
}

// ------------------------------------------------------------------------------------------------
// Índice de atividade: agregados incrementais, O(1) por evento, memória limitada.
// ------------------------------------------------------------------------------------------------

export class Ring {
  constructor(capacity) {
    this.capacity = Math.max(1, capacity);
    this.items = new Array(this.capacity);
    this.start = 0;
    this.size = 0;
  }

  push(v) {
    const i = (this.start + this.size) % this.capacity;
    this.items[i] = v;
    if (this.size < this.capacity) this.size++;
    else this.start = (this.start + 1) % this.capacity;
  }

  toArray() {
    const out = new Array(this.size);
    for (let i = 0; i < this.size; i++) out[i] = this.items[(this.start + i) % this.capacity];
    return out;
  }
}

const MAX_FILES = 5000;
const MAX_PENDING = 2000;

function bump(map, key, init) {
  let v = map.get(key);
  if (!v) { v = init(); map.set(key, v); }
  return v;
}

// Assinatura para detectar loop: ferramenta + alvo. Sem alvo conhecido (WebFetch, MCP sem
// argumentos no trace...) não há como dizer que duas chamadas são iguais: não conta.
const sigOf = (e) => {
  const target = e.attrs['file.path'] ?? e.attrs['tool.command'] ?? e.attrs['tool.pattern'] ?? e.attrs['tool.path'];
  return target ? `${e.attrs['tool.name']}|${target}` : null;
};

export class ActivityIndex {
  constructor({ maxRecent = 500, maxTimeline = 100 } = {}) {
    this.maxTimeline = maxTimeline;
    this.recent = new Ring(maxRecent);
    this.total = 0;
    this.bySource = { domain: 0, trace: 0 };
    this.agents = new Map();
    this.tools = new Map();
    this.mcp = new Map();
    this.lsp = new Map();
    this.pending = new Map();
    this.policy = { deny: 0, ask: 0, decisions: new Ring(200) };
    this.files = new Map();
    this.tasks = new Map();
    this.sessions = new Map();
    this.tests = new Map();
    // Autonomia por invocação: cada chamada conta uma vez, mesmo com trace antigo (só conclusões)
    // misturado ao novo (tool.called no PreToolUse). `seen` guarda os tool_use_id já contados.
    this.autonomy = { called: 0, completed: 0, unpaired: 0, deny: 0, ask: 0, askWithId: 0 };
    this.seen = new Set();
    this.lastTs = null;
  }

  agent(name) {
    return bump(this.agents, name, () => ({ called: 0, completed: 0, failures: 0, deny: 0, ask: 0, files: new Set(), firstTs: null, lastTs: null, spawned: 0, live: new Map(), timeline: new Ring(this.maxTimeline), lastSig: null, repeat: 0, maxRepeat: 0, context: null }));
  }

  session(id) {
    return bump(this.sessions, id, () => ({ first: null, last: null, events: 0, started: null, finished: null, agents: new Set(), tasks: new Set(), files: new Set() }));
  }

  /** @param {import('./types.mjs').ObservedEvent} e */
  add(e) {
    this.total++;
    this.bySource[e.source] = (this.bySource[e.source] ?? 0) + 1;
    this.recent.push(e);
    if (e.ts && (!this.lastTs || e.ts > this.lastTs)) this.lastTs = e.ts;
    const a = e.agent ? this.agent(e.agent) : null;
    if (a) {
      a.timeline.push(e);
      if (!a.firstTs || e.ts < a.firstTs) a.firstTs = e.ts;
      if (!a.lastTs || e.ts > a.lastTs) a.lastTs = e.ts;
      const used = Number(e.attrs['context.used']);
      const limit = Number(e.attrs['context.limit']);
      if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) a.context = { used, limit, ts: e.ts };
    }
    if (e.session) {
      const s = this.session(e.session);
      s.events++;
      if (!s.first || e.ts < s.first) s.first = e.ts;
      if (!s.last || e.ts > s.last) s.last = e.ts;
      if (e.task) s.tasks.add(e.task);
    }
    if (e.task) {
      const t = bump(this.tasks, e.task, () => ({ starts: 0, files: new Set(), toolCalls: 0, lastEvent: null }));
      if (!t.lastEvent || e.ts >= t.lastEvent.ts) t.lastEvent = { ts: e.ts, label: e.label };
      if (e.name === 'task.started') t.starts++;
    }
    if (e.source === 'domain') return this.addDomain(e);
    return this.addTrace(e, a);
  }

  addDomain(e) {
    if (e.name === 'session.started' && e.session) this.session(e.session).started ??= e.ts;
    if (e.name === 'session.finished' && e.session) this.session(e.session).finished = e.ts;
    if (e.category === 'test') {
      const spec = e.spec ?? '*';
      const suite = typeof e.attrs.suite === 'string' ? e.attrs.suite : 'default';
      const bySuite = bump(this.tests, spec, () => new Map());
      const n = (k) => (Number.isFinite(Number(e.attrs[k])) && e.attrs[k] !== null && e.attrs[k] !== '' ? Number(e.attrs[k]) : null);
      bySuite.set(suite, {
        result: { 'test.started': 'running', 'test.passed': 'passed', 'test.failed': 'failed' }[e.name] ?? 'unknown',
        ts: e.ts,
        command: typeof e.attrs.command === 'string' ? e.attrs.command : null,
        passed: n('passed'), failed: n('failed'), skipped: n('skipped'), total: n('total'), coverage: n('coverage'),
      });
    }
  }

  addTrace(e, a) {
    const tool = e.attrs['tool.name'] ? String(e.attrs['tool.name']) : null;
    const useId = e.attrs['tool.use_id'] ? String(e.attrs['tool.use_id']) : null;
    const s = e.session ? this.session(e.session) : null;
    switch (e.name) {
      case 'session.started': if (s) s.started ??= e.ts; return;
      case 'session.finished': if (s) s.finished = e.ts; return;
      case 'agent.spawned':
        if (a) {
          // Contagem por sessão: duas instâncias do mesmo agente só deixam de estar vivas quando ambas param.
          a.spawned++;
          const k = e.session ?? '-';
          const cur = a.live.get(k);
          a.live.set(k, { count: (cur?.count ?? 0) + 1, since: cur?.since ?? e.ts });
        }
        if (s && e.agent) s.agents.add(e.agent);
        return;
      case 'agent.stopped':
        if (a) {
          const k = e.session ?? '-';
          const cur = a.live.get(k);
          if (cur && cur.count > 1) a.live.set(k, { ...cur, count: cur.count - 1 });
          else a.live.delete(k);
        }
        return;
      case 'policy.decision': {
        const d = String(e.attrs['policy.decision'] ?? '');
        if (d === 'deny') { this.policy.deny++; this.autonomy.deny++; if (a) a.deny++; }
        if (d === 'ask') { this.policy.ask++; this.autonomy.ask++; if (useId) this.autonomy.askWithId++; if (a) a.ask++; }
        if (useId) this.markSeen(useId);
        this.policy.decisions.push(e);
        return;
      }
      case 'tool.called': {
        this.autonomy.called++;
        if (useId) this.markSeen(useId);
        if (a) a.called++;
        if (tool) {
          const t = bump(this.tools, tool, newTool);
          t.called++;
          if (!t.lastTs || e.ts > t.lastTs) t.lastTs = e.ts;
          if (e.agent) t.agents.add(e.agent);
        }
        if (useId) {
          this.pending.set(useId, e.ts);
          if (this.pending.size > MAX_PENDING) this.pending.delete(this.pending.keys().next().value);
        }
        if (tool && READ_TOOLS.has(tool) && e.attrs['file.path']) this.touchFile(String(e.attrs['file.path']), e, 'read');
        this.countSpecial(e, tool, false);
        return;
      }
      case 'tool.completed':
      case 'file.modified': {
        this.autonomy.completed++;
        if (!useId || !this.seen.has(useId)) this.autonomy.unpaired++;
        const failed = e.status === 'error';
        let dur = e.durationMs;
        if (dur === null && useId && this.pending.has(useId)) {
          const t0 = Date.parse(this.pending.get(useId));
          const t1 = Date.parse(e.ts);
          if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) dur = t1 - t0;
          this.pending.delete(useId);
        }
        if (tool) {
          const t = bump(this.tools, tool, newTool);
          t.completed++;
          if (failed) t.failures++;
          if (dur !== null) { t.durSum += dur; t.durCount++; }
          if (!t.lastTs || e.ts > t.lastTs) t.lastTs = e.ts;
          if (e.agent) t.agents.add(e.agent);
        }
        if (a) {
          a.completed++;
          if (failed) a.failures++;
          const sig = sigOf(e);
          if (sig === null) { a.lastSig = null; a.repeat = 0; }
          else if (sig === a.lastSig) a.repeat++;
          else { a.lastSig = sig; a.repeat = 1; }
          if (a.repeat > a.maxRepeat) a.maxRepeat = a.repeat;
        }
        if (e.task) bump(this.tasks, e.task, () => ({ starts: 0, files: new Set(), toolCalls: 0, lastEvent: null })).toolCalls++;
        if (e.name === 'file.modified' && e.attrs['file.path']) this.touchFile(String(e.attrs['file.path']), e, 'modified');
        this.countSpecial(e, tool, true, failed, dur);
        return;
      }
      default:
    }
  }

  markSeen(id) {
    this.seen.add(id);
    if (this.seen.size > 20_000) this.seen.delete(this.seen.values().next().value);
  }

  countSpecial(e, tool, completed, failed = false, dur = null) {
    const mcp = e.category === 'mcp' ? { server: String(e.attrs['mcp.server'] ?? parseMcpTool(tool)?.server ?? '?'), tool: String(e.attrs['mcp.tool'] ?? parseMcpTool(tool)?.tool ?? '') } : null;
    if (mcp) {
      const m = bump(this.mcp, mcp.server, () => ({ called: 0, completed: 0, failures: 0, durSum: 0, durCount: 0, lastTs: null, agents: new Set(), tools: new Set() }));
      if (completed) { m.completed++; if (failed) m.failures++; if (dur !== null) { m.durSum += dur; m.durCount++; } } else m.called++;
      if (!m.lastTs || e.ts > m.lastTs) m.lastTs = e.ts;
      if (e.agent) m.agents.add(e.agent);
      if (mcp.tool) m.tools.add(mcp.tool);
    }
    if (tool === 'LSP') {
      const op = String(e.attrs['lsp.operation'] ?? 'desconhecida');
      const l = bump(this.lsp, op, () => ({ called: 0, completed: 0, failures: 0, durSum: 0, durCount: 0 }));
      if (completed) { l.completed++; if (failed) l.failures++; if (dur !== null) { l.durSum += dur; l.durCount++; } } else l.called++;
    }
  }

  touchFile(path, e, kind) {
    if (!this.files.has(path) && this.files.size >= MAX_FILES) return;
    const f = bump(this.files, path, () => ({ modified: 0, read: 0, tasks: new Set(), agents: new Set(), lastTs: null }));
    f[kind]++;
    if (e.task) f.tasks.add(e.task);
    if (e.agent) f.agents.add(e.agent);
    if (!f.lastTs || e.ts > f.lastTs) f.lastTs = e.ts;
    if (kind === 'modified') {
      if (e.agent) this.agent(e.agent).files.add(path);
      if (e.task) bump(this.tasks, e.task, () => ({ starts: 0, files: new Set(), toolCalls: 0, lastEvent: null })).files.add(path);
      if (e.session) this.session(e.session).files.add(path);
    }
  }
}

function newTool() {
  return { called: 0, completed: 0, failures: 0, durSum: 0, durCount: 0, lastTs: null, agents: new Set() };
}
