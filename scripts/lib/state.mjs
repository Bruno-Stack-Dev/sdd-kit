// Reducer determinístico: events.jsonl → estado. Mesma entrada, mesmo estado, sempre.
//
// Máquina de estados de spec:
//   draft ─PLAN_CREATED→ planned ─TASK_STARTED→ in_progress ─GUARDIAN_STARTED→ in_review
//   in_review ─GUARDIAN_APPROVED(evidência)→ approved ─SPEC_IMPLEMENTED→ implemented
//   in_review ─GUARDIAN_REJECTED(motivo)→ in_progress
//   SPEC_UPDATED depois de approved/implemented invalida a aprovação (volta a in_progress)
//   qualquer ─SPEC_ARCHIVED→ archived (terminal)
//
// Máquina de estados de tarefa:
//   pending ─TASK_STARTED(deps concluídas)→ in_progress ─TASK_COMPLETED→ completed
//   pending|in_progress ─TASK_BLOCKED(motivo)→ blocked ─TASK_STARTED→ in_progress
//   pending|blocked|in_progress ─TASK_CANCELLED(motivo)→ cancelled
//   completed|cancelled ─TASK_REOPENED→ pending
//   Tarefa de agente *-guardian só conclui com a spec aprovada (GUARDIAN_APPROVED).
//   TASK_STARTED com meta.wave (onda paralela) é recusado se o agente já tem outra tarefa em
//   andamento; a tarefa guarda `wave` até ser reiniciada fora de uma onda.

export const STATE_VERSION = 1;

export const SPEC_ACTIVE = ['draft', 'planned', 'in_progress', 'in_review', 'approved'];
const TERMINAL_TASK = ['completed', 'cancelled'];

export function emptyState() {
  return {
    v: STATE_VERSION,
    events: 0,
    last_event_id: null,
    last_ts: null,
    sessions: {},
    discovery: null,
    specs: {},
    tasks: {},
    tests: { last: null, by_spec: {} },
    gates: {},
    packs: {},
    anomalies: [],
    duplicates: 0,
  };
}

function specOfTask(ev, ctx) {
  if (ev.spec) return ev.spec;
  const def = ctx?.graph?.tasks?.get?.(ev.task);
  if (def?.spec) return def.spec;
  return ev.task?.includes('/') ? ev.task.split('/')[0] : null;
}

function reasonOf(ev) {
  const r = ev.meta?.reason ?? ev.result;
  return typeof r === 'string' && r.trim() ? r.trim() : null;
}

function hasEvidence(ev) {
  const e = ev.meta?.evidence;
  return (typeof e === 'string' && e.trim() !== '') || (Array.isArray(e) && e.length > 0);
}

/**
 * Aplica um evento ao estado (mutando-o). Devolve null se válido ou uma mensagem de erro — nesse
 * caso o estado NÃO é alterado.
 */
