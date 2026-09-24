// Métricas do dashboard: progresso ponderado, saúde (projeto e agente), gates por spec, prontidão
// de entrega, qualidade, segurança, rastreabilidade e configuração. Tudo determinístico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { implementationProgress, overallProgress, taskWeights, requirementsProgress, testsProgress, metric, unavailable } from '../../../scripts/lib/dashboard/metrics/progress.mjs';
import { agentHealth, projectHealth } from '../../../scripts/lib/dashboard/metrics/health.mjs';
import { specGates, currentStage, deliveryReadiness, projectPipeline } from '../../../scripts/lib/dashboard/metrics/gates.mjs';
import { securitySummary } from '../../../scripts/lib/dashboard/metrics/security.mjs';
import { qualitySummary } from '../../../scripts/lib/dashboard/metrics/quality.mjs';
import { parseRequirements, adrMentions, adrKey, requirementStatus, whyChain, UNKNOWN } from '../../../scripts/lib/dashboard/traceability.mjs';
import { resolveDashboardConfig, DEFAULT_HEALTH, DEFAULT_WEIGHTS } from '../../../scripts/lib/dashboard/defaults.mjs';
import { Ring } from '../../../scripts/lib/dashboard/event-store.mjs';
import { sanitize, isSensitiveKey } from '../../../scripts/lib/sanitize.mjs';
import { redact } from '../../../scripts/lib/secrets.mjs';

const task = (id, status, extra = {}) => ({ id, status, weight: 1, role: 'build', agent: 'agente-backend', title: id, startedAt: null, completedAt: null, blockedReason: null, evidence: null, ...extra });
const H = { ...DEFAULT_HEALTH };

test('progresso de implementação usa o peso das tarefas e ignora canceladas', () => {
  const m = implementationProgress([task('a', 'completed', { weight: 3 }), task('b', 'pending'), task('c', 'cancelled', { weight: 10 })]);
  assert.deepEqual([m.done, m.total, m.percent], [3, 4, 75]);
  assert.equal(implementationProgress([]).available, false);
});

test('pesos das tarefas vêm do frontmatter `pesos`; valor inválido vira aviso e peso 1', () => {
  const { weights, warnings } = taskWeights([{ file: 'specs/tasks/S.md', spec: 'S', fm: { pesos: { 'T-001': 3, 'T-002': 'x' } } }]);
  assert.equal(weights.get('S/T-001'), 3);
  assert.equal(weights.has('S/T-002'), false);
  assert.equal(warnings.length, 1);
});

test('overall: ponderado só sobre dimensões disponíveis e exige tarefas', () => {
  const dims = { implementation: metric(1, 2, 'x'), requirements: metric(0, 4, 'x'), tests: unavailable('x'), security: metric(1, 1, 'x'), documentation: metric(1, 1, 'x') };
  const o = overallProgress(dims, DEFAULT_WEIGHTS);
  assert.deepEqual(o.used, ['implementation', 'requirements', 'security', 'documentation']);
  assert.equal(o.percent, Math.round(((0.45 * 50 + 0.25 * 0 + 0.1 * 100 + 0.05 * 100) / 0.85) * 10) / 10);
  const none = overallProgress({ ...dims, implementation: unavailable('x') }, DEFAULT_WEIGHTS);
  assert.equal(none.percent, null, 'segurança e documentação sozinhas não viram progresso');
});

test('requisitos e testes sem registro contam 0 de N (fato), não saem do cálculo', () => {
  const specs = [{ id: 'S', state: null, requirements: [{ status: 'unknown' }, { status: 'unknown' }] }];
  assert.deepEqual([requirementsProgress(specs, false).done, requirementsProgress(specs, false).total], [0, 2]);
  assert.equal(testsProgress({ specsWithTests: 0, specsPassing: 0 }, 3).percent, 0);
  assert.equal(testsProgress({ specsWithTests: 0, specsPassing: 0 }, 0).available, false);
});

