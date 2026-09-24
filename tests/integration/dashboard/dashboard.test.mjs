// Dashboard/status de ponta a ponta: event log → snapshot, tarefa → progresso, eventos de agente →
// status, gate → prontidão de entrega, resiliência (log corrompido, spec/ADR ausentes), segurança,
// rajada de eventos, contrato JSON, CLI (status/dashboard/sessions/doctor), hooks e somente leitura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { KIT_ROOT, tempProject, cleanup, runSdd, runNode, writeFile, readFile } from '../../helpers.mjs';
import { greenfieldProject, baseConfig } from '../../fixtures/project.mjs';
import { stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { validate } from '../../../scripts/lib/schema.mjs';
import { createDashboardService } from '../../../scripts/lib/dashboard/index.mjs';
import { createDemoProject, runDemoSteps, removeDemoProject, demoSteps } from '../../../scripts/lib/dashboard/demo.mjs';
import { toStatusJson } from '../../../scripts/lib/dashboard/format/json.mjs';
import { traceEvent, toOtlp } from '../../../scripts/lib/trace.mjs';
import { appendEvent, computeState } from '../../../scripts/lib/events.mjs';

const STATUS_SCHEMA = JSON.parse(readFileSync(join(KIT_ROOT, 'schemas', 'status.schema.json'), 'utf8'));
const HOOK = join(KIT_ROOT, 'scripts', 'hooks', 'sdd-hook.mjs');
const sdd = (args, dir) => runSdd([...args, '--root', dir]);
const statusJson = (dir, extra = []) => {
  const r = sdd(['status', '--json', '--no-scan', ...extra], dir);
  assert.equal(r.status, 0, r.out);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(validate(STATUS_SCHEMA, j), [], 'saída conforme schemas/status.schema.json');
  return j;
};
const step = (label) => demoSteps().findIndex((s) => s.label === label);

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(`${relative(dir, p)}:${readFileSync(p).toString('base64')}`);
    }
  };
  walk(dir);
  return h.digest('hex');
}

test('projeto vazio (specs sem estado): status funciona, sem inventar progresso', () => {
  const dir = greenfieldProject();
  try {
    const j = statusJson(dir);
    assert.equal(j.health.status, 'ATTENTION');
    assert.match(j.health.reasons.map((r) => r.message).join('\n'), /sem estado estruturado/);
    assert.equal(j.delivery.status, 'UNKNOWN');
    assert.equal(j.progress.implementation.percent, 0);
    assert.equal(j.agents.active, 0, 'nenhum agente ativo');
    assert.ok(j.agents.items.every((a) => a.context === null), 'contexto nunca estimado');
  } finally { cleanup(dir); }
});

test('fora de um projeto SDD: status sai 1 com orientação; --json explica', () => {
  const dir = tempProject({ 'README.md': '# nada' });
  try {
    const r = sdd(['status'], dir);
    assert.equal(r.status, 1);
    assert.match(r.out, /nenhum projeto SDD/);
    const j = JSON.parse(sdd(['status', '--json'], dir).stdout);
    assert.equal(j.error, 'not_sdd_project');
  } finally { cleanup(dir); }
});