export function applyEvent(state, ev, ctx = {}) {
  const need = (field) => (ev[field] ? null : `${ev.type} exige o campo '${field}'`);
  const spec = (id) => state.specs[id];
  const touch = () => {
    state.events++;
    state.last_event_id = ev.id;
    state.last_ts = ev.ts;
  };

  switch (ev.type) {
    case 'SESSION_STARTED': {
      const e = need('session'); if (e) return e;
      const s = state.sessions[ev.session];
      if (s) { s.resumed = (s.resumed ?? 0) + 1; s.finished = null; }
      else state.sessions[ev.session] = { started: ev.ts, finished: null };
      break;
    }
    case 'SESSION_FINISHED': {
      const e = need('session'); if (e) return e;
      state.sessions[ev.session] ??= { started: null };
      state.sessions[ev.session].finished = ev.ts;
      break;
    }
    case 'DISCOVERY_STARTED':
      state.discovery = { status: 'in_progress', mode: ev.meta?.mode ?? null, started: ev.ts };
      break;
    case 'DISCOVERY_COMPLETED':
      state.discovery = { ...(state.discovery ?? {}), status: 'completed', completed: ev.ts };
      break;

    case 'SPEC_CREATED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (s && s.status !== 'archived') return `spec ${ev.spec} já existe (status ${s.status})`;
      state.specs[ev.spec] = { status: 'draft', created: ev.ts, rejections: 0 };
      break;
    }
    case 'SPEC_UPDATED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado (falta SPEC_CREATED)`;
      if (s.status === 'archived') return `spec ${ev.spec} está arquivada`;
      if (s.status === 'approved' || s.status === 'implemented') {
        s.status = 'in_progress';
        s.approval_invalidated = ev.ts;
      }
      s.updated = ev.ts;
      break;
    }
    case 'PLAN_CREATED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado (falta SPEC_CREATED)`;
      if (s.status === 'draft') s.status = 'planned';
      s.plan = ev.plan ?? ev.spec;
      break;
    }
    case 'SPEC_ARCHIVED': {
      const e = need('spec'); if (e) return e;
      if (!spec(ev.spec)) return `spec ${ev.spec} não existe no estado`;
      spec(ev.spec).status = 'archived';
      break;
    }

    case 'TASK_CREATED': {
      const e = need('task'); if (e) return e;
      if (state.tasks[ev.task]) return `tarefa ${ev.task} já existe`;
      const sid = specOfTask(ev, ctx);
      if (!sid || !spec(sid)) return `tarefa ${ev.task}: spec ${sid ?? '?'} não existe no estado (falta SPEC_CREATED)`;
      const def = ctx?.graph?.tasks?.get?.(ev.task);
      state.tasks[ev.task] = { status: 'pending', spec: sid, agent: ev.agent ?? def?.agent ?? null, created: ev.ts };
      // Adoção de projeto v2: o status que já estava no checkbox entra uma única vez, marcado como
      // importado (sem a trilha de eventos que o justificaria). Daí em diante o estado é a autoridade.
      const imported = ev.meta?.imported_status;
      if (imported && imported !== 'pending') {
        if (!['in_progress', 'blocked', 'completed', 'cancelled'].includes(imported)) return `imported_status inválido '${imported}'`;
        state.tasks[ev.task].status = imported;
        state.tasks[ev.task].imported = true;
      }
      break;
    }
    case 'TASK_STARTED': {
      const e = need('task'); if (e) return e;
      const t = state.tasks[ev.task];
      if (!t) return `tarefa ${ev.task} não existe no estado (falta TASK_CREATED — rode \`sdd tasks sync\`)`;
      if (!['pending', 'blocked'].includes(t.status)) return `tarefa ${ev.task} está '${t.status}', não pode iniciar`;
      const def = ctx?.graph?.tasks?.get?.(ev.task);
      if (def && !ev.meta?.force) {
        const pend = def.dependsOn.filter((d) => !TERMINAL_TASK.includes(state.tasks[d]?.status));
        if (pend.length) return `tarefa ${ev.task} tem dependências não concluídas: ${pend.join(', ')}`;
      }
      const s = spec(t.spec);
      if (s && ['archived', 'implemented'].includes(s.status)) return `spec ${t.spec} está '${s.status}'`;
      if (ev.meta?.wave) {
        const agent = ev.agent ?? t.agent;
        const clash = Object.entries(state.tasks).find(([id, o]) => id !== ev.task && o.status === 'in_progress' && o.agent === agent);
        if (clash) return `@${agent} já tem ${clash[0]} em andamento: numa onda, uma tarefa por agente`;
        t.wave = String(ev.meta.wave);
      } else delete t.wave;
      t.status = 'in_progress';
      t.started = ev.ts;
      if (ev.agent) t.agent = ev.agent;
      if (ev.meta?.model) t.model = String(ev.meta.model);
      if (ev.meta?.effort) t.effort = String(ev.meta.effort);
      if (s && ['draft', 'planned', 'approved'].includes(s.status)) s.status = 'in_progress';
      break;
    }
    case 'TASK_BLOCKED': {
      const e = need('task'); if (e) return e;
      const t = state.tasks[ev.task];
      if (!t) return `tarefa ${ev.task} não existe no estado`;
      if (!['pending', 'in_progress'].includes(t.status)) return `tarefa ${ev.task} está '${t.status}', não pode ser bloqueada`;
      const reason = reasonOf(ev);
      if (!reason) return 'TASK_BLOCKED exige um motivo (meta.reason / --reason)';
      t.status = 'blocked';
      t.blocked_reason = reason;
      break;
    }
    case 'TASK_COMPLETED': {
      const e = need('task'); if (e) return e;
      const t = state.tasks[ev.task];
      if (!t) return `tarefa ${ev.task} não existe no estado`;
      if (t.status !== 'in_progress') return `tarefa ${ev.task} está '${t.status}': só uma tarefa em andamento pode ser concluída`;
      if (/-guardian$/.test(t.agent ?? '') && !['approved', 'implemented'].includes(spec(t.spec)?.status)) {
        return `tarefa de guardião ${ev.task} só conclui depois de GUARDIAN_APPROVED na spec ${t.spec}`;
      }
      t.status = 'completed';
      t.completed = ev.ts;
      delete t.blocked_reason;
      if (ev.meta?.evidence) t.evidence = ev.meta.evidence;
      break;
    }
    case 'TASK_CANCELLED': {
      const e = need('task'); if (e) return e;
      const t = state.tasks[ev.task];
      if (!t) return `tarefa ${ev.task} não existe no estado`;
      if (TERMINAL_TASK.includes(t.status)) return `tarefa ${ev.task} já está '${t.status}'`;
      const reason = reasonOf(ev);
      if (!reason) return 'TASK_CANCELLED exige um motivo (meta.reason / --reason)';
      t.status = 'cancelled';
      t.cancelled_reason = reason;
      break;
    }
    case 'TASK_REOPENED': {
      const e = need('task'); if (e) return e;
      const t = state.tasks[ev.task];
      if (!t) return `tarefa ${ev.task} não existe no estado`;
      if (!TERMINAL_TASK.includes(t.status)) return `tarefa ${ev.task} não está concluída/cancelada`;
      t.status = 'pending';
      t.reopened = (t.reopened ?? 0) + 1;
      const s = spec(t.spec);
      if (s && ['approved', 'implemented'].includes(s.status)) { s.status = 'in_progress'; s.approval_invalidated = ev.ts; }
      break;
    }

    case 'TEST_STARTED':
    case 'TEST_PASSED':
    case 'TEST_FAILED': {
      const result = { TEST_STARTED: 'running', TEST_PASSED: 'passed', TEST_FAILED: 'failed' }[ev.type];
      const entry = { result, ts: ev.ts, command: ev.meta?.command ?? null };
      state.tests.last = { ...entry, spec: ev.spec ?? null };
      if (ev.spec) state.tests.by_spec[ev.spec] = entry;
      break;
    }

    case 'GUARDIAN_STARTED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado`;
      if (!['planned', 'in_progress', 'in_review'].includes(s.status)) return `spec ${ev.spec} está '${s.status}': revisão só com a spec em andamento`;
      s.status = 'in_review';
      s.review_started = ev.ts;
      break;
    }
    case 'GUARDIAN_REJECTED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado`;
      if (s.status !== 'in_review') return `spec ${ev.spec} não está em revisão (GUARDIAN_STARTED antes)`;
      const reason = reasonOf(ev);
      if (!reason) return 'GUARDIAN_REJECTED exige o motivo (meta.reason / --reason)';
      s.status = 'in_progress';
      s.rejections = (s.rejections ?? 0) + 1;
      s.last_rejection = reason;
      break;
    }
    case 'GUARDIAN_APPROVED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado`;
      if (s.status !== 'in_review') return `spec ${ev.spec} não está em revisão (GUARDIAN_STARTED antes)`;
      if (!hasEvidence(ev)) return 'GUARDIAN_APPROVED exige evidência (meta.evidence / --evidence: relatório, testes, greps)';
      s.status = 'approved';
      s.approved = ev.ts;
      s.approval_evidence = ev.meta.evidence;
      delete s.approval_invalidated;
      break;
    }

    case 'GATE_BLOCKED':
    case 'GATE_PASSED': {
      const e = need('gate'); if (e) return e;
      const key = `${ev.spec ?? '*'}::${ev.gate}`;
      state.gates[key] = { gate: ev.gate, spec: ev.spec ?? null, status: ev.type === 'GATE_BLOCKED' ? 'blocked' : 'passed', ts: ev.ts, reason: reasonOf(ev) };
      break;
    }

    case 'SPEC_IMPLEMENTED': {
      const e = need('spec'); if (e) return e;
      const s = spec(ev.spec);
      if (!s) return `spec ${ev.spec} não existe no estado`;
      if (s.status !== 'approved') return `spec ${ev.spec} está '${s.status}': só vira implementada depois de GUARDIAN_APPROVED`;
      const open = Object.entries(state.tasks).filter(([, t]) => t.spec === ev.spec && !TERMINAL_TASK.includes(t.status)).map(([id]) => id);
      if (open.length) return `spec ${ev.spec} tem tarefas abertas: ${open.join(', ')}`;
      if (state.tests.by_spec[ev.spec]?.result === 'failed') return `último teste da spec ${ev.spec} falhou`;
      const blocked = Object.values(state.gates).filter((g) => g.status === 'blocked' && (g.spec === ev.spec || g.spec === null));
      if (blocked.length) return `gate(s) bloqueado(s): ${blocked.map((g) => g.gate).join(', ')}`;
      s.status = 'implemented';
      s.implemented = ev.ts;
      break;
    }

    case 'LEDGER_IMPORTED': {
      const rows = ev.meta?.specs;
      if (!Array.isArray(rows)) return 'LEDGER_IMPORTED exige meta.specs (lista)';
      const map = { pendente: 'draft', 'em-andamento': 'in_progress', feita: 'implemented' };
      for (const r of rows) {
        if (!r?.spec) continue;
        if (state.specs[r.spec]) continue; // estado estruturado já existente vence o legado
        state.specs[r.spec] = { status: map[r.state] ?? 'draft', created: ev.ts, rejections: 0, imported: true };
      }
      break;
    }
    case 'CONFIG_MIGRATED':
      break;
    case 'PACK_ACTIVATED':
    case 'PACK_DEACTIVATED': {
      const pack = ev.meta?.pack;
      if (!pack) return `${ev.type} exige meta.pack`;
      state.packs[pack] = { active: ev.type === 'PACK_ACTIVATED', ts: ev.ts, hash: ev.meta?.hash ?? null };
      break;
    }
    default:
      return `tipo de evento desconhecido '${ev.type}'`;
  }
  touch();
  return null;
}

