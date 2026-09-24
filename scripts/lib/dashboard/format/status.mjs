// Saída legível de `sdd status`: resumo rápido e determinístico do snapshot. Só apresentação —
// nenhum cálculo aqui. `verbose` acrescenta specs, agentes, razões e a origem de cada métrica.
import { createTheme, padEnd, frac, duration } from '../tui/text.mjs';

const DIM_LABEL = { implementation: 'Implementação', requirements: 'Requisitos', tests: 'Testes', security: 'Segurança', documentation: 'Documentação' };

/** @param {import('../types.mjs').DashboardSnapshot} s */
export function formatStatus(s, { color = false, ascii = false, verbose = false } = {}) {
  const t = createTheme({ color, ascii });
  const L = [];
  const row = (k, v) => L.push(`${padEnd(k, 16)} ${v}`);
  L.push(t.bold(`SDD KIT${s.demo ? `  ${t.inverse(t.yellow(' DEMO DATA — dados sintéticos '))}` : ''}`));
  L.push(`Projeto: ${t.bold(s.project.name)}`);
  L.push(`Branch:  ${s.git.available ? `${s.git.branch ?? '?'}${s.git.head ? ` @ ${s.git.head}` : ''} · ${s.git.dirty ? t.yellow(`${s.git.changed} alteração(ões)`) : 'limpo'}` : t.gray(`indisponível (${s.git.reason})`)}`);
  if (s.session) L.push(`Sessão:  ${s.session.id} · ${s.session.status === 'active' ? `ativa há ${duration(s.session.durationMs)}` : `${s.session.status}${s.session.durationMs !== null ? ` (${duration(s.session.durationMs)})` : ''}`}`);
  L.push('');

  const d = s.progress.dimensions;
  const tb = s.counts.tasksByStatus;
  const activeAgents = s.agents.filter((a) => ['working', 'assigned'].includes(a.status)).length;
  row('Saúde', t.status(s.health.status));
  row('Progresso', s.progress.overall.percent === null ? t.gray(`n/d — ${s.progress.overall.note ?? 'sem dados'}`) : t.bar(s.progress.overall.percent, 20));
  row('Requisitos', d.requirements.available ? `${frac(s.counts.requirementsVerified, s.counts.requirements)} verificados pelo guardião${d.requirements.note ? t.gray(` — ${d.requirements.note}`) : ''}` : t.gray(d.requirements.note));
  row('Tarefas', s.counts.tasks ? `${frac(tb.completed ?? 0, s.counts.tasks - (tb.cancelled ?? 0))} concluídas${tb.in_progress ? ` · ${tb.in_progress} em andamento` : ''}${tb.blocked ? ` · ${t.red(`${tb.blocked} bloqueada(s)`)}` : ''}${s.counts.tasksReady ? ` · ${s.counts.tasksReady} pronta(s)` : ''}` : t.gray('nenhuma'));
  row('Agentes ativos', `${activeAgents} / ${s.agents.length}`);
  const q = s.quality;
  row('Testes', q.totals ? `${frac(q.totals.passed, q.totals.total)} casos · ${frac(q.specsPassing, q.specs.length)} specs verdes${q.partialSuites ? t.gray(` · ${q.partialSuites} suíte(s) com contagem parcial, fora do total`) : ''}` : q.specsWithTests ? `${frac(q.specsPassing, q.specs.length)} specs com a última suíte verde${q.specsFailing ? t.red(` · ${q.specsFailing} falhando`) : ''}` : t.gray('nenhuma execução registrada'));
  const f = s.security.findings;
  const scansRan = s.security.scans.filter((x) => x.counts).length;
  row('Segurança', `${f.critical ? t.red(`${f.critical} crítico(s)`) : `${f.critical} crítico`} · ${s.security.policy.deny} bloqueio(s) de política · sandbox ${s.security.guards.sandbox.status}${scansRan ? '' : t.gray(' · scans não executados')}`);
  row('Gate atual', s.gates.current ? `${s.gates.current.stage} (${s.gates.current.spec})` : s.specs.length ? t.green('todas as specs entregues') : t.gray('—'));
  row('Entrega', t.status(s.delivery.status));
  if (s.delivery.reasons.length && s.delivery.status !== 'READY') L.push(`${' '.repeat(17)}${t.gray(s.delivery.reasons[0])}`);
  if (s.health.reasons.length && s.health.status !== 'HEALTHY') {
    L.push('');
    L.push(t.bold('Por quê'));
    for (const r of s.health.reasons.slice(0, verbose ? 50 : 4)) L.push(`  ${t.icon(r.level === 'attention' ? 'ATTENTION' : r.level === 'unknown' ? 'UNKNOWN' : r.level.toUpperCase())} ${r.message}`);
    if (!verbose && s.health.reasons.length > 4) L.push(t.gray(`  … +${s.health.reasons.length - 4} (use --verbose)`));
  }

  if (verbose) {
    L.push('', t.bold('Progresso por dimensão'), t.gray(`  ${s.progress.overall.formula}`));
    for (const [k, m] of Object.entries(d)) L.push(`  ${padEnd(DIM_LABEL[k], 14)} ${t.bar(m.percent, 16)}  ${padEnd(m.available ? frac(m.done, m.total) : '—', 8)} ${t.gray(`peso ${s.progress.overall.weights[k]} · ${m.available ? m.source : m.note}`)}`);
    for (const p of s.progress.byPipeline) L.push(`  ${padEnd(`pipeline ${p.name}`, 14)} ${t.bar(p.percent, 16)}  ${frac(p.done, p.total)}`);
    if (s.specs.length) {
      L.push('', t.bold('Specs'));
      for (const x of s.specs) L.push(`  ${padEnd(x.id, 16)} ${padEnd(t.status(x.state ?? 'unknown', x.state ?? 'sem estado'), 16)} ${padEnd(`gate ${x.currentGate ?? 'OK'}`, 14)} req ${padEnd(frac(x.coverage.done, x.coverage.total), 6)} tarefas ${frac(x.tasks.done, x.tasks.total)}  ${t.gray(x.title ?? '')}`);
    }
    L.push('', t.bold('Gates'));
    L.push(`  ${s.gates.pipeline.map((p) => `${t.icon(p.status)} ${p.name}`).join(` ${t.gray(t.sym.arrow)} `)}`);
    const shown = s.agents.filter((a) => a.status !== 'idle' || a.health.status !== 'UNKNOWN');
    if (shown.length) {
      L.push('', t.bold('Agentes'));
      for (const a of shown) L.push(`  ${padEnd(a.name, 28)} ${padEnd(t.status(a.status), 12)} ${padEnd(a.currentTask?.id ?? '-', 16)} ${padEnd(a.model ?? '-', 8)} ${t.status(a.health.status)}`);
    }
    L.push('', t.bold('Segurança'));
    for (const x of s.security.scans) L.push(`  ${padEnd(x.name, 32)} ${t.status(x.status)}  ${t.gray(x.detail ?? '')}`);
    L.push(`  ${padEnd('Hooks', 32)} ${t.status(s.security.guards.hooks.status)}  ${t.gray(s.security.guards.hooks.detail)}`);
    const a = s.autonomy;
    L.push('', t.bold('Autonomia'), `  ${a.available ? `${a.percent}% (${a.autoApproved}/${a.actions} ações sem intervenção · ${a.humanApprovals} confirmação(ões) · ${a.policyBlocked} bloqueio(s))` : 'sem ações observadas'}`, t.gray(`  ${a.formula} · fonte: ${a.source}`));
    L.push('', t.bold('Estado'), `  ${s.state.events} evento(s) de domínio · ${s.events.total} observado(s) · ${s.state.anomalies} anomalia(s) · ${s.state.invalidDomainLines + s.state.invalidTraceLines} linha(s) inválida(s)${s.state.truncatedTail ? t.red(' · log truncado') : ''}`);
    if (s.warnings.length) { L.push('', t.bold('Avisos')); for (const w of s.warnings) L.push(`  ${t.icon('warn')} ${w}`); }
  }
  return L.join('\n');
}