test('tarefas e testes mudam o progresso, e o serviço incremental acompanha sem reler tudo', () => {
  const dir = greenfieldProject();
  try {
    assert.equal(sdd(['tasks', 'sync'], dir).status, 0);
    const svc = createDashboardService(dir, { scan: false });
    const before = svc.getSnapshot();
    assert.equal(before.progress.dimensions.implementation.percent, 0);
    assert.equal(svc.poll(), false, 'nada mudou');
    assert.equal(sdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--agent', 'agente-arquiteto-contratos'], dir).status, 0);
    assert.equal(sdd(['event', 'TASK_COMPLETED', '--task', 'BIB-100/T-001'], dir).status, 0);
    assert.equal(sdd(['event', 'TEST_PASSED', '--spec', 'BIB-100', '--suite', 'unit', '--passed', '12', '--total', '12'], dir).status, 0);
    assert.equal(svc.poll(), true);
    const after = svc.getSnapshot();
    assert.equal(after.progress.dimensions.implementation.done, 1);
    assert.equal(after.progress.dimensions.implementation.percent, 12.5);
    assert.deepEqual(after.quality.totals, { passed: 12, failed: 0, skipped: 0, total: 12 });
    assert.equal(after.state.events, before.state.events + 3);
  } finally { cleanup(dir); }
});

test('eventos de agente mudam o status: working com subagente vivo, assigned sem, idle depois', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    sdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--agent', 'agente-arquiteto-contratos', '--session', 'sess-a'], dir);
    const svc = createDashboardService(dir, { scan: false });
    const agent = () => svc.getSnapshot().agents.find((a) => a.name === 'agente-arquiteto-contratos');
    assert.equal(agent().status, 'assigned');
    traceEvent(dir, { session: 'sess-a', name: 'agent.spawned', attrs: { 'sdd.agent': 'agente-arquiteto-contratos' } });
    svc.poll();
    assert.equal(agent().status, 'working');
    assert.equal(agent().currentTask.id, 'BIB-100/T-001');
    assert.match(agent().instruction, /BIB-100/);
    traceEvent(dir, { session: 'sess-a', name: 'agent.stopped', attrs: { 'sdd.agent': 'agente-arquiteto-contratos' } });
    sdd(['event', 'TASK_COMPLETED', '--task', 'BIB-100/T-001'], dir);
    svc.poll();
    assert.equal(agent().status, 'ready', 'concluiu uma e já tem a próxima pronta (BIB-110/T-001)');
    assert.equal(agent().currentTask, null);
    assert.equal(svc.getSnapshot().agents.find((a) => a.name === 'agente-frontend').status, 'ready');
  } finally { cleanup(dir); }
});

test('cenário do simulador: falha → BLOCKED/DEGRADED, reprovação → GUARDIAN, fim → READY', () => {
  const root = createDemoProject();
  try {
    runDemoSteps(root, { to: step('teste de integração falha') + 1 });
    const svc = createDashboardService(root, { demo: true, scan: false });
    let s = svc.getSnapshot();
    assert.equal(s.health.status, 'DEGRADED');
    assert.equal(s.delivery.status, 'BLOCKED');
    assert.match(s.delivery.reasons.join(' '), /teste falhando em DEMO-100/);
    assert.equal(s.agents.find((a) => a.name === 'agente-backend').health.status, 'BLOCKED');
    assert.equal(s.security.policy.deny, 1);
    assert.equal(s.mcp.servers.find((m) => m.name === 'context7').calls, 1);
    runDemoSteps(root, { from: step('teste de integração falha') + 1, to: step('guardião reprova (CA-04 sem teste)') + 1 });
    svc.poll();
    s = svc.getSnapshot();
    const spec = s.specs.find((x) => x.id === 'DEMO-100');
    assert.equal(spec.currentGate, 'GUARDIAN');
    assert.equal(spec.gates.find((g) => g.name === 'GUARDIAN').status, 'failed');
    assert.equal(s.tasks.find((t) => t.id === 'DEMO-100/T-002').retries, 1);
    runDemoSteps(root, { from: step('guardião reprova (CA-04 sem teste)') + 1 });
    svc.poll();
    s = svc.getSnapshot();
    assert.equal(s.delivery.status, 'READY');
    assert.equal(s.progress.dimensions.implementation.percent, 100);
    assert.equal(s.counts.requirementsVerified, s.counts.requirements);
    assert.ok(s.demo);
  } finally { removeDemoProject(root); }
});

test('GATE_BLOCKED bloqueia a entrega; GATE_PASSED libera', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    sdd(['event', 'GATE_BLOCKED', '--gate', 'security', '--reason', 'CVE crítica'], dir);
    let j = statusJson(dir);
    assert.equal(j.delivery.status, 'BLOCKED');
    assert.equal(j.health.status, 'BLOCKED');
    sdd(['event', 'GATE_PASSED', '--gate', 'security'], dir);
    j = statusJson(dir);
    assert.equal(j.delivery.status, 'NOT_READY');
  } finally { cleanup(dir); }
});

