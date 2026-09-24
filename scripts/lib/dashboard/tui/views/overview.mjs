// Tela 1 — Overview: "o que está acontecendo neste projeto?" em poucos segundos. Só o essencial:
// implementação, requisitos, tarefas, agentes ativos, qualidade, gate atual, entrega e saúde.
// Os detalhes ficam nas outras telas.
import { padEnd, truncate, columns, duration, frac } from '../text.mjs';
import { section, kv, shortAgent, eventLine } from './common.mjs';

const DIM = [['implementation', 'Implementação'], ['requirements', 'Requisitos'], ['tests', 'Testes'], ['security', 'Segurança'], ['documentation', 'Documentação']];

function projectBlock(t, s) {
  const tb = s.counts.tasksByStatus;
  const bySpec = Object.entries(s.counts.specsByStatus).map(([k, v]) => `${v} ${k}`).join(', ');
  return [
    kv(t, 'Specs', `${s.counts.specs}${bySpec ? t.gray(`  (${bySpec})`) : ''}`, 14),
    kv(t, 'ADRs', String(s.counts.adrs), 14),
    kv(t, 'Requisitos', `${frac(s.counts.requirementsVerified, s.counts.requirements)} verificados`, 14),
    kv(t, 'Tarefas', String(s.counts.tasks), 14),
    kv(t, 'Concluídas', t.green(String(tb.completed ?? 0)), 14),
    kv(t, 'Em andamento', t.cyan(String(tb.in_progress ?? 0)), 14),
    kv(t, 'Bloqueadas', (tb.blocked ?? 0) ? t.red(String(tb.blocked)) : '0', 14),
    kv(t, 'Prontas', String(s.counts.tasksReady), 14),
  ];
}

function progressBlock(t, s, barW) {
  const L = [kv(t, 'Geral', s.progress.overall.percent === null ? t.gray(`n/d (${s.progress.overall.note ?? 'sem dados'})`) : t.bar(s.progress.overall.percent, barW), 14)];
  for (const [k, label] of DIM) L.push(kv(t, label, t.bar(s.progress.dimensions[k].percent, barW), 14));
  for (const p of s.progress.byPipeline.slice(0, 3)) L.push(kv(t, p.name, t.bar(p.percent, barW), 14));
  return L;
}

function qualityBlock(t, s) {
  const q = s.quality;
  const L = [];
  if (q.suites.length) for (const x of q.suites.slice(0, 4)) L.push(kv(t, x.suite, `${frac(x.passed, x.total)} ${x.failed ? t.red(`${t.sym.failed} ${x.failed} falha(s)`) : t.icon('passed')}${x.coverage !== null ? t.gray(`  cobertura ${x.coverage}%`) : ''}`, 14));
  L.push(kv(t, 'Specs verdes', q.specsWithTests ? `${frac(q.specsPassing, q.specs.length)}${q.specsFailing ? t.red(`  ${q.specsFailing} falhando`) : ''}` : t.gray('nenhum teste registrado'), 14));
  for (const e of q.evals.slice(0, 2)) L.push(kv(t, `evals ${e.suite}`.slice(0, 14), `${frac(e.passed ?? 0, e.total)} ${e.passed === e.total ? t.icon('passed') : t.icon('warn')}`, 14));
  L.push(kv(t, 'Checks falhos', q.failedChecks ? t.red(String(q.failedChecks)) : '0', 14));
  return L;
}

function securityBlock(t, s) {
  const f = s.security.findings;
  const g = s.security.guards;
  return [
    kv(t, 'Críticos', f.critical ? t.red(String(f.critical)) : `0 ${t.icon('passed')}`, 14),
    kv(t, 'Médios', f.medium ? t.yellow(String(f.medium)) : '0', 14),
    kv(t, 'Bloq. política', s.security.policy.deny ? t.yellow(String(s.security.policy.deny)) : '0', 14),
    kv(t, 'Confirmações', String(s.security.policy.ask), 14),
    kv(t, 'Sandbox', t.status(g.sandbox.status), 14),
    kv(t, 'Hooks', t.status(g.hooks.status), 14),
    kv(t, 'Autonomia', s.autonomy.available ? `${s.autonomy.percent}% ${t.gray(`(${s.autonomy.autoApproved}/${s.autonomy.actions})`)}` : t.gray('sem ações'), 14),
  ];
}

