// Gates por spec e prontidão de entrega — derivados só do estado (eventos) e das definições.
//
// Pipeline de gates de uma spec (adaptado ao modelo real do kit, ADR-0004):
//   SPEC → CODE → TEST → GATES → GUARDIAN → DELIVERY
//   SPEC      spec no estado (SPEC_CREATED) com plano (PLAN_CREATED ou arquivo de plano)
//   CODE      tarefas de papel build/design/support/review concluídas (papel: policies/model-routing.json)
//   TEST      tarefas de papel verify concluídas + última suíte da spec verde (TEST_PASSED)
//   GATES     GATE_PASSED/GATE_BLOCKED da spec (ou globais) + portões de engenharia `blocking` da config
//   GUARDIAN  GUARDIAN_APPROVED (com evidência); reprovado = GUARDIAN_REJECTED ainda não refeito
//   DELIVERY  SPEC_IMPLEMENTED
// Etapa sem evidência registrada, mas com uma etapa posterior aprovada, aparece como `skipped`
// ("não observado") — nunca como aprovada.

export const STAGES = ['SPEC', 'CODE', 'TEST', 'GATES', 'GUARDIAN', 'DELIVERY'];
const DONE = new Set(['passed', 'skipped']);
const minTs = (xs) => xs.filter(Boolean).sort()[0] ?? null;
const maxTs = (xs) => xs.filter(Boolean).sort().pop() ?? null;

/** Portões de engenharia `enabled` + `blocking` da config = gates obrigatórios. */
export function requiredGates(config) {
  return Object.entries(config?.engineering_gates ?? {}).filter(([, g]) => g && g.enabled && g.blocking).map(([k]) => k);
}

function taskStage(name, tasks, emptyStatus = 'skipped') {
  const live = tasks.filter((t) => t.status !== 'cancelled');
  const checks = live.map((t) => ({ name: t.id, status: t.status, detail: `@${t.agent} · ${t.title}` }));
  const started = minTs(live.map((t) => t.startedAt));
  if (!live.length) return { name, status: emptyStatus, startedAt: null, completedAt: null, checks, blockingReason: null, evidence: [] };
  const blocked = live.filter((t) => t.status === 'blocked');
  const allDone = live.every((t) => t.status === 'completed');
  const any = live.some((t) => ['in_progress', 'completed'].includes(t.status));
  return {
    name,
    status: blocked.length ? 'blocked' : allDone ? 'passed' : any ? 'running' : 'pending',
    startedAt: started,
    completedAt: allDone ? maxTs(live.map((t) => t.completedAt)) : null,
    checks,
    blockingReason: blocked.length ? blocked.map((t) => `${t.id}: ${t.blockedReason ?? 'sem motivo'}`).join('; ') : null,
    evidence: live.flatMap((t) => (t.evidence ? [].concat(t.evidence).map(String) : [])),
  };
}

/**
 * @param ctx { spec, st (state.specs[id]), tasks (TaskRuntimeState da spec), lastTest (state.tests.by_spec[id]),
 *              suites (Map suite → registro do índice), gates (entradas de state.gates), required (nomes), hasPlan }
 * @returns {import('../types.mjs').GateState[]}
 */
