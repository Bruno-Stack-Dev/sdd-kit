// Telas de detalhe (Enter) e a visão "WHY?" (w). Mostram só observabilidade operacional: status,
// tarefa, objetivo atual, ferramentas, permissões, linha do tempo de ações — nunca raciocínio do
// modelo (o kit não o registra). Vínculo ausente aparece como UNKNOWN.
import { padEnd, truncate, duration, clock, frac } from '../text.mjs';
import { section, kv, shortAgent, eventLine, FILTERS } from './common.mjs';
import { whyChain, testsForTask, UNKNOWN } from '../../traceability.mjs';

const wrap = (text, w) => {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > w) { if (line) out.push(line); line = word; } else line = `${line} ${word}`.trim();
    }
    out.push(line);
  }
  return out;
};
const text = (lines) => lines.map((t) => ({ text: t, search: false }));

function agentDetail(s, id, { t, width: W, ui }) {
  const a = s.agents.find((x) => x.name === id);
  if (!a) return { head: [t.red(`agente ${id} não encontrado`)], rows: [], tail: [] };
  const L = [
    section(t, a.name.toUpperCase(), W, a.origin === 'observado' ? 'sem definição em .claude/agents/' : a.file ?? ''),
    kv(t, 'Status', `${t.status(a.status)}  ${t.gray(a.statusReason)}`),
    kv(t, 'Saúde', t.status(a.health.status)),
    ...a.health.reasons.filter((r) => r.level !== 'unknown').map((r) => `${' '.repeat(18)}${t.gray('-')} ${r.message} ${t.gray(`[${r.source}]`)}`),
    kv(t, 'Tarefa atual', a.currentTask ? `${a.currentTask.id}${a.currentTask.wave ? t.gray(` (${a.currentTask.wave})`) : ''}` : '—'),
    kv(t, 'Tempo', duration(a.runtimeMs)),
    kv(t, 'Modelo', a.model ? `${a.model}${a.effort ? ` · ${a.effort}` : ''} ${t.gray(`(${a.modelSource})`)}` : '—'),
    kv(t, 'Contexto', a.context.available ? `${a.context.used} / ${a.context.limit} (${a.context.percent}%)` : t.gray('indisponível — o runtime não informa uso de contexto aos hooks')),
    kv(t, 'Chamadas', String(a.metrics.toolCalls)),
    kv(t, 'Falhas', String(a.metrics.toolFailures)),
    kv(t, 'Arquivos', String(a.metrics.filesTouched)),
    kv(t, 'Retries', String(a.metrics.retries)),
    kv(t, 'Bloqueios', `${a.metrics.policyBlocks} negado(s) · ${a.metrics.policyAsks} confirmação(ões)`),
    kv(t, 'Tarefas', `${a.tasks.completed}/${a.tasks.total} concluídas · ${a.tasks.inProgress} em andamento · ${a.tasks.ready} pronta(s) · ${a.tasks.blocked} bloqueada(s)`),
    section(t, 'PAPEL', W, `${a.role} (${a.roleSource})`),
    ...wrap(a.description || '—', W - 4).map((l) => `  ${l}`),
    section(t, 'OBJETIVO ATUAL', W, 'tarefa + spec — não é raciocínio do modelo'),
    ...wrap(a.instruction ?? 'nenhuma tarefa em andamento', W - 4).map((l) => `  ${l}`),
    section(t, 'FERRAMENTAS', W, 'frontmatter tools'),
    `  ${a.tools.map((x) => `${t.icon('passed')} ${x}`).join('  ') || '—'}`,
    section(t, 'PERMISSÕES', W, 'policies/sdd-policy.json + config'),
    ...a.permissions.map((p) => `  ${t.icon(p.decision)} ${padEnd(p.decision === 'allow' ? 'permite' : p.decision === 'ask' ? 'confirma' : 'nega', 9)} ${p.label} ${t.gray(`[${p.source}]`)}`),
  ];
  const filter = FILTERS.find((x) => x.id === ui.filter) ?? FILTERS[0];
  const tl = a.timeline.filter(filter.test).slice().reverse();
  L.push(section(t, 'LINHA DO TEMPO', W, `filtro: ${filter.label} (f) · ${tl.length} ação(ões)`));
  const rows = tl.map((e) => ({ open: { kind: 'event', id: e.id }, text: `  ${eventLine(t, e, W - 2)}` }));
  if (!rows.length) rows.push({ text: t.gray('  nenhuma ação registrada no trace para este agente') });
  return { head: [L[0]], rows: [...text(L.slice(1)), ...rows], tail: [] };
}