export function gateLine(t, s) {
  const names = s.gates.pipeline.map((p) => p.name);
  const cells = names.map((n) => Math.max(n.length, 3));
  const top = names.map((n, i) => padEnd(s.gates.current?.stage === n ? t.bold(n) : n, cells[i])).join(t.gray(` ${t.sym.arrow} `));
  const sep = ' '.repeat(t.sym.arrow.length + 2);
  const bottom = s.gates.pipeline.map((p, i) => padEnd(` ${t.icon(p.status)}`, cells[i])).join(sep);
  return [top, bottom];
}

/** @returns {{ head: string[], rows: object[], tail: string[] }} */
export function overviewView(s, { t, width: W, height: H }) {
  const two = W >= 100;
  const colW = two ? Math.floor((W - 3) / 2) : W;
  const barW = Math.max(8, Math.min(24, colW - 24));
  const L = [];
  const pair = (titleA, a, titleB, b) => {
    if (two) {
      L.push(...columns([[section(t, titleA, colW)], [section(t, titleB, colW)]], [colW, colW], 3));
      L.push(...columns([a, b], [colW, colW], 3));
    } else {
      L.push(section(t, titleA, W), ...a, section(t, titleB, W), ...b);
    }
  };
  pair('PROJETO', projectBlock(t, s), 'PROGRESSO', progressBlock(t, s, barW));

  const active = s.agents.filter((a) => a.status !== 'idle');
  L.push(section(t, 'AGENTES', W, `${s.agents.filter((a) => ['working', 'assigned'].includes(a.status)).length} ativo(s) de ${s.agents.length}`));
  if (!active.length) L.push(t.gray('  nenhum agente com tarefa — todos ociosos'));
  const shownAgents = W >= 100 ? 6 : 4;
  for (const a of active.slice(0, shownAgents)) {
    L.push(truncate(`  ${t.icon(a.status)} ${padEnd(shortAgent(a.name), 18)} ${padEnd(t.status(a.status), 12)} ${padEnd(a.currentTask?.id ?? '-', 16)} ${padEnd(a.currentTask?.title ?? a.statusReason, Math.max(10, W - 74))} ${padEnd(duration(a.runtimeMs), 8)} ${t.icon(a.health.status)}`, W));
  }
  if (active.length > shownAgents) L.push(t.gray(`  … +${active.length - shownAgents} (tecla 2)`));

  L.push(section(t, 'GATE ATUAL', W, s.gates.current ? `${s.gates.current.stage} · ${s.gates.current.spec}` : s.specs.length ? 'todas as specs entregues' : ''));
  L.push(...gateLine(t, s).map((x) => `  ${x}`));
  L.push(`  Entrega: ${t.status(s.delivery.status)}  ${t.gray(truncate(s.delivery.reasons[0] ?? '', Math.max(10, W - 30)))}`);

  pair('QUALIDADE', qualityBlock(t, s), 'SEGURANÇA', securityBlock(t, s));

  const used = L.length;
  const room = Math.max(3, H - used - 1);
  L.push(section(t, 'EVENTOS RECENTES', W, `${s.events.total} observados`));
  const recent = s.events.recent.slice(-room).reverse();
  if (!recent.length) L.push(t.gray('  nenhum evento ainda (.sdd/events.jsonl e .sdd/trace/ vazios)'));
  for (const e of recent) L.push(`  ${eventLine(t, e, W - 2)}`);
  return { head: [], rows: L.map((text) => ({ text, search: false })), tail: [] };
}