/**
 * Reduz a lista de eventos. Eventos inválidos (transição proibida, chave repetida) não alteram o
 * estado e ficam registrados em `anomalies`/`duplicates` para o doctor.
 */
export function reduce(events, ctx = {}, validateFn = null) {
  const state = emptyState();
  const keys = new Set();
  for (const ev of events) {
    if (validateFn) {
      const errs = validateFn(ev);
      if (errs.length) { state.anomalies.push({ id: ev?.id ?? null, type: ev?.type ?? null, error: errs.map((e) => `${e.path}: ${e.message}`).join('; ') }); continue; }
    }
    if (ev.key) {
      if (keys.has(ev.key)) { state.duplicates++; continue; }
    }
    const err = applyEvent(state, ev, ctx);
    if (err) { state.anomalies.push({ id: ev.id, type: ev.type, error: err }); continue; }
    if (ev.key) keys.add(ev.key);
  }
  return state;
}

// ------------------------------------------------------------------------------------------------
// Visões derivadas
// ------------------------------------------------------------------------------------------------

export function effectiveTaskStatus(state, def) {
  return state.tasks[def.id]?.status ?? def.checkbox ?? 'pending';
}

const LEDGER_STATE = { draft: 'pendente', planned: 'pendente', in_progress: 'em-andamento', in_review: 'em-andamento', approved: 'em-andamento', implemented: 'feita', archived: 'arquivada' };
export function ledgerLabel(status) {
  return LEDGER_STATE[status] ?? 'pendente';
}