test('resiliência: linha corrompida e cauda truncada não derrubam; spec e ADR ausentes aparecem', () => {
  const dir = greenfieldProject({
    'specs/tasks/BIB-900-fantasma.md': '---\ntarefas-de: BIB-900\n---\n\n- [ ] [T-001] órfã (@agente-frontend)\n',
    'specs/features/BIB-100-acervo.md': `---\nspec-id: BIB-100\ntitulo: Acervo\nstatus: rascunho\ncas: 1\ndepende-de: []\n---\n\nSegue o ADR-042.\n\n- **CA-01**: algo\n`,
  });
  try {
    // Grafo com tarefa órfã: `tasks sync` recusa, então o log é montado à mão (cenário de corrupção).
    writeFile(dir, '.sdd/events.jsonl', 'lixo que não é json\n{"v":1,"id":"x"');
    writeFile(dir, '.sdd/trace/s.jsonl', '{"name":"tool.called","attrs":{}}\n{quebrado\n');
    const j = statusJson(dir);
    assert.equal(j.state.truncatedTail, true);
    assert.equal(j.health.status, 'BLOCKED');
    assert.ok(j.state.invalidLines >= 2);
    const svc = createDashboardService(dir, { scan: false }).getSnapshot();
    assert.ok(svc.state.graphErrors.some((e) => /BIB-900/.test(e.message)), 'spec ausente vira erro de grafo');
    assert.deepEqual(svc.specs.find((s) => s.id === 'BIB-100').adrs, [{ id: 'ADR-042', exists: false, file: null, title: null, status: null }]);
  } finally { cleanup(dir); }
});

test('segredo versionado é crítico e bloqueia; sem git, conta como médio (a saída nunca o reproduz)', (t) => {
  const fake = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
  const dir = greenfieldProject({ 'src/config.ts': `export const key = "${fake}";\n` });
  try {
    const local = sdd(['status', '--json'], dir);
    const lj = JSON.parse(local.stdout);
    assert.deepEqual([lj.security.findings.critical, lj.security.findings.medium], [0, 1], 'sem git: versionamento desconhecido');
    assert.ok(!local.stdout.includes(fake));
    const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (git(['init', '-q']).status !== 0) { t.diagnostic('git indisponível: parte versionada não testada'); return; }
    git(['add', '-A']);
    const r = sdd(['status', '--json'], dir);
    const j = JSON.parse(r.stdout);
    assert.equal(j.security.findings.critical, 1);
    assert.equal(j.health.status, 'BLOCKED');
    assert.ok(!r.stdout.includes(fake));
  } finally { cleanup(dir); }
});

test('comando com sequências de controle no trace não chega cru ao terminal nem ao JSON', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    const ESC = String.fromCharCode(27);
    traceEvent(dir, { session: 's', name: 'tool.completed', attrs: { 'sdd.agent': 'agente-frontend', 'tool.name': 'Bash', 'tool.command': `cat <<X\nlinha2\nlinha3${ESC}[2J` } });
    const once = sdd(['dashboard', '--once', '--tab', 'events', '--width', '100', '--height', '30'], dir);
    assert.equal(once.stdout.trimEnd().split('\n').length, 30, 'o quadro não ganhou linhas');
    assert.ok(!once.stdout.includes(ESC), 'nenhum ESC vindo dos dados');
    const snap = createDashboardService(dir, { scan: false }).getSnapshot();
    assert.ok(!JSON.stringify(snap.events).includes(ESC));
  } finally { cleanup(dir); }
});

test('o estado do dashboard é o mesmo de computeState, também depois de atualizações incrementais', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    const svc = createDashboardService(dir, { scan: false });
    sdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--agent', 'agente-arquiteto-contratos'], dir);
    sdd(['event', 'TASK_BLOCKED', '--task', 'BIB-100/T-001', '--reason', 'aguardando decisão'], dir);
    appendFileSync(join(dir, '.sdd', 'events.jsonl'), '[1,2]\n');
    svc.poll();
    const { state } = computeState(dir);
    const s = svc.getSnapshot();
    assert.equal(s.state.events, state.events);
    assert.equal(s.state.anomalies, state.anomalies.length, 'não-objeto vira anomalia nos dois');
    assert.equal(s.tasks.find((x) => x.id === 'BIB-100/T-001').status, state.tasks['BIB-100/T-001'].status);
    // uma única tarefa bloqueada: ATTENTION (o limiar blocked_tasks_degraded vale), não DEGRADED
    assert.equal(s.health.status, 'DEGRADED', 'a anomalia do [1,2] degrada');
    assert.ok(!s.health.reasons.some((r) => r.source === 'Agent Health Engine' && /bloqueada/.test(r.message)), 'bloqueio não sobe duplicado pelo agente');
    assert.ok(s.health.reasons.some((r) => r.level === 'attention' && /1 tarefa\(s\) bloqueada/.test(r.message)));
  } finally { cleanup(dir); }
});

