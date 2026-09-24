// Telas de lista: Agents (2), Tasks/grafo (3), Specs (4), Quality (5), Security (6), Events (7),
// Runtime (8). Cada uma devolve uma página; Enter numa linha abre o detalhe (details.mjs).
import { padEnd, padStart, truncate, duration, clock, frac } from '../text.mjs';
import { section, kv, shortAgent, eventLine, FILTERS } from './common.mjs';

// ------------------------------------------------------------------------------------------------ 2
export function agentsView(s, { t, width: W }) {
  const nameW = Math.min(28, Math.max(14, W - 70));
  const head = [
    section(t, 'AGENTES', W, `${s.agents.length} detectados · Enter: detalhe`),
    t.gray(`  ${padEnd('NOME', nameW)} ${padEnd('STATUS', 12)} ${padEnd('TAREFA', 16)} ${padEnd('MODELO', 8)} ${padEnd('CONTEXTO', 9)} ${padEnd('FERR.', 6)} ${padEnd('RETRY', 6)} SAÚDE`),
  ];
  const rows = s.agents.map((a) => ({
    open: { kind: 'agent', id: a.name },
    plain: `${a.name} ${a.status} ${a.currentTask?.id ?? ''} ${a.health.status} ${a.role}`,
    text: truncate(`  ${padEnd(a.name, nameW)} ${padEnd(t.status(a.status), 12)} ${padEnd(a.currentTask?.id ?? '-', 16)} ${padEnd(a.model ?? '-', 8)} ${padEnd(a.context.available ? `${a.context.percent}%` : t.gray('n/d'), 9)} ${padStart(String(a.metrics.toolCalls), 5)}  ${padStart(String(a.metrics.retries), 5)}  ${t.status(a.health.status)}`, W),
  }));
  return { head, rows, tail: [t.gray('  CONTEXTO n/d = o runtime não expõe uso de contexto aos hooks (nunca é estimado)')] };
}

// ------------------------------------------------------------------------------------------------ 3
export function tasksView(s, { t, width: W }) {
  const head = [section(t, 'GRAFO DE TAREFAS', W, `${s.counts.tasks} tarefa(s) · Enter: detalhe · w: por quê?`)];
  const rows = [];
  for (const sp of s.specs) {
    const tasks = s.tasks.filter((x) => x.spec === sp.id);
    rows.push({ open: { kind: 'spec', id: sp.id }, plain: `${sp.id} ${sp.title}`, text: truncate(`${t.bold(sp.id)} ${t.gray(sp.title ?? '')}  ${t.status(sp.state ?? 'unknown', sp.state ?? 'sem estado')}  ${t.gray(`gate ${sp.currentGate ?? 'OK'} · ${frac(sp.tasks.done, sp.tasks.total)}`)}`, W) });
    tasks.forEach((x, i) => {
      const last = i === tasks.length - 1;
      const indent = '  '.repeat(Math.min(x.depth, 6));
      const deps = x.deps.length ? t.gray(` ${t.sym.arrow.length > 1 ? '<-' : '←'} ${x.deps.map((d) => (d.startsWith(`${x.spec}/`) ? d.split('/')[1] : d)).join(', ')}`) : '';
      rows.push({
        open: { kind: 'task', id: x.id },
        plain: `${x.id} ${x.title} ${x.agent} ${x.status}`,
        text: truncate(`  ${t.gray(last ? t.sym.elbow : t.sym.tee)}${indent} ${t.icon(x.status)} ${padEnd(x.localId, 6)} ${padEnd(x.title, Math.max(12, W - 60))} ${t.gray(padEnd(`@${shortAgent(x.agent)}`, 18))}${x.weight !== 1 ? t.gray(` ×${x.weight}`) : ''}${deps}`, W),
      });
    });
    if (tasks.length) {
      const g = sp.gates.find((x) => x.name === sp.currentGate);
      rows.push({ text: t.gray(`  ${' '.repeat(4)}${t.sym.down} ${sp.currentGate ? `${sp.currentGate} GATE ${g ? `(${g.status})` : ''}` : `DELIVERY ${t.sym.ok}`}`), search: false });
    }
  }
  const orphans = s.tasks.filter((x) => !s.specs.some((sp) => sp.id === x.spec));
  for (const x of orphans) rows.push({ open: { kind: 'task', id: x.id }, text: `  ${t.icon('unknown')} ${x.id} ${x.title} ${t.red('(spec inexistente)')}` });
  if (!rows.length) rows.push({ text: t.gray('  nenhuma tarefa (specs/tasks/ vazio)') });
  return { head, rows, tail: [t.gray(`  ${t.sym.ok} concluída  ${t.sym.running} em andamento  ${t.sym.waiting} pronta/aguardando  ${t.sym.pending} pendente  ${t.sym.failed} falhou  ${t.sym.blocked} bloqueada`)] };
}