function taskDetail(s, id, { t, width: W }) {
  const x = s.tasks.find((y) => y.id === id);
  if (!x) return { head: [t.red(`tarefa ${id} não encontrada`)], rows: [], tail: [] };
  const sp = s.specs.find((y) => y.id === x.spec);
  const L = [
    section(t, x.id, W, x.file),
    kv(t, 'Título', x.title),
    kv(t, 'Status', `${t.status(x.status)}${x.ready ? t.gray(' (pronta)') : ''}${x.blockedReason ? t.red(` — ${x.blockedReason}`) : ''}${x.cancelledReason ? t.gray(` — ${x.cancelledReason}`) : ''}${x.imported ? t.gray(' (importada do v2)') : ''}`),
    kv(t, 'Peso', String(x.weight)),
    kv(t, 'Agente', `@${x.agent} ${t.gray(`(${x.role})`)}`),
    kv(t, 'Modelo', x.model ? `${x.model}${x.effort ? ` · ${x.effort}` : ''} ${t.gray(`(${x.modelSource})`)}` : '—'),
    kv(t, 'Onda', x.wave ?? '—'),
    kv(t, 'Spec', `${x.spec} ${t.gray(sp?.title ?? '(inexistente)')}`),
    kv(t, 'Pipeline', x.pipeline ?? '—'),
    kv(t, 'Requisitos', x.requirements.length ? x.requirements.join(', ') : t.gray(`${UNKNOWN} — o título não cita RF-/CA-`)),
    kv(t, 'ADRs', sp?.adrs.length ? sp.adrs.map((a) => `${a.id}${a.exists ? '' : t.red(' (ausente)')}`).join(', ') : t.gray('nenhum citado na spec')),
    kv(t, 'Início', x.startedAt ?? '—'),
    kv(t, 'Conclusão', x.completedAt ?? '—'),
    kv(t, 'Duração', duration(x.durationMs)),
    kv(t, 'Retries', `${x.retries}${x.reopened ? ` · reaberta ${x.reopened}×` : ''}`),
    kv(t, 'Último evento', x.lastEvent ? `${x.lastEvent.label} ${t.gray(x.lastEvent.ts)}` : '—'),
    kv(t, 'Evidência', x.evidence ? [].concat(x.evidence).join(', ') : '—'),
  ];
  const rows = [...text(L.slice(1))];
  const link = (label, ids, kind) => {
    rows.push({ text: section(t, label, W), search: false });
    if (!ids.length) rows.push({ text: t.gray(kind === 'file' ? '  nenhuma modificação correlacionada pelo trace' : '  nenhuma'), search: false });
    for (const i of ids) {
      const other = kind === 'task' ? s.tasks.find((y) => y.id === i) : null;
      rows.push({ open: { kind, id: i }, text: `  ${other ? t.icon(other.status) : t.gray(t.sym.bullet)} ${i}${other ? t.gray(`  ${other.title} (@${shortAgent(other.agent)})`) : ''}` });
    }
  };
  link('DEPENDE DE', x.deps, 'task');
  link('DEPENDENTES', x.dependents, 'task');
  link('ARQUIVOS', x.files, 'file');
  const tests = testsForTask(sp, x);
  rows.push({ text: section(t, 'TESTES', W, 'arquivos que citam a spec e o requisito'), search: false });
  rows.push(...(tests.length ? tests.map((f) => ({ text: `  ${t.gray(t.sym.bullet)} ${f}`, search: false })) : [{ text: t.gray(`  ${UNKNOWN}`), search: false }]));
  return { head: [L[0]], rows, tail: [t.gray('  w: por quê esta tarefa existe? · Enter: abre dependência/arquivo')] };
}