test('gate da spec bloqueado vence a entrada global aprovada do mesmo gate', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    sdd(['event', 'GATE_PASSED', '--gate', 'lint'], dir);
    sdd(['event', 'GATE_BLOCKED', '--gate', 'lint', '--spec', 'BIB-100', '--reason', 'erros de lint'], dir);
    const s = createDashboardService(dir, { scan: false }).getSnapshot();
    const g = s.specs.find((x) => x.id === 'BIB-100').gates.find((x) => x.name === 'GATES');
    assert.equal(g.status, 'blocked');
    assert.equal(s.specs.find((x) => x.id === 'BIB-110').gates.find((x) => x.name === 'GATES').status, 'passed');
  } finally { cleanup(dir); }
});

test('demo com --step inválido não deixa diretório temporário para trás', () => {
  const before = readdirSync(tmpdir()).filter((n) => n.startsWith('sdd-demo-')).length;
  assert.equal(runSdd(['status', '--demo', '--step', 'abc']).status, 2);
  assert.equal(readdirSync(tmpdir()).filter((n) => n.startsWith('sdd-demo-')).length, before);
});

test('rajada de eventos: 5 000 registros de trace entram de uma vez, com memória limitada', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    const svc = createDashboardService(dir, { scan: false });
    const lines = [];
    for (let i = 0; i < 5000; i++) lines.push(JSON.stringify({ v: 1, ts: new Date(Date.UTC(2026, 8, 24, 10, 0, 0, i)).toISOString(), span_id: `s${i}`, name: 'tool.completed', session: 'burst', status: i % 100 === 0 ? 'error' : 'ok', attrs: { 'sdd.agent': 'agente-frontend', 'tool.name': 'Bash', 'tool.command': `echo ${i}` } }));
    writeFile(dir, '.sdd/trace/burst.jsonl', `${lines.join('\n')}\n`);
    const t0 = Date.now();
    assert.equal(svc.poll(), true);
    const s = svc.getSnapshot();
    assert.ok(Date.now() - t0 < 5000, 'ingestão + snapshot em menos de 5 s');
    assert.equal(s.events.total, 5000 + s.state.events);
    assert.equal(s.events.recent.length, 500, 'janela em memória = events.max_displayed');
    assert.equal(s.agents.find((a) => a.name === 'agente-frontend').metrics.toolFailures, 50);
  } finally { cleanup(dir); }
});

test('somente leitura: status, sessions, doctor e dashboard --once não alteram o projeto', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    const before = treeHash(dir);
    for (const args of [['status'], ['status', '--verbose'], ['status', '--json'], ['sessions'], ['dashboard', '--once'], ['dashboard', '--once', '--tab', 'events'], ['doctor', '--dashboard']]) sdd(args, dir);
    assert.equal(treeHash(dir), before);
  } finally { cleanup(dir); }
});

test('CLI: dashboard sem TTY sugere status; --once desenha; --tab inválido é uso incorreto', () => {
  const dir = greenfieldProject();
  try {
    const r = sdd(['dashboard'], dir);
    assert.equal(r.status, 1);
    assert.match(r.out, /terminal interativo não detectado[\s\S]*sdd status --json/);
    const once = sdd(['dashboard', '--once', '--width', '90', '--height', '30', '--ascii'], dir);
    assert.equal(once.status, 0, once.out);
    assert.equal(once.stdout.trimEnd().split('\n').length, 30);
    assert.match(once.stdout, /\[1 Overview\]/);
    assert.equal(sdd(['dashboard', '--once', '--tab', 'nada'], dir).status, 2);
  } finally { cleanup(dir); }
});

test('CLI: status humano tem as seções, --verbose mostra a origem, --demo marca DEMO DATA', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    const r = sdd(['status', '--no-scan'], dir);
    assert.equal(r.status, 0);
    for (const k of ['Saúde', 'Progresso', 'Requisitos', 'Tarefas', 'Agentes ativos', 'Testes', 'Segurança', 'Gate atual', 'Entrega']) assert.match(r.stdout, new RegExp(`^${k}`, 'm'), k);
    assert.match(sdd(['status', '--verbose', '--no-scan'], dir).stdout, /overall = Σ\(peso × %\)/);
    const demo = runSdd(['status', '--demo', '--json']);
    assert.equal(JSON.parse(demo.stdout).demo, true);
    assert.match(runSdd(['status', '--demo']).stdout, /DEMO DATA/);
  } finally { cleanup(dir); }
});