test('saúde do agente: limiares configuráveis e razões com números', () => {
  const base = { observed: true, metrics: { retries: 0, toolFailures: 0, policyBlocks: 0, maxRepeat: 0 }, context: { available: false }, blockedTasks: [], failingTest: null, rejections: 0, taskMinutes: null, staleMinutes: null };
  assert.equal(agentHealth(base, H).status, 'HEALTHY');
  assert.equal(agentHealth({ ...base, observed: false }, H).status, 'UNKNOWN', 'sem dados não é saudável');
  const att = agentHealth({ ...base, metrics: { ...base.metrics, retries: 4 }, context: { available: true, percent: 78, source: 't' } }, H);
  assert.equal(att.status, 'ATTENTION');
  assert.deepEqual(att.reasons.map((r) => r.message), ['4 retries (≥ 3)', 'contexto em 78% (≥ 75%)']);
  assert.equal(agentHealth({ ...base, metrics: { ...base.metrics, maxRepeat: 9 } }, H).status, 'DEGRADED');
  assert.equal(agentHealth({ ...base, blockedTasks: ['S/T-1'] }, H).status, 'BLOCKED');
  assert.equal(agentHealth({ ...base, metrics: { ...base.metrics, retries: 4 } }, { ...H, retry_warning: 10, retry_critical: 20 }).status, 'HEALTHY', 'limiar da config vale');
});

test('saúde do projeto: gate bloqueado e achado crítico bloqueiam (configurável para degraded)', () => {
  const base = { isSddProject: true, truncated: false, blockedGates: [], criticalSecurity: 0, configErrors: 0, graphErrors: 0, anomalies: 0, failingTests: [], blockedTasks: 0, agents: [], policyDeny: 0, rejected: [], drift: 0, invalidLines: 0, configWarnings: 0, noState: false };
  assert.equal(projectHealth(base, H).status, 'HEALTHY');
  assert.equal(projectHealth({ ...base, isSddProject: false }, H).status, 'UNKNOWN');
  assert.equal(projectHealth({ ...base, blockedGates: ['security'] }, H).status, 'BLOCKED');
  assert.equal(projectHealth({ ...base, criticalSecurity: 1 }, { ...H, critical_security: 'degraded' }).status, 'DEGRADED');
  assert.equal(projectHealth({ ...base, failingTests: ['S'] }, H).status, 'DEGRADED');
  assert.equal(projectHealth({ ...base, blockedTasks: 1 }, H).status, 'ATTENTION');
  assert.equal(projectHealth({ ...base, blockedTasks: 3 }, H).status, 'DEGRADED');
  const dup = projectHealth({ ...base, policyDeny: 1, agents: [{ name: 'a', health: { status: 'ATTENTION', reasons: [{ source: 'trace policy.decision=deny', message: 'x' }] } }] }, H);
  assert.equal(dup.reasons.length, 1, 'bloqueio de política não é repetido por agente');
});

test('gates da spec: estágio atual, reprovação do guardião e etapa não observada', () => {
  const spec = { id: 'S', file: 'specs/features/S.md' };
  const tasks = [task('S/T-1', 'completed'), task('S/T-2', 'completed', { role: 'verify' }), task('S/T-3', 'in_progress', { role: 'audit' })];
  const ctx = { spec, tasks, suites: new Map(), gates: [], required: [], hasPlan: true };
  const running = specGates({ ...ctx, st: { status: 'in_review', created: 't', plan: 'S' }, lastTest: { result: 'passed', ts: 't' } });
  assert.deepEqual(running.map((g) => g.status), ['passed', 'passed', 'passed', 'skipped', 'running', 'pending']);
  assert.equal(currentStage(running), 'GUARDIAN');
  const rejected = specGates({ ...ctx, st: { status: 'in_progress', rejections: 1, last_rejection: 'CA-04 sem teste', plan: 'S' }, lastTest: { result: 'passed' } });
  assert.equal(rejected[4].status, 'failed');
  assert.match(rejected[4].blockingReason, /CA-04/);
  const failing = specGates({ ...ctx, st: { status: 'in_progress', plan: 'S' }, lastTest: { result: 'failed', command: 'npm test' } });
  assert.equal(failing[2].status, 'failed');
  const required = specGates({ ...ctx, st: { status: 'in_progress', plan: 'S' }, lastTest: null, required: ['dependency_audit'] });
  assert.equal(required[3].status, 'pending', 'gate obrigatório sem GATE_PASSED fica pendente');
  const blocked = specGates({ ...ctx, st: { status: 'in_progress', plan: 'S' }, lastTest: null, gates: [{ gate: 'security', spec: null, status: 'blocked', ts: 't', reason: 'CVE' }] });
  assert.equal(blocked[3].status, 'blocked');
});