function specDetail(s, id, { t, width: W }) {
  const sp = s.specs.find((y) => y.id === id);
  if (!sp) return { head: [t.red(`spec ${id} não encontrada`)], rows: [], tail: [] };
  const L = [
    section(t, sp.id, W, sp.file),
    kv(t, 'Título', sp.title ?? '—'),
    kv(t, 'Estado', `${t.status(sp.state ?? 'unknown', sp.state ?? 'sem estado')} ${t.gray(`(frontmatter: ${sp.fmStatus})`)}`),
    kv(t, 'Depende de', sp.dependsOn.join(', ') || '—'),
    kv(t, 'Cobertura', `${t.bar(sp.coverage.percent, 16)} ${frac(sp.coverage.done, sp.coverage.total)} ${t.gray(sp.coverage.source)}`),
    kv(t, 'Tarefas', frac(sp.tasks.done, sp.tasks.total)),
    kv(t, 'Reprovações', sp.rejections ? `${sp.rejections} — ${sp.lastRejection}` : '0'),
    kv(t, 'Evidência', sp.approvalEvidence ? [].concat(sp.approvalEvidence).join(', ') : '—'),
    section(t, 'GATES', W, `atual: ${sp.currentGate ?? 'nenhum (entregue)'}`),
  ];
  for (const g of sp.gates) {
    L.push(`  ${t.status(g.status, padEnd(g.name, 9))} ${t.gray([g.startedAt && `início ${g.startedAt}`, g.completedAt && `fim ${g.completedAt}`].filter(Boolean).join(' · '))}`);
    for (const c of g.checks.slice(0, 8)) L.push(truncate(`      ${t.icon(c.status)} ${padEnd(c.name, 22)} ${t.gray(c.detail ?? '')}`, W));
    if (g.blockingReason) L.push(`      ${t.red(`${t.sym.blocked} ${g.blockingReason}`)}`);
    if (g.evidence.length) L.push(truncate(`      ${t.gray(`evidência: ${g.evidence.join(', ')}`)}`, W));
  }
  L.push(section(t, 'ADRs', W));
  L.push(...(sp.adrs.length ? sp.adrs.map((a) => `  ${a.exists ? t.icon('passed') : t.icon('failed')} ${a.id} ${a.exists ? t.gray(`${a.title ?? ''} (${a.status ?? '?'})`) : t.red('citado, mas não encontrado em specs/decisions/')}`) : [t.gray('  nenhum ADR citado')]));
  L.push(section(t, 'REQUISITOS', W, 'Enter: rastreabilidade'));
  const rows = sp.requirements.map((r) => ({
    open: { kind: 'requirement', id: `${sp.id}::${r.id}` },
    text: truncate(`  ${t.icon(r.status)} ${padEnd(r.id, 7)} ${padEnd(r.text, Math.max(20, W - 40))} ${r.testRefs.length ? t.green(`${r.testRefs.length} teste(s)`) : t.gray('sem teste citado')}`, W),
  }));
  if (!rows.length) rows.push({ text: t.gray('  nenhum requisito numerado (RF-/RNF-/CA-) no corpo da spec') });
  return { head: [L[0]], rows: [...text(L.slice(1)), ...rows], tail: [] };
}

function whyDetail(s, item, { t, width: W }) {
  const chain = whyChain(s, item);
  const L = [section(t, chain.title, W, 'só vínculos explícitos; o resto é UNKNOWN')];
  chain.nodes.forEach((n, i) => {
    const unknown = n.id === UNKNOWN;
    L.push(truncate(`  ${padEnd(t.gray(n.kind.toUpperCase()), 11)} ${unknown ? t.yellow(n.id) : t.bold(n.id)}${n.detail ? `  ${t.gray(n.detail)}` : ''}${n.via && n.via !== '—' ? t.gray(`  [${n.via}]`) : ''}`, W));
    if (i < chain.nodes.length - 1) L.push(`  ${' '.repeat(11)} ${t.gray(t.sym.down)}`);
  });
  for (const n of chain.notes) L.push(`  ${t.yellow(n)}`);
  if (item.kind === 'requirement') {
    const [sid, rid] = item.id.split('::');
    const r = s.specs.find((x) => x.id === sid)?.requirements.find((x) => x.id === rid);
    if (r) L.push('', kv(t, 'Status', `${t.status(r.status)} ${t.gray(r.statusSource)}`), kv(t, 'Fonte', `${r.file}:${r.line}`));
  }
  return { head: [], rows: text(L), tail: [] };
}