test('CLI: sessions lista as sessões; status --session filtra a atividade', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    traceEvent(dir, { session: 'sess-1', name: 'session.started', attrs: {} });
    traceEvent(dir, { session: 'sess-1', name: 'tool.called', attrs: { 'tool.name': 'Read', 'file.path': 'a.ts' } });
    traceEvent(dir, { session: 'sess-2', name: 'tool.called', attrs: { 'tool.name': 'Read', 'file.path': 'b.ts' } });
    const list = JSON.parse(sdd(['sessions', '--json'], dir).stdout).sessions.map((s) => s.id).sort();
    assert.deepEqual(list, ['sess-1', 'sess-2']);
    assert.match(sdd(['sessions'], dir).stdout, /sess-1/);
    const scoped = statusJson(dir, ['--session', 'sess-2']);
    assert.equal(scoped.session.id, 'sess-2');
    assert.equal(scoped.autonomy.actions, 1);
  } finally { cleanup(dir); }
});

test('doctor --dashboard: fontes legíveis e snapshot gerado; entra no --full', () => {
  const dir = greenfieldProject();
  try {
    const r = sdd(['doctor', '--dashboard', '--json'], dir);
    const j = JSON.parse(r.stdout);
    assert.ok(j.checks.some((c) => c.id === 'dashboard.snapshot' && c.status === 'pass'));
    assert.ok(j.checks.some((c) => c.id === 'dashboard.terminal' && c.status === 'skip'), 'sem TTY não é falha');
    const full = JSON.parse(sdd(['doctor', '--full', '--json'], dir).stdout);
    assert.ok(full.checks.some((c) => c.group === 'Dashboard'));
  } finally { cleanup(dir); }
});

test('hooks: PreToolUse registra tool.called com tool_use_id; PostToolUse pareia e marca MCP', () => {
  const dir = greenfieldProject();
  try {
    const hook = (event, input) => runNode(HOOK, [event], { cwd: dir, input: JSON.stringify({ cwd: dir, session_id: 'sess-h', ...input }), env: { CLAUDE_PROJECT_DIR: dir } });
    const pre = hook('pre-tool-use', { tool_name: 'mcp__context7__get-library-docs', tool_use_id: 'toolu_1', tool_input: { libraryName: 'vue' } });
    assert.equal(pre.stdout, '', 'permitido: sem decisão impressa');
    hook('post-tool-use', { tool_name: 'mcp__context7__get-library-docs', tool_use_id: 'toolu_1', tool_input: {}, tool_response: { ok: true } });
    const deny = hook('pre-tool-use', { tool_name: 'Read', tool_use_id: 'toolu_2', tool_input: { file_path: join(dir, '.env') } });
    assert.equal(JSON.parse(deny.stdout).hookSpecificOutput.permissionDecision, 'deny', 'a decisão sai antes (e independente) do trace');
    const bad = hook('pre-tool-use', { tool_name: 'Bash', tool_input: null });
    assert.equal(bad.status, 0);
    assert.doesNotMatch(bad.stderr, /erro interno/, 'input malformado não quebra o hook');
    hook('post-tool-use', { tool_name: 'Bash', tool_use_id: 'toolu_9', tool_input: { command: 'ls' }, duration_ms: 12.5 });
    assert.doesNotThrow(() => toOtlp(readdirSync(join(dir, '.sdd', 'trace')).flatMap((f) => readFile(dir, `.sdd/trace/${f}`).trim().split('\n').map((l) => ({ source: 'trace', ...JSON.parse(l) })))), 'duração fracionária não quebra o export OTLP');
    const s = createDashboardService(dir, { scan: false }).getSnapshot();
    const m = s.mcp.servers.find((x) => x.name === 'context7');
    assert.equal(m.calls, 1);
    assert.equal(m.status, 'observed', 'observado, mas fora do .mcp.json do projeto');
    assert.equal(s.security.policy.deny, 1);
    assert.equal(s.autonomy.actions, 4, 'MCP (pareada) + deny + Bash com input nulo + conclusão sem tool.called');
    assert.equal(s.autonomy.policyBlocked, 1);
  } finally { cleanup(dir); }
});

