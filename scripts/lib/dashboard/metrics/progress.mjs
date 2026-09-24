// Progress Engine — progresso por dados estruturados, nunca por estimativa.
//
//   implementation = Σ peso(tarefas concluídas) / Σ peso(tarefas não canceladas)
//   requirements   = requisitos (RF/RNF/CA) de specs aprovadas pelo guardião / requisitos das specs ativas
//                    (sem estado = 0 verificados: nenhuma aprovação foi registrada)
//   tests          = specs ativas cuja última suíte passou / specs ativas (sem execução = 0 de N)
//   security       = checagens de segurança aprovadas / checagens executadas (sem checagem → n/a)
//   documentation  = média da completude documental das specs (frontmatter coerente, plano, tarefas)
//   overall        = Σ wᵢ·pᵢ / Σ wᵢ, só sobre as dimensões disponíveis (pesos renormalizados);
//                    sem tarefas (implementation indisponível) não há overall: segurança e
//                    documentação sozinhas não dizem quanto do trabalho foi feito
import { DIMENSIONS } from '../defaults.mjs';

export const OVERALL_FORMULA = 'overall = Σ(peso × %) / Σ(peso), só sobre as dimensões disponíveis; exige implementation (tarefas)';

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 1000) / 10 : null);

/** @returns {import('../types.mjs').Metric} */
export function metric(done, total, source, note) {
  return { percent: pct(done, total), done, total, available: total > 0, source, ...(note ? { note } : {}) };
}

export function unavailable(source, note) {
  return { percent: null, done: 0, total: 0, available: false, source, note };
}

/** Peso de cada tarefa: `pesos:` (ou `weights:`) no frontmatter do arquivo de tarefas; padrão 1. */
export function taskWeights(taskFiles) {
  const weights = new Map();
  const warnings = [];
  for (const f of taskFiles) {
    const map = f.fm?.pesos ?? f.fm?.weights;
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const [k, v] of Object.entries(map)) {
      const id = k.includes('/') ? k : `${f.spec}/${k}`;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) { warnings.push(`${f.file}: peso inválido para ${k} (${JSON.stringify(v)}) — usando 1`); continue; }
      weights.set(id, n);
    }
  }
  return { weights, warnings };
}

export function implementationProgress(tasks) {
  const live = tasks.filter((t) => t.status !== 'cancelled');
  const total = live.reduce((s, t) => s + t.weight, 0);
  const done = live.filter((t) => t.status === 'completed').reduce((s, t) => s + t.weight, 0);
  return total ? metric(done, total, 'specs/tasks/*.md + .sdd/events.jsonl (status efetivo; peso: frontmatter `pesos`, padrão 1)') : unavailable('specs/tasks/*.md', 'nenhuma tarefa no grafo');
}

export function requirementsProgress(specs, hasState) {
  const active = specs.filter((s) => s.id && s.state !== 'archived');
  const reqs = active.flatMap((s) => s.requirements);
  if (!reqs.length) return unavailable('specs (RF-/RNF-/CA- numerados)', 'nenhum requisito numerado nas specs');
  // Sem estado não há GUARDIAN_APPROVED registrado: 0 verificados é fato, não estimativa.
  if (!hasState) return metric(0, reqs.length, '.sdd/events.jsonl', 'sem estado estruturado: nenhuma aprovação registrada (rode `sdd tasks sync`)');
  return metric(reqs.filter((r) => r.status === 'verified').length, reqs.length, 'requisitos das specs × GUARDIAN_APPROVED (evidência por CA)');
}

export function testsProgress(quality, activeSpecs) {
  if (!activeSpecs) return unavailable('.sdd/events.jsonl (TEST_*)', 'nenhuma spec ativa');
  if (!quality.specsWithTests) return metric(0, activeSpecs, '.sdd/events.jsonl (TEST_*)', 'nenhuma execução de teste registrada');
  return metric(quality.specsPassing, activeSpecs, 'último TEST_PASSED/TEST_FAILED por spec (.sdd/events.jsonl)');
}

export function securityProgress(security) {
  const ran = security.scans.filter((s) => s.counts && ['PASS', 'WARN', 'FAIL'].includes(s.status));
  if (!ran.length) return unavailable('scans e gates de segurança', 'nenhuma checagem de segurança executada');
  return metric(ran.filter((s) => s.status !== 'FAIL').length, ran.length, `checagens de segurança executadas (${ran.map((s) => s.id).join(', ')})`);
}

export function documentationProgress(specs) {
  const active = specs.filter((s) => s.id && s.state !== 'archived');
  if (!active.length) return unavailable('specs/', 'nenhuma spec');
  const score = active.reduce((s, x) => s + x.docScore, 0);
  return { ...metric(score, active.length, 'specs: frontmatter coerente (cas = CAs), plano e arquivo de tarefas'), done: Math.round(score * 100) / 100 };
}

/** Overall ponderado, só sobre dimensões disponíveis. */
export function overallProgress(dimensions, weights) {
  if (!dimensions.implementation?.available) return { percent: null, weights: { ...weights }, used: [], formula: OVERALL_FORMULA, note: 'sem tarefas no grafo: progresso geral indisponível' };
  const used = DIMENSIONS.filter((d) => dimensions[d]?.available && weights[d] > 0);
  const wsum = used.reduce((s, d) => s + weights[d], 0);
  const percent = wsum > 0 ? Math.round((used.reduce((s, d) => s + weights[d] * dimensions[d].percent, 0) / wsum) * 10) / 10 : null;
  return { percent, weights: { ...weights }, used, formula: OVERALL_FORMULA };
}

export function progressByPipeline(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    if (t.status === 'cancelled') continue;
    const k = t.pipeline ?? '(sem pipeline)';
    const g = groups.get(k) ?? { name: k, done: 0, total: 0 };
    g.total += t.weight;
    if (t.status === 'completed') g.done += t.weight;
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ ...g, percent: pct(g.done, g.total) })).sort((a, b) => a.name.localeCompare(b.name));
}