export function specGates({ spec, st, tasks, lastTest, suites, gates, required, hasPlan }) {
  const out = [];
  out.push({
    name: 'SPEC',
    status: st && (st.plan || hasPlan) ? 'passed' : st ? 'running' : 'pending',
    startedAt: st?.created ?? null,
    completedAt: null,
    checks: [
      { name: 'SPEC_CREATED', status: st ? 'passed' : 'pending', detail: spec.file },
      { name: 'plano', status: st?.plan || hasPlan ? 'passed' : 'pending', detail: st?.plan ? 'PLAN_CREATED' : hasPlan ? 'arquivo de plano' : 'sem plano' },
      { name: 'tarefas', status: tasks.length ? 'passed' : 'pending', detail: `${tasks.length} tarefa(s)` },
    ],
    blockingReason: null,
    evidence: [spec.file],
  });

  out.push(taskStage('CODE', tasks.filter((t) => !['audit', 'verify'].includes(t.role))));

  const verify = taskStage('TEST', tasks.filter((t) => t.role === 'verify'), 'pending');
  const testChecks = [...(suites?.entries() ?? [])].map(([suite, r]) => ({ name: `suíte ${suite}`, status: r.result, detail: [r.command, r.total !== null || r.passed !== null ? `${r.passed ?? '?'}/${r.total ?? (r.passed ?? 0) + (r.failed ?? 0)} ok` : null].filter(Boolean).join(' · ') }));
  let testStatus = verify.status;
  if (lastTest?.result === 'failed') testStatus = 'failed';
  else if (lastTest?.result === 'running') testStatus = 'running';
  else if (lastTest?.result === 'passed') testStatus = verify.checks.length && verify.status !== 'passed' ? (verify.status === 'blocked' ? 'blocked' : 'running') : 'passed';
  else if (verify.status === 'passed' || verify.status === 'skipped') testStatus = 'pending';
  out.push({
    ...verify,
    status: testStatus,
    completedAt: testStatus === 'passed' ? lastTest?.ts ?? verify.completedAt : null,
    checks: [...verify.checks, ...testChecks, ...(lastTest ? [] : [{ name: 'suíte', status: 'pending', detail: 'nenhum TEST_* registrado' }])],
    blockingReason: testStatus === 'failed' ? `último teste falhou (${lastTest?.command ?? 'sem comando registrado'})` : verify.blockingReason,
    evidence: [...verify.evidence, ...(lastTest?.command ? [lastTest.command] : [])],
  });

  const relevant = gates.filter((g) => g.spec === spec.id || g.spec === null);
  const checks = [];
  // Um gate pode ter entrada da spec e global: bloqueio em qualquer uma bloqueia (como no
  // SPEC_IMPLEMENTED); senão vale a da spec, depois a global.
  const pick = (name) => {
    const all = relevant.filter((x) => x.gate === name);
    return all.find((x) => x.status === 'blocked') ?? all.find((x) => x.spec === spec.id) ?? all[0] ?? null;
  };
  const names = [...new Set([...required, ...relevant.map((g) => g.gate)])];
  for (const name of names) {
    const g = pick(name);
    const scope = g ? (g.spec ? '' : ' (global)') : '';
    if (g) checks.push({ name, status: g.status, detail: `${g.reason ?? g.ts}${scope}` });
    else checks.push({ name, status: 'not_run', detail: 'obrigatório (engineering_gates.blocking) — sem GATE_PASSED' });
  }
  const blockedG = checks.filter((c) => c.status === 'blocked');
  out.push({
    name: 'GATES',
    status: !checks.length ? 'skipped' : blockedG.length ? 'blocked' : checks.every((c) => c.status === 'passed') ? 'passed' : 'pending',
    startedAt: minTs(relevant.map((g) => g.ts)),
    completedAt: checks.length && checks.every((c) => c.status === 'passed') ? maxTs(relevant.map((g) => g.ts)) : null,
    checks,
    blockingReason: blockedG.length ? blockedG.map((c) => `${c.name}: ${c.detail}`).join('; ') : null,
    evidence: relevant.map((g) => `${g.gate} ${g.status} ${g.ts}`),
  });

  const status = st?.status;
  const approved = ['approved', 'implemented'].includes(status);
  const rejected = !approved && (st?.rejections ?? 0) > 0 && status === 'in_progress';
  out.push({
    name: 'GUARDIAN',
    status: approved ? 'passed' : status === 'in_review' ? 'running' : rejected ? 'failed' : 'pending',
    startedAt: st?.review_started ?? null,
    completedAt: approved ? st?.approved ?? null : null,
    checks: [
      { name: 'GUARDIAN_APPROVED', status: approved ? 'passed' : 'pending', detail: approved ? 'com evidência' : status === 'in_review' ? 'em revisão' : '—' },
      ...((st?.rejections ?? 0) ? [{ name: 'reprovações', status: rejected ? 'failed' : 'passed', detail: `${st.rejections}× — última: ${st.last_rejection ?? '?'}` }] : []),
    ],
    blockingReason: rejected ? `reprovada ${st.rejections}×: ${st.last_rejection ?? 'sem motivo'}` : null,
    evidence: approved && st?.approval_evidence ? [].concat(st.approval_evidence).map(String) : [],
  });

  const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status)).map((t) => t.id);
  const why = [];
  if (!approved) why.push('sem GUARDIAN_APPROVED');
  if (open.length) why.push(`${open.length} tarefa(s) aberta(s)`);
  if (lastTest?.result === 'failed') why.push('último teste falhou');
  if (blockedG.length) why.push(`gate(s) bloqueado(s): ${blockedG.map((c) => c.name).join(', ')}`);
  out.push({
    name: 'DELIVERY',
    status: status === 'implemented' ? 'passed' : status === 'archived' ? 'skipped' : 'pending',
    startedAt: null,
    completedAt: st?.implemented ?? null,
    checks: [{ name: 'SPEC_IMPLEMENTED', status: status === 'implemented' ? 'passed' : 'pending', detail: status === 'implemented' ? st.implemented : why.join('; ') || 'pronta para SPEC_IMPLEMENTED' }],
    blockingReason: status === 'implemented' ? null : why.join('; ') || null,
    evidence: [],
  });

  // Etapa pendente sem evidência antes de uma etapa já aprovada: "não observada".
  const lastPassed = out.map((g) => g.status).lastIndexOf('passed');
  for (let i = 0; i < lastPassed; i++) if (out[i].status === 'pending') out[i] = { ...out[i], status: 'skipped', blockingReason: null, checks: [...out[i].checks, { name: 'observação', status: 'skipped', detail: 'sem evidência registrada; etapa posterior já aprovada' }] };
  return out;
}

