// Health Engine — saúde do projeto e de cada agente por regras objetivas e limiares configuráveis
// (`dashboard.health` da config). Nenhum julgamento de modelo: cada razão cita o número que a gerou.
//
//   BLOCKED   há impedimento que exige ação humana
//   DEGRADED  algo quebrou (teste, grafo, estado, falhas repetidas)
//   ATTENTION sinal de risco (bloqueio de tarefa, política negou, retries, contexto alto)
//   HEALTHY   nenhuma regra disparou
//   UNKNOWN   não há dados para avaliar

const RANK = { HEALTHY: 0, ATTENTION: 1, DEGRADED: 2, BLOCKED: 3 };
const LEVEL_STATUS = { attention: 'ATTENTION', degraded: 'DEGRADED', blocked: 'BLOCKED' };

function verdict(reasons, unknown = false) {
  if (unknown && !reasons.length) return { status: 'UNKNOWN', reasons: [{ level: 'unknown', message: 'sem dados observados', source: '—' }] };
  let status = 'HEALTHY';
  for (const r of reasons) {
    const s = LEVEL_STATUS[r.level];
    if (s && RANK[s] > RANK[status]) status = s;
  }
  const order = { blocked: 0, degraded: 1, attention: 2 };
  return { status, reasons: [...reasons].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9)) };
}

/**
 * @param s sinais do agente: { observed, metrics, context, blockedTasks, failingTest, rejections,
 *          taskMinutes, staleMinutes }
 * @param th limiares (dashboard.health)
 * @returns {import('../types.mjs').AgentHealth}
 */
export function agentHealth(s, th) {
  const R = [];
  const add = (level, message, source) => R.push({ level, message, source });
  const m = s.metrics;
  if (s.blockedTasks?.length) add('blocked', `tarefa bloqueada: ${s.blockedTasks.join(', ')}`, 'TASK_BLOCKED');
  if (m.retries >= th.retry_critical) add('degraded', `${m.retries} retries (≥ ${th.retry_critical})`, 'TASK_STARTED repetido');
  else if (m.retries >= th.retry_warning) add('attention', `${m.retries} retries (≥ ${th.retry_warning})`, 'TASK_STARTED repetido');
  if (m.toolFailures >= th.tool_failure_critical) add('degraded', `${m.toolFailures} falhas de ferramenta (≥ ${th.tool_failure_critical})`, 'trace tool.completed status=error');
  else if (m.toolFailures >= th.tool_failure_warning) add('attention', `${m.toolFailures} falhas de ferramenta (≥ ${th.tool_failure_warning})`, 'trace tool.completed status=error');
  if (m.policyBlocks >= th.policy_block_critical) add('degraded', `${m.policyBlocks} bloqueios de política (≥ ${th.policy_block_critical})`, 'trace policy.decision=deny');
  else if (m.policyBlocks >= th.policy_block_warning) add('attention', `${m.policyBlocks} bloqueio(s) de política`, 'trace policy.decision=deny');
  if (m.maxRepeat >= th.loop_repeat) add('degraded', `possível loop: ${m.maxRepeat} chamadas idênticas seguidas (≥ ${th.loop_repeat})`, 'trace (ferramenta + alvo repetidos)');
  if (s.context?.available) {
    if (s.context.percent >= th.context_critical) add('degraded', `contexto em ${s.context.percent}% (≥ ${th.context_critical}%)`, s.context.source);
    else if (s.context.percent >= th.context_warning) add('attention', `contexto em ${s.context.percent}% (≥ ${th.context_warning}%)`, s.context.source);
  }
  if (s.failingTest) add('degraded', `último teste da spec ${s.failingTest} falhou`, 'TEST_FAILED');
  if (s.rejections) add('attention', `spec reprovada ${s.rejections}× pelo guardião`, 'GUARDIAN_REJECTED');
  if (s.taskMinutes !== null && s.taskMinutes >= th.task_minutes_warning) add('attention', `tarefa em andamento há ${Math.round(s.taskMinutes)} min (≥ ${th.task_minutes_warning})`, 'TASK_STARTED');
  if (s.staleMinutes !== null) add('attention', `subagente sem atividade há ${Math.round(s.staleMinutes)} min (sessão interrompida?)`, 'trace agent.spawned sem agent.stopped');
  return verdict(R, !s.observed);
}