function eventDetail(s, id, { t, width: W }) {
  const e = s.events.recent.find((x) => x.id === id) ?? s.agents.flatMap((a) => a.timeline).find((x) => x.id === id);
  if (!e) return { head: [t.gray('evento fora da janela em memória')], rows: [], tail: [] };
  const L = [
    section(t, e.label, W, e.source === 'domain' ? '.sdd/events.jsonl' : '.sdd/trace/'),
    kv(t, 'Quando', e.ts), kv(t, 'Nome', e.name), kv(t, 'Status', t.status(e.status)), kv(t, 'Sessão', e.session), kv(t, 'Agente', e.agent),
    kv(t, 'Tarefa', e.task), kv(t, 'Spec', e.spec), kv(t, 'Gate', e.gate), kv(t, 'Duração', e.durationMs !== null ? `${e.durationMs}ms` : '—'),
    section(t, 'ATRIBUTOS', W, 'sanitizados'),
    ...Object.entries(e.attrs).map(([k, v]) => truncate(`  ${t.gray(padEnd(k, 20))} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`, W)),
  ];
  return { head: [], rows: text(L), tail: [] };
}

function decisionDetail(s, id, { t, width: W }) {
  const d = s.security.policy.decisions.find((x) => x.id === id);
  if (!d) return { head: [t.gray('decisão fora da janela')], rows: [], tail: [] };
  return { head: [], rows: text([
    section(t, 'DECISÃO DA POLÍTICA', W, clock(d.ts)),
    kv(t, 'Quando', d.ts), kv(t, 'Agente', d.agent), kv(t, 'Tentativa', d.attempt || '—'), kv(t, 'Regra', d.rule ?? '—'),
    kv(t, 'Decisão', d.decision === 'DENY' ? t.status('deny', 'BLOCKED') : t.status('ask', 'CONFIRMAÇÃO PEDIDA')), kv(t, 'Sessão', d.session),
    '', t.gray('  explique a regra: sdd policy check --file <caminho> | --command "<cmd>"'),
  ]), tail: [] };
}

function qualityDetail(s, id, { t, width: W }) {
  const r = s.quality.specs.find((x) => x.spec === id);
  if (!r) return { head: [t.gray('sem dados')], rows: [], tail: [] };
  const L = [section(t, `TESTES ${id}`, W), kv(t, 'Último resultado', r.result ? t.status(r.result) : '—'), kv(t, 'Quando', r.ts ?? '—'), kv(t, 'Comando', r.command ?? '—'), section(t, 'SUÍTES', W)];
  for (const x of r.suites) L.push(`  ${padEnd(x.suite, 14)} ${t.status(x.result)} ${frac(x.passed ?? 0, x.total ?? 0)} ${x.failed ? t.red(`${x.failed} falha(s)`) : ''} ${x.coverage !== null ? t.gray(`cobertura ${x.coverage}%`) : ''} ${t.gray(x.ts)}`);
  if (!r.suites.length) L.push(t.gray('  nenhuma suíte registrada'));
  return { head: [], rows: text(L), tail: [] };
}

function evalDetail(s, id, { t, width: W }) {
  const e = s.quality.evals.find((x) => x.suite === id);
  if (!e) return { head: [t.gray('sem dados')], rows: [], tail: [] };
  return { head: [], rows: text([section(t, `EVALS ${e.suite}`, W, e.file), kv(t, 'Resultado', frac(e.passed ?? 0, e.total)), kv(t, 'Executado', e.ranAt), section(t, 'FALHAS', W), ...(e.failed.length ? e.failed.map((f) => `  ${t.icon('failed')} ${f}`) : [t.gray('  nenhuma')])]), tail: [] };
}

const RENDER = { agent: agentDetail, task: taskDetail, spec: specDetail, event: eventDetail, decision: decisionDetail, quality: qualityDetail, eval: evalDetail };

export function detailView(s, item, ctx) {
  if (item.kind === 'why' || item.kind === 'requirement' || item.kind === 'file') return whyDetail(s, item.kind === 'why' ? item.target : item, ctx);
  const f = RENDER[item.kind];
  return f ? f(s, item.id, ctx) : { head: [`detalhe desconhecido: ${item.kind}`], rows: [], tail: [] };
}