test('event --suite/--passed/--failed/--coverage validam e gravam em meta', () => {
  const dir = greenfieldProject();
  try {
    sdd(['tasks', 'sync'], dir);
    assert.equal(sdd(['event', 'TEST_FAILED', '--spec', 'BIB-100', '--failed', 'dois'], dir).status, 2);
    assert.equal(sdd(['event', 'TEST_FAILED', '--spec', 'BIB-100', '--coverage', '140'], dir).status, 2);
    assert.equal(sdd(['event', 'TEST_FAILED', '--spec', 'BIB-100', '--suite', 'e2e', '--passed', '8', '--failed', '4', '--total', '12', '--coverage', '71.5'], dir).status, 0);
    const last = readFile(dir, '.sdd/events.jsonl').trim().split('\n').pop();
    assert.deepEqual(JSON.parse(last).meta, { suite: 'e2e', passed: 8, failed: 4, total: 12, coverage: 71.5 });
  } finally { cleanup(dir); }
});

test('config: bloco dashboard válido passa; peso fora de 0–1 é erro de schema; visão .md mantém o bloco', () => {
  const ok = baseConfig({ dashboard: { progress: { implementation: 0.6, tests: 0.4 }, health: { retry_warning: 2, critical_security: 'degraded' } } });
  const dir = tempProject({ 'sdd.config.yaml': stringifyYaml(ok) });
  try {
    assert.equal(sdd(['config', 'validate'], dir).status, 0);
    assert.equal(sdd(['config', 'render'], dir).status, 0);
    assert.match(readFile(dir, 'sdd.config.md'), /dashboard:/);
    writeFile(dir, 'sdd.config.yaml', stringifyYaml(baseConfig({ dashboard: { progress: { tests: 2 } } })));
    assert.equal(sdd(['config', 'validate'], dir).status, 1);
  } finally { cleanup(dir); }
});

test('telemetria sanitizada em todos os consumidores: evento, trace, snapshot e OTLP', () => {
  const dir = greenfieldProject();
  const token = ['sk-ant-', 'a'.repeat(30)].join('');
  try {
    sdd(['tasks', 'sync'], dir);
    appendEvent(dir, { type: 'TASK_BLOCKED', task: 'BIB-100/T-001', meta: { reason: `falhou com ${token}` } });
    traceEvent(dir, { session: 's', name: 'tool.completed', attrs: { 'tool.name': 'Bash', 'tool.command': `curl -H "Authorization: Bearer ${'b'.repeat(40)}"`, authorization: 'segredo-sem-padrao' } });
    const raw = readFile(dir, '.sdd/events.jsonl') + readdirSync(join(dir, '.sdd', 'trace')).map((f) => readFile(dir, `.sdd/trace/${f}`)).join('');
    assert.ok(!raw.includes(token) && !raw.includes('b'.repeat(40)) && !raw.includes('segredo-sem-padrao'));
    const snap = JSON.stringify(toStatusJson(createDashboardService(dir, { scan: false }).getSnapshot())) + JSON.stringify(createDashboardService(dir, { scan: false }).getSnapshot().events);
    assert.ok(!snap.includes(token));
    const otlp = JSON.stringify(toOtlp([{ ts: new Date().toISOString(), trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), name: 'x', status: 'ok', source: 'trace', attrs: { password: 'p4ss', 'tool.command': `echo ${token}` } }]));
    assert.ok(!otlp.includes('p4ss') && !otlp.includes(token));
  } finally { cleanup(dir); }
});

test('demo nunca escreve no projeto do usuário e se apaga ao sair', () => {
  const dir = greenfieldProject();
  try {
    const before = treeHash(dir);
    const r = sdd(['dashboard', '--demo', '--once', '--step', '5'], dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.stdout, /DEMO DATA/);
    assert.equal(treeHash(dir), before);
    const leftovers = readdirSync(tmpdir()).filter((n) => n.startsWith('sdd-demo-') && existsSync(join(tmpdir(), n, 'DEMO-DATA.txt')));
    assert.ok(leftovers.length < 50, 'demos temporárias são removidas');
  } finally { cleanup(dir); }
});