/**
 * @param s sinais do projeto (ver buildSnapshot)
 * @param th limiares
 * @returns {import('../types.mjs').ProjectHealth}
 */
export function projectHealth(s, th) {
  if (!s.isSddProject) return { status: 'UNKNOWN', reasons: [{ level: 'unknown', message: 'não é um projeto SDD (sem sdd.config.yaml, specs/ ou .sdd/) — rode /sdd-init', source: 'raiz do projeto' }] };
  const R = [];
  const add = (level, message, source) => R.push({ level, message, source });
  const sec = th.critical_security === 'degraded' ? 'degraded' : 'blocked';
  const gate = th.gate_failure === 'degraded' ? 'degraded' : 'blocked';
  if (s.truncated) add('blocked', '.sdd/events.jsonl termina numa linha truncada — novas gravações recusadas até `sdd state repair`', '.sdd/events.jsonl');
  if (s.blockedGates.length) add(gate, `gate(s) bloqueado(s): ${s.blockedGates.join(', ')}`, 'GATE_BLOCKED');
  if (s.criticalSecurity > 0) add(sec, `${s.criticalSecurity} achado(s) crítico(s) de segurança`, 'doctor --security');
  if (s.configErrors) add('degraded', `config inválida (${s.configErrors} erro[s]) — \`sdd config validate\``, 'sdd.config.yaml');
  if (s.graphErrors) add('degraded', `grafo de tarefas/specs com ${s.graphErrors} erro(s) — \`sdd doctor --fast\``, 'specs/tasks');
  if (s.anomalies) add('degraded', `${s.anomalies} evento(s) rejeitado(s) na reexecução do log — \`sdd state verify\``, '.sdd/events.jsonl');
  if (s.failingTests.length) add('degraded', `teste falhando em ${s.failingTests.join(', ')}`, 'TEST_FAILED');
  if (s.blockedTasks >= th.blocked_tasks_degraded) add('degraded', `${s.blockedTasks} tarefas bloqueadas (≥ ${th.blocked_tasks_degraded})`, 'TASK_BLOCKED');
  else if (s.blockedTasks) add('attention', `${s.blockedTasks} tarefa(s) bloqueada(s)`, 'TASK_BLOCKED');
  // Sinais do agente que o projeto já avalia com as próprias regras e limiares (tarefa bloqueada,
  // teste falhando, política, reprovação) não sobem de novo — senão uma única tarefa bloqueada
  // tornaria o projeto DEGRADED e o limiar `blocked_tasks_degraded` não teria efeito.
  const COVERED = new Set(['TASK_BLOCKED', 'TEST_FAILED', 'trace policy.decision=deny', 'GUARDIAN_REJECTED']);
  for (const a of s.agents) {
    const own = a.health.reasons.filter((r) => !COVERED.has(r.source) && r.level !== 'unknown');
    if (!own.length) continue;
    const worst = own.some((r) => r.level === 'degraded' || r.level === 'blocked') ? 'degraded' : 'attention';
    add(worst, `agente ${a.name}: ${own[0].message}`, 'Agent Health Engine');
  }
  if (s.policyDeny >= th.policy_block_warning) add('attention', `${s.policyDeny} ação(ões) negada(s) pela política`, 'trace policy.decision=deny');
  if (s.rejected.length) add('attention', `spec(s) reprovada(s) pelo guardião aguardando correção: ${s.rejected.join(', ')}`, 'GUARDIAN_REJECTED');
  if (s.drift) add('attention', `${s.drift} checkbox(es) divergem do estado — \`sdd tasks sync\``, 'specs/tasks × estado');
  if (s.invalidLines) add('attention', `${s.invalidLines} linha(s) inválida(s) nos logs (ignoradas)`, '.sdd/*.jsonl');
  if (s.noState) add('attention', 'specs sem estado estruturado (.sdd/events.jsonl vazio) — rode `sdd tasks sync`', '.sdd/events.jsonl');
  if (s.configWarnings) add('attention', `${s.configWarnings} aviso(s) de configuração do dashboard`, 'dashboard (config)');
  return verdict(R);
}