test('prontidão de entrega: UNKNOWN sem estado, BLOCKED com impedimento, READY com tudo implementado', () => {
  const mk = (state) => [{ id: 'S', state, gates: [], currentGate: state === 'implemented' ? null : 'GUARDIAN' }];
  const pipe = { pipeline: [] };
  const base = { tasks: [], state: { gates: {}, tests: { by_spec: {} } }, hasState: true, truncated: false, criticalSecurity: 0, pipeline: pipe };
  assert.equal(deliveryReadiness({ ...base, specs: mk('in_progress'), hasState: false }).status, 'UNKNOWN');
  assert.equal(deliveryReadiness({ ...base, specs: mk('in_progress') }).status, 'NOT_READY');
  assert.equal(deliveryReadiness({ ...base, specs: mk('implemented') }).status, 'READY');
  assert.equal(deliveryReadiness({ ...base, specs: mk('in_progress'), state: { gates: { x: { gate: 'sec', status: 'blocked', spec: null } }, tests: { by_spec: {} } } }).status, 'BLOCKED');
  assert.equal(deliveryReadiness({ ...base, specs: mk('in_progress'), tasks: [task('S/T', 'blocked')] }).status, 'BLOCKED');
  assert.equal(deliveryReadiness({ ...base, specs: mk('implemented'), criticalSecurity: 1 }).status, 'BLOCKED');
});

test('pipeline do projeto: pior status por etapa e etapa atual mais atrasada', () => {
  const g = (sts) => ['SPEC', 'CODE', 'TEST', 'GATES', 'GUARDIAN', 'DELIVERY'].map((name, i) => ({ name, status: sts[i] }));
  const p = projectPipeline([
    { id: 'A', state: 'in_progress', gates: g(['passed', 'passed', 'running', 'skipped', 'pending', 'pending']) },
    { id: 'B', state: 'in_progress', gates: g(['passed', 'running', 'pending', 'skipped', 'pending', 'pending']) },
  ]);
  assert.deepEqual(p.current, { stage: 'CODE', spec: 'B' });
  assert.equal(p.pipeline[1].status, 'running');
});

test('segurança: scanner que não rodou é NOT_RUN; segredo versionado vira crítico', () => {
  const policy = { deny: 0, ask: 0, decisions: new Ring(5) };
  const guards = { sandbox: { status: 'INACTIVE' }, hooks: { status: 'ACTIVE' }, policy: { status: 'ACTIVE' }, trace: { status: 'ACTIVE' } };
  const none = securitySummary({ guards, secretChecks: null, agentScan: null, config: {}, gates: {}, policy });
  assert.ok(none.scans.every((s) => s.status !== 'PASS'), 'nada roda → nada passa');
  const hit = securitySummary({ guards, secretChecks: [{ id: 'secrets.content', status: 'fail', title: 'x', details: ['a.js:1: possível aws-access-key', 'b.js:2: possível jwt'] }, { id: 'secrets.tracked-files', status: 'pass', title: 'ok', details: [] }], agentScan: null, config: {}, gates: {}, policy });
  assert.equal(hit.findings.critical, 1);
  assert.equal(hit.findings.medium, 1);
});