export function currentStage(gates) {
  return gates.find((g) => !DONE.has(g.status))?.name ?? null;
}

/** Status agregado de cada etapa sobre as specs ativas + etapa atual do projeto. */
export function projectPipeline(specs) {
  const active = specs.filter((s) => s.id && s.state !== 'archived' && s.gates?.length);
  const pipeline = STAGES.map((name, i) => {
    const sts = active.map((s) => s.gates[i].status);
    let status = 'pending';
    if (!sts.length) status = 'pending';
    else if (sts.includes('failed')) status = 'failed';
    else if (sts.includes('blocked')) status = 'blocked';
    else if (sts.every((x) => DONE.has(x))) status = sts.every((x) => x === 'skipped') ? 'skipped' : 'passed';
    else if (sts.some((x) => x === 'running' || DONE.has(x))) status = 'running';
    return { name, status, specs: sts.length };
  });
  let current = null;
  for (const s of active) {
    const stage = currentStage(s.gates);
    if (!stage) continue;
    const idx = STAGES.indexOf(stage);
    if (!current || idx < STAGES.indexOf(current.stage)) current = { stage, spec: s.id };
  }
  return { stages: STAGES, pipeline, current };
}

/**
 * Prontidão de entrega do projeto. BLOCKED = há impedimento que exige ação (gate bloqueado, teste
 * falhando, tarefa bloqueada, log truncado, achado crítico); READY = toda spec ativa implementada.
 */
export function deliveryReadiness({ specs, tasks, state, hasState, truncated, criticalSecurity, pipeline }) {
  const active = specs.filter((s) => s.id && s.state !== 'archived');
  const checks = [
    ['Implementação', 'CODE'], ['Testes', 'TEST'], ['Gates', 'GATES'], ['Guardião', 'GUARDIAN'], ['Entrega', 'DELIVERY'],
  ].map(([label, stage]) => {
    const p = pipeline.pipeline.find((x) => x.name === stage);
    return { name: label, status: p?.status ?? 'pending', detail: `${stage} em ${p?.specs ?? 0} spec(s)` };
  });
  if (!active.length) return { status: 'UNKNOWN', reasons: ['nenhuma spec ativa'], checks };
  if (!hasState) return { status: 'UNKNOWN', reasons: ['sem estado estruturado (.sdd/events.jsonl vazio) — rode `sdd tasks sync`'], checks };
  const blockers = [];
  if (truncated) blockers.push('.sdd/events.jsonl termina numa linha truncada — `sdd state repair`');
  const blockedGates = Object.values(state.gates ?? {}).filter((g) => g.status === 'blocked');
  if (blockedGates.length) blockers.push(`gate(s) bloqueado(s): ${blockedGates.map((g) => `${g.gate}${g.spec ? `@${g.spec}` : ''}`).join(', ')}`);
  const failing = active.filter((s) => state.tests?.by_spec?.[s.id]?.result === 'failed');
  if (failing.length) blockers.push(`teste falhando em ${failing.map((s) => s.id).join(', ')}`);
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');
  if (blockedTasks.length) blockers.push(`${blockedTasks.length} tarefa(s) bloqueada(s): ${blockedTasks.slice(0, 3).map((t) => t.id).join(', ')}${blockedTasks.length > 3 ? '…' : ''}`);
  if (criticalSecurity > 0) blockers.push(`${criticalSecurity} achado(s) crítico(s) de segurança`);
  if (blockers.length) return { status: 'BLOCKED', reasons: blockers, checks };
  const pending = active.filter((s) => s.state !== 'implemented');
  if (!pending.length) return { status: 'READY', reasons: [`${active.length} spec(s) implementada(s) com GUARDIAN_APPROVED`], checks };
  const reasons = [`${pending.length} spec(s) sem SPEC_IMPLEMENTED: ${pending.slice(0, 5).map((s) => `${s.id} (${s.currentGate ?? '?'})`).join(', ')}${pending.length > 5 ? '…' : ''}`];
  const open = tasks.filter((t) => ['pending', 'in_progress'].includes(t.status));
  if (open.length) reasons.push(`${open.length} tarefa(s) aberta(s)`);
  return { status: 'NOT_READY', reasons, checks };
}
