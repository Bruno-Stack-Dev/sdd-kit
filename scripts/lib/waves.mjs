// Execução em ondas: quais tarefas prontas podem rodar ao mesmo tempo, cada uma no modelo do seu papel.
//
// Regras (conservadoras e determinísticas), na ordem em que são avaliadas:
//   0. a spec da tarefa só entra quando as specs de que depende (`depende-de`) estão implementadas;
//   1. um guardião (papel exclusivo) em andamento segura a onda inteira;
//   2. agente que já tem tarefa em andamento não recebe outra (os hooks identificam a tarefa pelo
//      tipo do agente — duas do mesmo agente seriam indistinguíveis);
//   3. papel exclusivo (audit) ou etapa `guardian: true` roda sozinho;
//   4. um agente por onda;
//   5. no máximo `max` tarefas (agents.parallel.max da config; 1 = sequencial).
// Prioridade: specs na ordem do LEDGER (dependências primeiro), depois o ID da tarefa.
import { readyTasks, topoOrder } from './graph.mjs';
import { routingPolicy, resolveTask, stepOfTask } from './models.mjs';

export function waveLimit(config, flag, policy = routingPolicy()) {
  const c = policy.concurrency;
  const v = Number(flag ?? config?.agents?.parallel?.max ?? c.default_max);
  if (!Number.isInteger(v) || v < 1) throw new Error(`limite da onda inválido '${flag}' (inteiro de 1 a ${c.max})`);
  return Math.min(v, c.max);
}

/** Próximo identificador de onda: `wave-N`, contando as ondas já registradas no log. */
export function nextWaveId(log) {
  let n = 0;
  for (const ev of log?.events ?? []) {
    const m = /^wave-(\d+)$/.exec(String(ev?.meta?.wave ?? ''));
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `wave-${n + 1}`;
}

/** Spec concluída: implementada no estado (inclusive importada do v2) ou, sem estado, no frontmatter. */
function specDone(p, id) {
  const st = p.state.specs[id]?.status;
  if (st) return st === 'implemented' || st === 'archived';
  return p.specGraph.specs.get(id)?.status === 'implementada';
}

function isExclusive(p, t, role, policy) {
  return policy.concurrency.exclusive_roles.includes(role) || !!stepOfTask(p, t).step?.guardian;
}

/**
 * Planeja a próxima onda.
 * @returns { id, max, wave: [{ id, spec, agent, role, model, effort, exclusive, title }],
 *            deferred: [{ id, agent, reason }], running: [{ id, agent, wave }] }
 */
export function planWave(p, { spec = null, max: maxFlag, profile } = {}) {
  const policy = routingPolicy();
  const max = waveLimit(p.cfg.config, maxFlag, policy);
  const rank = new Map(topoOrder(p.specGraph.adjacency).map((id, i) => [id, i]));
  const ready = readyTasks(p.taskGraph, p.statusOf)
    .filter((t) => !spec || t.spec === spec)
    .sort((a, b) => (rank.get(a.spec) ?? Infinity) - (rank.get(b.spec) ?? Infinity) || a.id.localeCompare(b.id));
  const running = [...p.taskGraph.tasks.values()]
    .filter((t) => p.statusOf(t.id) === 'in_progress')
    .map((t) => ({ id: t.id, agent: p.state.tasks[t.id]?.agent ?? t.agent, wave: p.state.tasks[t.id]?.wave ?? null, exclusive: isExclusive(p, t, resolveTask(p, t, { profile }).role, policy) }));
  const busy = new Set(running.map((r) => r.agent));
  const guardRunning = running.find((r) => r.exclusive);

  const wave = [];
  const deferred = [];
  const defer = (t, reason) => deferred.push({ id: t.id, agent: t.agent, reason });
  for (const t of ready) {
    const r = resolveTask(p, t, { profile });
    const exclusive = isExclusive(p, t, r.role, policy);
    const pendingSpecs = (p.specGraph.specs.get(t.spec)?.dependsOn ?? []).filter((d) => !specDone(p, d));
    if (pendingSpecs.length) { defer(t, `spec ${t.spec} depende de ${pendingSpecs.join(', ')}, ainda não implementada(s)`); continue; }
    if (guardRunning) { defer(t, `guardião em andamento (${guardRunning.id}): aguarde o veredito`); continue; }
    if (busy.has(t.agent)) { defer(t, `@${t.agent} já tem tarefa em andamento`); continue; }
    if (wave[0]?.exclusive) { defer(t, `a onda é do guardião (${wave[0].id}), que roda sozinho`); continue; }
    if (exclusive && (wave.length || running.length)) { defer(t, `papel '${r.role}' roda sozinho: espere a onda atual`); continue; }
    if (wave.some((w) => w.agent === t.agent)) { defer(t, `um @${t.agent} por onda`); continue; }
    if (wave.length >= max) { defer(t, `limite de ${max} tarefa(s) por onda`); continue; }
    wave.push({ id: t.id, spec: t.spec, agent: t.agent, role: r.role, model: r.model, effort: r.effort, exclusive, title: t.title });
  }
  return { id: nextWaveId(p.log), max, wave, deferred, running: running.map(({ exclusive: _e, ...x }) => x) };
}