test('qualidade: contagens por suíte só quando o evento as trouxe', () => {
  const tests = new Map([['S', new Map([['unit', { result: 'passed', ts: 't', command: 'x', passed: 142, failed: 6, skipped: 0, total: 148, coverage: 84 }]])]]);
  const q = qualitySummary({ specs: [{ id: 'S', state: 'in_progress' }, { id: 'T', state: 'in_progress' }], state: { tests: { by_spec: { S: { result: 'failed' } } } }, testsIndex: tests, evals: [{ suite: 'deterministic', total: 10, passed: 9 }] });
  assert.deepEqual(q.totals, { passed: 142, failed: 6, skipped: 0, total: 148 });
  assert.equal(q.specsFailing, 1);
  assert.equal(q.failedChecks, 2);
  assert.equal(qualitySummary({ specs: [], state: { tests: { by_spec: {} } }, testsIndex: new Map(), evals: [] }).totals, null);
});

test('rastreabilidade: requisitos numerados, ADRs normalizados, status pelo guardião, UNKNOWN sem vínculo', () => {
  const reqs = parseRequirements('---\nspec-id: S\n---\n\n- **RF-01**: faz X\n- **CA-01**: X verificável\n- CA-02 — sem dois pontos\n- **CA-01**: repetido\n');
  assert.deepEqual(reqs.map((r) => r.id), ['RF-01', 'CA-01', 'CA-02']);
  assert.equal(reqs[0].line, 5);
  assert.deepEqual(adrMentions('ver ADR-006 e ADR-0006'), ['ADR-006', 'ADR-0006']);
  assert.equal(adrKey('ADR-006'), adrKey('ADR-0006'));
  assert.equal(requirementStatus({ status: 'approved' }, true).status, 'verified');
  assert.equal(requirementStatus(null, false).status, 'unknown');
  const snap = { specs: [{ id: 'S', title: 'S', file: 'f', adrs: [], taskIds: ['S/T-1'], requirements: [{ id: 'CA-01', text: 'x', file: 'f', line: 1, tasks: [], implementation: [], testRefs: [] }] }], tasks: [{ id: 'S/T-1', spec: 'S', title: 't', agent: 'a', requirements: [], files: [] }], files: [] };
  const w = whyChain(snap, { kind: 'task', id: 'S/T-1' });
  assert.deepEqual(w.nodes.filter((n) => n.id === UNKNOWN).map((n) => n.kind), ['pedido', 'requisito', 'arquivo', 'teste']);
  assert.match(whyChain(snap, { kind: 'file', id: 'x.ts' }).notes[0], /No traceability metadata available/);
});

test('config do dashboard: defaults, validação semântica e pesos zerados', () => {
  assert.equal(resolveDashboardConfig(null).settings.progress.implementation, 0.45);
  const r = resolveDashboardConfig({ dashboard: { progress: { implementation: 0, requirements: 0, tests: 0, security: 0, documentation: 0 }, health: { retry_warning: -1, critical_security: 'talvez' } } });
  assert.deepEqual(r.settings.progress, { ...DEFAULT_WEIGHTS });
  assert.equal(r.settings.health.retry_warning, 3);
  assert.equal(r.settings.health.critical_security, 'blocked');
  assert.equal(r.warnings.length, 3);
});

test('sanitizer central: valor, chave de credencial, Bearer e Basic', () => {
  assert.equal(redact(`Authorization: Bearer ${'x'.repeat(24)}`), 'Authorization: Bearer [REDACTED:bearer-token]');
  assert.match(redact(`Authorization: Basic ${'dXNlcjpwYXNzd29yZA=='}`), /Basic \[REDACTED:basic-auth\]/);
  assert.equal(redact('Authorization: Bearer ${TOKEN}'), 'Authorization: Bearer ${TOKEN}', 'referência a variável não é segredo');
  const s = sanitize({ headers: { Authorization: 'Bearer abc', 'X-Api-Key': 'k' }, prompt_tokens: 120, nested: [{ password: 'p' }], ok: 'texto' });
  assert.equal(s.headers.Authorization, '[REDACTED]');
  assert.equal(s.headers['X-Api-Key'], '[REDACTED]');
  assert.equal(s.prompt_tokens, 120, 'contagem não é segredo');
  assert.equal(s.nested[0].password, '[REDACTED]');
  assert.equal(s.ok, 'texto');
  for (const k of ['github_token', 'DATABASE_PASSWORD', 'x_api_key', 'db-password', 'client_secret', 'set-cookie', 'meta.api_key']) assert.equal(isSensitiveKey(k), true, k);
  for (const k of ['sdd.task', 'prompt_tokens', 'tool.use_id', 'tool.name', 'token_count', 'file.path']) assert.equal(isSensitiveKey(k), false, k);
});