// ------------------------------------------------------------------------------------------------ 4
export function specsView(s, { t, width: W }) {
  const head = [
    section(t, 'SPECS E REQUISITOS', W, `${s.counts.requirements} requisito(s) · ${s.counts.requirementsWithTests} citado(s) em testes`),
    t.gray(`  ${padEnd('SPEC', 16)} ${padEnd('ESTADO', 14)} ${padEnd('GATE', 10)} ${padEnd('REQUISITOS', 26)} ${padEnd('TAREFAS', 8)} ADRs  TÍTULO`),
  ];
  const rows = s.specs.map((sp) => ({
    open: { kind: 'spec', id: sp.id },
    plain: `${sp.id} ${sp.title} ${sp.state}`,
    text: truncate(`  ${padEnd(sp.id, 16)} ${padEnd(t.status(sp.state ?? 'unknown', sp.state ?? 'sem estado'), 14)} ${padEnd(sp.currentGate ?? 'OK', 10)} ${padEnd(`${t.bar(sp.coverage.percent, 10)} ${frac(sp.coverage.done, sp.coverage.total)}`, 26)} ${padEnd(frac(sp.tasks.done, sp.tasks.total), 8)} ${padEnd(String(sp.adrs.length), 5)} ${t.gray(sp.title ?? '')}`, W),
  }));
  if (!rows.length) rows.push({ text: t.gray('  nenhuma spec em specs/features|architecture|apis') });
  return { head, rows, tail: [t.gray('  requisitos = linhas RF-/RNF-/CA- da spec · verificados = spec aprovada pelo guardião (GUARDIAN_APPROVED)')] };
}

// ------------------------------------------------------------------------------------------------ 5
export function qualityView(s, { t, width: W }) {
  const q = s.quality;
  const head = [section(t, 'QUALIDADE', W, q.source)];
  if (q.suites.length) {
    head.push(t.gray(`  ${padEnd('SUÍTE', 16)} ${padEnd('OK/TOTAL', 10)} ${padEnd('FALHAS', 7)} ${padEnd('IGNOR.', 7)} COBERTURA`));
    for (const x of q.suites) head.push(`  ${padEnd(x.suite, 16)} ${padEnd(frac(x.passed, x.total), 10)} ${padEnd(x.failed ? t.red(String(x.failed)) : '0', 7)} ${padEnd(String(x.skipped), 7)} ${x.coverage !== null ? `${x.coverage}%` : t.gray('n/d')}`);
  } else head.push(t.gray('  sem contagens por suíte (registre com `sdd event TEST_PASSED --spec X --suite unit --passed N --total N`)'));
  head.push('', kv(t, 'Checks falhos', q.failedChecks ? t.red(String(q.failedChecks)) : '0'), '', t.gray(`  ${padEnd('SPEC', 16)} ${padEnd('ÚLTIMA SUÍTE', 16)} ${padEnd('QUANDO', 10)} COMANDO`));
  const rows = q.specs.map((r) => ({
    open: { kind: 'quality', id: r.spec },
    text: truncate(`  ${padEnd(r.spec, 16)} ${padEnd(r.result ? t.status(r.result) : t.gray('— nunca'), 16)} ${padEnd(r.ts ? clock(r.ts) : '—', 10)} ${t.gray(r.command ?? '')}`, W),
  }));
  for (const e of q.evals) rows.push({ open: { kind: 'eval', id: e.suite }, text: truncate(`  ${padEnd(`evals:${e.suite}`, 16)} ${padEnd(e.passed === e.total ? t.status('passed', `${e.passed}/${e.total}`) : t.status('failed', `${e.passed}/${e.total}`), 16)} ${padEnd(clock(e.ranAt), 10)} ${t.gray(e.file)}`, W) });
  if (!rows.length) rows.push({ text: t.gray('  nenhuma spec ativa') });
  return { head, rows, tail: [] };
}

