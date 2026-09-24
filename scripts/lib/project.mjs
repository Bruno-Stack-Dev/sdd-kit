// Visão consolidada de um projeto: config + specs + tarefas + grafo + estado.
// Usada pela CLI, pelo doctor e pelos hooks, para que todos enxerguem o mesmo projeto.
import { loadConfig, knownAgents } from './config.mjs';
import { loadSpecs, loadPlans, loadTasks } from './specs.mjs';
import { buildTaskGraph, buildSpecGraph, readyTasks, topoOrder } from './graph.mjs';
import { computeState } from './events.mjs';
import { effectiveTaskStatus, ledgerLabel, SPEC_ACTIVE } from './state.mjs';

export function specsDirOf(config) {
  return String(config?.paths?.specs ?? 'specs/').replace(/\/+$/, '') || 'specs';
}

export function loadProject(root) {
  const { state, log } = computeState(root);
  return bindState(loadDefinitions(root), state, log);
}

/** Só o que vem dos arquivos (config, specs, planos, tarefas, grafos, agentes) — sem o estado. */
export function loadDefinitions(root) {
  const cfg = loadConfig(root);
  const specsDir = specsDirOf(cfg.config);
  const specs = loadSpecs(root, specsDir);
  const plans = loadPlans(root, specsDir);
  const taskFiles = loadTasks(root, specsDir);
  const agents = knownAgents(root);
  const taskGraph = buildTaskGraph(taskFiles, specs, agents);
  const specGraph = buildSpecGraph(specs);
  return { root, cfg, specsDir, specs, plans, taskFiles, agents, taskGraph, specGraph };
}

/** Junta definições e estado na visão consolidada (a mesma forma de `loadProject`). */
export function bindState(defs, state, log) {
  const statusOf = (id) => {
    const def = defs.taskGraph.tasks.get(id);
    return def ? effectiveTaskStatus(state, def) : state.tasks[id]?.status ?? 'unknown';
  };
  return { ...defs, state, log, statusOf };
}

/** Resumo de retomada: o que estava em curso, o que está bloqueado e o que pode começar agora. */
export function resumeSummary(p) {
  const { state, taskGraph, statusOf } = p;
  const sessions = Object.entries(state.sessions)
    .filter(([, s]) => s.started && !s.finished)
    .map(([id, s]) => ({ id, started: s.started }));
  const specs = Object.entries(state.specs)
    .filter(([, s]) => SPEC_ACTIVE.includes(s.status))
    .map(([id, s]) => ({ id, status: s.status, rejections: s.rejections ?? 0, last_rejection: s.last_rejection ?? null }));
  const inProgress = [...taskGraph.tasks.values()].filter((t) => statusOf(t.id) === 'in_progress').map((t) => ({ id: t.id, agent: t.agent, title: t.title }));
  const blocked = [...taskGraph.tasks.values()].filter((t) => statusOf(t.id) === 'blocked').map((t) => ({ id: t.id, agent: t.agent, reason: state.tasks[t.id]?.blocked_reason ?? null }));
  const ready = readyTasks(taskGraph, statusOf).map((t) => ({ id: t.id, agent: t.agent, title: t.title }));
  const failingTests = Object.entries(state.tests.by_spec).filter(([, t]) => t.result === 'failed').map(([spec, t]) => ({ spec, ts: t.ts, command: t.command }));
  const blockedGates = Object.values(state.gates).filter((g) => g.status === 'blocked');
  const divergent = [...taskGraph.tasks.values()]
    .filter((t) => state.tasks[t.id] && t.checkbox !== state.tasks[t.id].status)
    .map((t) => ({ id: t.id, checkbox: t.checkbox, state: state.tasks[t.id].status }));
  return {
    open_sessions: sessions,
    active_specs: specs,
    tasks_in_progress: inProgress,
    tasks_blocked: blocked,
    tasks_ready: ready,
    failing_tests: failingTests,
    blocked_gates: blockedGates,
    checkbox_drift: divergent,
    anomalies: state.anomalies.length,
    events: state.events,
  };
}

export const LEDGER_MARKER = 'AUTO-GENERATED — DO NOT EDIT DIRECTLY';

/** LEDGER derivado: ordem por dependência entre specs + estado de cada uma. */
export function renderLedger(p, { slug = 'projeto' } = {}) {
  const order = topoOrder(p.specGraph.adjacency);
  const byId = p.specGraph.specs;
  const rows = order.map((id, i) => {
    const s = byId.get(id);
    const st = p.state.specs[id];
    const tasks = [...p.taskGraph.tasks.values()].filter((t) => t.spec === id);
    const done = tasks.filter((t) => ['completed', 'cancelled'].includes(p.statusOf(t.id))).length;
    const estado = st ? ledgerLabel(st.status) : (s?.status === 'implementada' ? 'feita (frontmatter)' : 'pendente');
    const guardian = st?.status === 'implemented' || st?.status === 'approved' ? 'aprovada' : st?.rejections ? `reprovada ${st.rejections}x` : '—';
    return `| ${i + 1} | \`${id}\` | ${s?.fm?.titulo ?? ''} | ${(s?.dependsOn ?? []).join(', ') || '—'} | ${estado}${st?.imported ? ' (importado v2)' : ''} | ${done}/${tasks.length} | ${guardian} |`;
  });
  const summary = resumeSummary(p);
  return [
    '---',
    `ledger-de: ${slug}`,
    'gerado-de: .sdd/events.jsonl',
    'tags: [ledger, retomada, gerado]',
    '---',
    '',
    `<!-- ${LEDGER_MARKER}. Fonte: .sdd/events.jsonl + specs/. Regenerar: node scripts/sdd.mjs state ledger -->`,
    '',
    `# LEDGER — ${slug}`,
    '',
    '> Visão gerada do estado do pipeline. **Não edite**: registre eventos com `node scripts/sdd.mjs event ...`',
    '> e regenere. Para retomar uma sessão interrompida: `node scripts/sdd.mjs state resume`.',
    '',
    '## Ordem de execução (por dependência)',
    '',
    '| # | Spec | Título | Depende de | Estado | Tarefas | Guardião |',
    '|---|------|--------|-----------|--------|---------|----------|',
    ...(rows.length ? rows : ['| — | — | — | — | — | — | — |']),
    '',
    '## Próximas tarefas prontas',
    '',
    ...(summary.tasks_ready.length ? summary.tasks_ready.map((t) => `- \`${t.id}\` — ${t.title} (@${t.agent})`) : ['- nenhuma']),
    '',
    '## Bloqueios',
    '',
    ...(summary.tasks_blocked.length ? summary.tasks_blocked.map((t) => `- \`${t.id}\` — ${t.reason ?? 'sem motivo registrado'}`) : ['- nenhum']),
    '',
  ].join('\n');
}

/** Lê a tabela de um LEDGER v2 escrito à mão: [{ spec, slug, state }]. */
export function parseLegacyLedger(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const spec = cells[2].replace(/`/g, '');
    if (!/^[A-Z][A-Z0-9-]*\d+$/.test(spec)) continue;
    const state = cells[5].replace(/`/g, '').toLowerCase();
    if (!['pendente', 'em-andamento', 'feita'].includes(state)) continue;
    rows.push({ spec, slug: cells[3], state });
  }
  return rows;
}
