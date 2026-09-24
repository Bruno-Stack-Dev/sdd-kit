// Diagnóstico do dashboard/status: as fontes que ele observa estão legíveis e o snapshot sai.
// Tudo informativo e somente leitura; cada problema traz a ação objetiva.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { JsonlTail, TraceDirTail } from '../dashboard/event-store.mjs';
import { resolveDashboardConfig } from '../dashboard/defaults.mjs';
import { agentRegistry } from '../dashboard/sources.mjs';

export async function checkDashboard(report, p) {
  const G = 'Dashboard';
  const events = new JsonlTail(join(p.root, '.sdd', 'events.jsonl'));
  const ev = events.read();
  if (ev.missing) report.pass(G, 'dashboard.event-store', 'event store: .sdd/events.jsonl ainda não existe (projeto sem estado — `sdd tasks sync` cria)');
  else {
    const problems = events.invalid.map((i) => `.sdd/events.jsonl:${i.line}: ${i.message}`);
    if (events.truncatedTail) problems.push('.sdd/events.jsonl termina numa linha truncada — rode `sdd state repair`');
    report.fromIssues(G, 'dashboard.event-store', `event store legível: ${ev.records.length} evento(s) em .sdd/events.jsonl`, [], problems);
  }
  const trace = new TraceDirTail(join(p.root, '.sdd', 'trace'));
  const tr = trace.read();
  const traceWarn = [...trace.tails.entries()].flatMap(([f, t]) => t.invalid.map((i) => `.sdd/trace/${f}:${i.line}: ${i.message}`));
  report.fromIssues(G, 'dashboard.trace', existsSync(join(p.root, '.sdd', 'trace')) ? `trace legível: ${tr.records.length} registro(s) em ${trace.tails.size} sessão(ões)` : 'trace: .sdd/trace/ ainda vazio (os hooks o criam)', [], traceWarn.slice(0, 20));
  report.add(G, 'dashboard.state', p.state.anomalies.length ? 'warn' : 'pass', p.state.anomalies.length ? `${p.state.anomalies.length} evento(s) rejeitado(s) na reexecução — o dashboard mostra o estado sem eles (\`sdd state verify\`)` : `estado do projeto reconstruído (${p.state.events} evento[s] aplicados)`);
  let agents = [];
  try { agents = agentRegistry(p.root, p.cfg.config); } catch (e) { report.fail(G, 'dashboard.agents', `registro de agentes ilegível: ${e.message}`); }
  const broken = agents.filter((a) => a.parseError).map((a) => `${a.file}: frontmatter inválido (${a.parseError})`);
  if (agents.length) report.fromIssues(G, 'dashboard.agents', `registro de agentes: ${agents.length} agente(s) com papel e permissões`, [], broken);
  report.add(G, 'dashboard.task-graph', p.taskGraph.errors.length ? 'warn' : 'pass', p.taskGraph.errors.length ? `grafo de tarefas com ${p.taskGraph.errors.length} erro(s): o dashboard mostra, mas "prontas" fica vazio — \`sdd doctor --fast\`` : `grafo de tarefas: ${p.taskGraph.tasks.size} tarefa(s)`);
  const { warnings } = resolveDashboardConfig(p.cfg.config);
  report.fromIssues(G, 'dashboard.config', p.cfg.config?.dashboard ? 'configuração `dashboard` válida' : 'configuração `dashboard`: defaults (docs/dashboard.md)', [], warnings);
  if (process.stdout.isTTY && process.stdin.isTTY) report.pass(G, 'dashboard.terminal', `terminal interativo (${process.stdout.columns}×${process.stdout.rows}) — \`sdd dashboard\` disponível`);
  else report.skip(G, 'dashboard.terminal', 'sem terminal interativo aqui (CI/pipe): use `sdd status` ou `sdd dashboard --once`');
}

/**
 * Gera o snapshot de verdade (git, varredura dos testes, métricas). Só em `doctor --dashboard`:
 * refaz o que o doctor já carregou e varre a árvore de testes — caro demais para --project/--full.
 */
export async function checkDashboardSnapshot(report, p) {
  const G = 'Dashboard';
  try {
    const { createDashboardService } = await import('../dashboard/index.mjs');
    const t0 = Date.now();
    const snap = createDashboardService(p.root, { scan: false }).getSnapshot();
    report.pass(G, 'dashboard.snapshot', `snapshot gerado em ${Date.now() - t0} ms (saúde ${snap.health.status}, entrega ${snap.delivery.status})`);
  } catch (e) {
    report.fail(G, 'dashboard.snapshot', `snapshot falhou: ${e.message} — rode \`sdd status --verbose --debug\` e veja .sdd/cache/dashboard.log`);
  }
}