// ------------------------------------------------------------------------------------------------ 6
export function securityView(s, { t, width: W }) {
  const g = s.security.guards;
  const f = s.security.findings;
  const head = [
    section(t, 'SEGURANÇA', W),
    kv(t, 'Sandbox', `${t.status(g.sandbox.status)}  ${t.gray(g.sandbox.detail)}`, 18),
    kv(t, 'Policy engine', `${t.status(g.policy.status)}  ${t.gray(g.policy.detail)}`, 18),
    kv(t, 'Hooks', `${t.status(g.hooks.status)}  ${t.gray(g.hooks.detail)}`, 18),
    kv(t, 'Trace', `${t.status(g.trace.status)}  ${t.gray(g.trace.detail)}`, 18),
    '',
    ...s.security.scans.map((x) => kv(t, x.name, `${t.status(x.status)}  ${t.gray(truncate(x.detail ?? '', Math.max(10, W - 40)))}`, 30)),
    '',
    `  Críticos ${f.critical ? t.red(String(f.critical)) : '0'}   Altos ${f.high}   Médios ${f.medium ? t.yellow(String(f.medium)) : '0'}   Baixos ${f.low}   ${t.gray('(só o que os scanners que rodaram encontraram)')}`,
    section(t, 'DECISÕES DA POLÍTICA', W, `${s.security.policy.deny} negada(s) · ${s.security.policy.ask} confirmação(ões) · Enter: detalhe`),
  ];
  const rows = s.security.policy.decisions.map((d) => ({
    open: { kind: 'decision', id: d.id },
    text: truncate(`  ${t.gray(clock(d.ts))} ${padEnd(t.status(d.decision === 'DENY' ? 'deny' : 'ask', d.decision === 'DENY' ? 'BLOCKED' : 'ASK'), 10)} ${padEnd(shortAgent(d.agent), 16)} ${padEnd(d.rule ?? '?', 22)} ${d.attempt}`, W),
  }));
  if (!rows.length) rows.push({ text: t.gray('  nenhuma ação negada ou com confirmação registrada no trace') });
  return { head, rows, tail: [] };
}

// ------------------------------------------------------------------------------------------------ 7
export function eventsView(s, { t, width: W, ui }) {
  const filter = FILTERS.find((x) => x.id === ui.filter) ?? FILTERS[0];
  const list = s.events.recent.filter(filter.test).slice().reverse();
  const head = [section(t, 'EVENTOS AO VIVO', W, `filtro: ${filter.label} (f) · ${list.length}/${s.events.recent.length} em memória · ${s.events.total} observados${ui.paused ? ' · PAUSADO (p)' : ''}`)];
  const rows = list.map((e) => ({ open: { kind: 'event', id: e.id }, plain: `${e.label} ${e.agent ?? ''} ${e.task ?? ''} ${e.summary}`, text: `  ${eventLine(t, e, W - 2)}` }));
  if (!rows.length) rows.push({ text: t.gray(`  nenhum evento${filter.id !== 'all' ? ` para o filtro '${filter.label}'` : ''}`) });
  return { head, rows, tail: s.events.invalid ? [t.yellow(`  ${t.sym.warn} ${s.events.invalid} linha(s) inválida(s) ignorada(s) nos logs`)] : [] };
}