test('qualidade: suíte com contagem incompleta fica fora do total e é contada como parcial', () => {
  const tests = new Map([['S', new Map([['unit', { result: 'failed', ts: 't', command: 'x', passed: 8, failed: null, skipped: null, total: null, coverage: null }], ['e2e', { result: 'passed', ts: 't', command: 'y', passed: 3, failed: 0, skipped: null, total: null, coverage: null }]])]]);
  const q = qualitySummary({ specs: [{ id: 'S', state: 'in_progress' }], state: { tests: { by_spec: {} } }, testsIndex: tests, evals: [] });
  assert.deepEqual(q.totals, { passed: 3, failed: 0, skipped: 0, total: 3 });
  assert.equal(q.partialSuites, 1);
});

test('segurança sem git: arquivo sensível/segredo local conta como médio, não crítico', () => {
  const policy = { deny: 0, ask: 0, decisions: new Ring(5) };
  const guards = { sandbox: { status: 'INACTIVE' }, hooks: { status: 'ACTIVE' }, policy: { status: 'ACTIVE' }, trace: { status: 'ACTIVE' } };
  const checks = [{ id: 'secrets.tracked-files', status: 'fail', title: 'x', details: ['.env parece segredo'] }];
  assert.equal(securitySummary({ guards, secretChecks: checks, agentScan: null, config: {}, gates: {}, policy, tracked: true }).findings.critical, 1);
  const local = securitySummary({ guards, secretChecks: checks, agentScan: null, config: {}, gates: {}, policy, tracked: false });
  assert.deepEqual([local.findings.critical, local.findings.medium], [0, 1]);
});

test('segurança: dependency_audit bloqueado em uma spec vence a aprovação global anterior', () => {
  const policy = { deny: 0, ask: 0, decisions: new Ring(5) };
  const guards = { sandbox: { status: 'INACTIVE' }, hooks: { status: 'ACTIVE' }, policy: { status: 'ACTIVE' }, trace: { status: 'ACTIVE' } };
  const config = { engineering_gates: { dependency_audit: { enabled: true, blocking: true } } };
  const gates = {
    '*::dependency_audit': { gate: 'dependency_audit', spec: null, status: 'passed', ts: '2026-09-24T10:00:00.000Z', reason: null },
    'S-110::dependency_audit': { gate: 'dependency_audit', spec: 'S-110', status: 'blocked', ts: '2026-09-24T11:00:00.000Z', reason: 'CVE' },
  };
  const s = securitySummary({ guards, secretChecks: null, agentScan: null, config, gates, policy });
  const scan = s.scans.find((x) => x.id === 'dependency_audit');
  assert.equal(scan.status, 'FAIL');
  assert.match(scan.detail, /blocked@S-110/);
  assert.equal(s.findings.high, 1);
  const newer = securitySummary({ guards, secretChecks: null, agentScan: null, config, gates: { a: { ...gates['*::dependency_audit'] }, b: { gate: 'dependency_audit', spec: 'S-110', status: 'passed', ts: '2026-09-24T12:00:00.000Z' } }, policy });
  assert.match(newer.scans.find((x) => x.id === 'dependency_audit').detail, /12:00/, 'sem bloqueio, vale a entrada mais recente');
});

test('sanitize com redactKeys: false preserva chaves que são IDs e ainda redige os valores', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  const state = { gates: { 'S::no-secret': { gate: 'no-secret', status: 'blocked', reason: `vazou ${token}` } } };
  assert.equal(sanitize(state).gates['S::no-secret'], '[REDACTED]', 'padrão: chave de credencial é redigida');
  const kept = sanitize(state, { redactKeys: false }).gates['S::no-secret'];
  assert.equal(kept.status, 'blocked');
  assert.ok(!kept.reason.includes(token), 'o valor continua passando pelos padrões de segredo');
});