// ------------------------------------------------------------------------------------------------ 8
export function runtimeView(s, { t, width: W }) {
  const se = s.session;
  const head = [section(t, 'SESSÃO', W, `${s.sessions.length} registrada(s)`)];
  if (se) {
    head.push(
      kv(t, 'ID', se.id), kv(t, 'Status', t.status(se.status)), kv(t, 'Início', se.started ?? '—'), kv(t, 'Duração', duration(se.durationMs)),
      kv(t, 'Branch', s.git.available ? `${s.git.branch ?? '?'} @ ${s.git.head ?? '—'}` : t.gray(s.git.reason)),
      kv(t, 'Working tree', s.git.available ? (s.git.dirty ? t.yellow(`${s.git.changed} alteração(ões)`) : 'limpo') : '—'),
      kv(t, 'Agentes', String(se.agentsSpawned)), kv(t, 'Tarefas', String(se.tasksTouched)), kv(t, 'Arquivos', String(se.filesChanged)), kv(t, 'Eventos', String(se.events)),
    );
  } else head.push(t.gray('  nenhuma sessão registrada'));
  const a = s.autonomy;
  head.push(section(t, 'AUTONOMIA', W, a.source), a.available
    ? `  ${a.actions} ações · ${a.autoApproved} sem intervenção · ${a.humanApprovals} confirmação(ões) · ${a.policyBlocked} bloqueio(s) → ${t.bold(`${a.percent}%`)}   ${t.gray(a.formula)}`
    : t.gray('  sem ações observadas'));
  head.push(section(t, 'FERRAMENTAS', W), t.gray(`  ${padEnd('FERRAMENTA', 30)} ${padEnd('CHAMADAS', 9)} ${padEnd('FALHAS', 7)} ${padEnd('MÉDIA', 8)} ${padEnd('ÚLTIMA', 9)} AGENTES`));
  for (const x of s.tools.slice(0, 12)) head.push(truncate(`  ${padEnd(x.name, 30)} ${padEnd(String(x.calls), 9)} ${padEnd(x.failures ? t.red(String(x.failures)) : '0', 7)} ${padEnd(x.avgMs !== null ? `${x.avgMs}ms` : t.gray('n/d'), 8)} ${padEnd(x.lastTs ? clock(x.lastTs) : '—', 9)} ${t.gray(x.agents.map(shortAgent).join(', '))}`, W));
  if (!s.tools.length) head.push(t.gray('  nenhuma chamada observada no trace'));
  head.push(section(t, 'MCP', W, s.mcp.profile ? `perfil ${s.mcp.profile}` : ''));
  for (const m of s.mcp.servers) head.push(truncate(`  ${padEnd(m.name, 16)} ${padEnd(t.status(m.status === 'active' ? 'active' : m.status === 'unused' ? 'unused' : 'observed', m.status === 'active' ? 'em uso' : m.status === 'unused' ? 'configurado, sem uso' : 'observado (fora do .mcp.json)'), 30)} ${padEnd(`${m.calls} chamada(s)`, 14)} ${padEnd(`${m.errors} erro(s)`, 10)} ${padEnd(m.avgMs !== null ? `${m.avgMs}ms` : 'lat. n/d', 10)} ${padEnd(m.lastTs ? clock(m.lastTs) : '—', 9)} ${t.gray(m.agents.map(shortAgent).join(', '))}`, W));
  if (!s.mcp.servers.length) head.push(t.gray('  nenhum servidor MCP configurado ou observado'));
  for (const e of s.mcp.errors) head.push(`  ${t.icon('error')} ${t.red(e)}`);
  head.push(section(t, 'LSP', W, s.lsp.enabled ? 'integrations.lsp.enabled' : 'desligado na config'));
  if (s.lsp.operations.length) for (const o of s.lsp.operations) head.push(`  ${padEnd(o.operation, 24)} ${padEnd(`${o.calls} consulta(s)`, 14)} ${o.failures ? t.red(`${o.failures} erro(s)`) : '0 erros'}  ${o.avgMs !== null ? `${o.avgMs}ms` : t.gray('lat. n/d')}`);
  else head.push(t.gray('  nenhuma consulta LSP observada (métricas só do uso real; o dashboard nunca chama o LSP)'));
  head.push(section(t, 'ARQUIVOS TOCADOS', W, 'Enter: por quê este arquivo existe?'));
  const rows = s.files.map((f) => ({ open: { kind: 'file', id: f.path }, text: truncate(`  ${padEnd(f.path, Math.max(20, W - 50))} ${padEnd(`${f.modifications} mod.`, 8)} ${padEnd(`${f.reads} leit.`, 9)} ${t.gray(f.tasks.join(', ') || 'sem tarefa')}`, W) }));
  if (!rows.length) rows.push({ text: t.gray('  nenhum arquivo no trace') });
  rows.push({ text: '', search: false }, { text: section(t, 'SESSÕES', W), search: false });
  for (const x of s.sessions.slice(0, 20)) rows.push({ text: truncate(`  ${padEnd(x.id, 40)} ${padEnd(t.status(x.status), 12)} ${padEnd(duration(x.durationMs), 9)} ${x.events} evento(s)`, W) });
  return { head: [], rows: [...head.map((text) => ({ text, search: false })), ...rows], tail: [] };
}

