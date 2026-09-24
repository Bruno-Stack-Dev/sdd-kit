// Event store do dashboard: leitura incremental, linhas parciais/corrompidas, rotação, UTF-8 partido,
// normalização dos dois logs e índice de atividade (latência, loops, autonomia, memória limitada).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, cleanup } from '../../helpers.mjs';
import { JsonlTail, TraceDirTail, ActivityIndex, Ring, normalizeDomain, normalizeTrace } from '../../../scripts/lib/dashboard/event-store.mjs';
import { autonomyMetrics } from '../../../scripts/lib/dashboard/metrics/autonomy.mjs';

const rec = (name, attrs = {}, extra = {}) => ({ v: 1, ts: extra.ts ?? '2026-09-24T10:00:00.000Z', span_id: extra.id ?? Math.random().toString(16).slice(2), name, session: 's1', status: extra.status ?? 'ok', attrs, ...(extra.duration_ms !== undefined ? { duration_ms: extra.duration_ms } : {}) });

test('JsonlTail lê só o que foi acrescentado e segura a linha sem \\n até completar', () => {
  const dir = tempProject({});
  try {
    const f = join(dir, 'log.jsonl');
    writeFileSync(f, '{"a":1}\n{"a":2}\n');
    const t = new JsonlTail(f);
    assert.deepEqual(t.read().records.map((r) => r.a), [1, 2]);
    assert.deepEqual(t.read().records, [], 'sem bytes novos, nada relido');
    appendFileSync(f, '{"a":3}\n{"a":');
    assert.deepEqual(t.read().records.map((r) => r.a), [3]);
    assert.equal(t.truncatedTail, true, 'cauda parcial é visível');
    appendFileSync(f, '4}\n');
    assert.deepEqual(t.read().records.map((r) => r.a), [4]);
    assert.equal(t.truncatedTail, false);
  } finally { cleanup(dir); }
});

test('JsonlTail: linha corrompida vira `invalid` e a leitura continua; arquivo que encolheu relê do zero', () => {
  const dir = tempProject({});
  try {
    const f = join(dir, 'log.jsonl');
    writeFileSync(f, '{"a":1}\nisto não é json\n[1,2]\n{"a":2}\n');
    const t = new JsonlTail(f);
    const r = t.read();
    assert.deepEqual(r.records.map((x) => x.a), [1, 2]);
    assert.deepEqual(t.invalid.map((i) => i.line), [2, 3]);
    writeFileSync(f, '{"a":9}\n');
    const again = t.read();
    assert.equal(again.reset, true, 'rotação/truncamento detectado');
    assert.deepEqual(again.records.map((x) => x.a), [9]);
  } finally { cleanup(dir); }
});

test('JsonlTail não quebra caractere UTF-8 dividido entre leituras', () => {
  const dir = tempProject({});
  try {
    const f = join(dir, 'log.jsonl');
    const line = Buffer.from(`${JSON.stringify({ t: 'ação' })}\n`, 'utf8');
    const cut = line.indexOf(0xc3) + 1; // no meio do "ç"
    writeFileSync(f, line.subarray(0, cut));
    const t = new JsonlTail(f);
    assert.deepEqual(t.read().records, []);
    appendFileSync(f, line.subarray(cut));
    assert.equal(t.read().records[0].t, 'ação');
  } finally { cleanup(dir); }
});

test('TraceDirTail acompanha sessões novas e o sumiço de arquivos', () => {
  const dir = tempProject({ 'trace/a.jsonl': `${JSON.stringify(rec('tool.called'))}\n` });
  try {
    const t = new TraceDirTail(join(dir, 'trace'));
    assert.equal(t.read().records.length, 1);
    writeFileSync(join(dir, 'trace', 'b.jsonl'), `${JSON.stringify(rec('tool.called'))}\n`);
    assert.equal(t.changed(), true);
    assert.equal(t.read().records.length, 1, 'só a sessão nova');
    assert.equal(t.changed(), false);
  } finally { cleanup(dir); }
});

test('normalização: rótulos por categoria, política, MCP e LSP, com sanitização', () => {
  const token = 'ghp_' + 'z9'.repeat(18);
  const n = normalizeTrace(rec('tool.completed', { 'tool.name': 'Bash', 'tool.command': `curl -H "Authorization: Bearer ${'a'.repeat(30)}" ${token}` }, { status: 'error' }));
  assert.equal(n.category, 'tool');
  assert.equal(n.label, 'TOOL_FAILED');
  assert.ok(!JSON.stringify(n).includes(token) && !JSON.stringify(n).includes('a'.repeat(30)), 'segredos redigidos');
  assert.equal(normalizeTrace(rec('policy.decision', { 'policy.decision': 'deny', 'tool.name': 'Read', 'file.path': '.env' })).label, 'POLICY_DENY');
  assert.equal(normalizeTrace(rec('tool.called', { 'tool.name': 'mcp__context7__get-library-docs' })).category, 'mcp');
  assert.equal(normalizeTrace(rec('tool.completed', { 'tool.name': 'LSP', 'lsp.operation': 'findReferences' })).label, 'LSP_FIND_REFERENCES');
  assert.equal(normalizeTrace(rec('tool.called', { 'tool.name': 'Read', 'file.path': 'a.ts' })).label, 'FILE_READ');
  const d = normalizeDomain({ id: 'x', ts: '2026-09-24T10:00:00Z', type: 'TEST_FAILED', spec: 'S-1', meta: { command: 'npm test', password: 'hunter22hunter22' } });
  assert.equal(d.status, 'error');
  assert.equal(d.category, 'test');
  assert.equal(d.attrs.password, '[REDACTED]', 'chave de credencial redigida');
  assert.equal(normalizeDomain({ id: 'y', ts: 't', type: 'TASK_COMPLETED', task: 'S-1/T-001' }, () => 'agente-x').agent, 'agente-x');
});

test('índice: latência pareada por tool_use_id, loop por chamadas idênticas, arquivos por tarefa', () => {
  const ix = new ActivityIndex();
  ix.add(normalizeTrace(rec('tool.called', { 'sdd.agent': 'agente-backend', 'tool.name': 'Bash', 'tool.use_id': 'u1' }, { ts: '2026-09-24T10:00:00.000Z' })));
  ix.add(normalizeTrace(rec('tool.completed', { 'sdd.agent': 'agente-backend', 'tool.name': 'Bash', 'tool.use_id': 'u1' }, { ts: '2026-09-24T10:00:00.250Z' })));
  assert.equal(ix.tools.get('Bash').durSum, 250);
  for (let i = 0; i < 6; i++) ix.add(normalizeTrace(rec('file.modified', { 'sdd.agent': 'agente-backend', 'tool.name': 'Edit', 'file.path': 'src/a.ts', 'sdd.task': 'S/T-001' })));
  const a = ix.agents.get('agente-backend');
  assert.equal(a.maxRepeat, 6);
  assert.deepEqual([...a.files], ['src/a.ts']);
  assert.deepEqual([...ix.tasks.get('S/T-001').files], ['src/a.ts']);
});

test('autonomia conta cada invocação uma vez, com trace antigo (só conclusões) misturado ao novo', () => {
  const ix = new ActivityIndex();
  ix.add(normalizeTrace(rec('tool.completed', { 'tool.name': 'Bash' }))); // antigo: sem tool.called
  ix.add(normalizeTrace(rec('tool.called', { 'tool.name': 'Bash', 'tool.use_id': 'u1' })));
  ix.add(normalizeTrace(rec('tool.completed', { 'tool.name': 'Bash', 'tool.use_id': 'u1' }))); // pareada: não conta de novo
  ix.add(normalizeTrace(rec('policy.decision', { 'tool.name': 'Read', 'policy.decision': 'deny', 'tool.use_id': 'u2' })));
  ix.add(normalizeTrace(rec('policy.decision', { 'tool.name': 'Edit', 'policy.decision': 'ask', 'tool.use_id': 'u3' })));
  ix.add(normalizeTrace(rec('file.modified', { 'tool.name': 'Edit', 'tool.use_id': 'u3' }))); // ask aprovado: mesma ação
  const m = autonomyMetrics(ix.autonomy);
  assert.equal(m.actions, 4);
  assert.equal(m.humanApprovals, 1);
  assert.equal(m.policyBlocked, 1);
  assert.equal(m.autoApproved, 2);
  assert.equal(m.percent, 50);
  assert.match(m.source, /1 conclusão\(ões\) sem par/);
  assert.equal(autonomyMetrics(new ActivityIndex().autonomy).percent, null, 'sem ações: n/d, não 0% nem 100%');
});

test('memória limitada: Ring mantém só os últimos N; rajada de eventos não cresce sem limite', () => {
  const r = new Ring(3);
  for (let i = 1; i <= 5; i++) r.push(i);
  assert.deepEqual(r.toArray(), [3, 4, 5]);
  const ix = new ActivityIndex({ maxRecent: 50, maxTimeline: 10 });
  for (let i = 0; i < 5000; i++) ix.add(normalizeTrace(rec('tool.completed', { 'sdd.agent': 'agente-x', 'tool.name': 'Bash', 'tool.command': `echo ${i}` })));
  assert.equal(ix.total, 5000);
  assert.equal(ix.recent.toArray().length, 50);
  assert.equal(ix.agents.get('agente-x').timeline.toArray().length, 10);
});

test('log de domínio: cauda JSON válida sem quebra de linha é entregue uma vez só (como readEvents)', () => {
  const dir = tempProject({});
  try {
    const f = join(dir, 'events.jsonl');
    writeFileSync(f, '{"a":1}\n{"a":2}');
    const t = new JsonlTail(f, { objectsOnly: false, acceptUnterminated: true });
    assert.deepEqual(t.read().records.map((r) => r.a), [1, 2]);
    appendFileSync(f, '\n{"a":3}\n5\n');
    assert.deepEqual(t.read().records.map((r) => r?.a ?? r), [3, 5], 'a linha 2 não volta; não-objeto segue para o reducer');
  } finally { cleanup(dir); }
});

test('loop só conta chamadas com o mesmo alvo; duas instâncias do agente só param juntas', () => {
  const ix = new ActivityIndex();
  for (let i = 0; i < 6; i++) ix.add(normalizeTrace(rec('tool.completed', { 'sdd.agent': 'agente-x', 'tool.name': 'WebFetch' })));
  assert.equal(ix.agents.get('agente-x').maxRepeat, 0, 'sem alvo conhecido não é loop');
  ix.add(normalizeTrace(rec('agent.spawned', { 'sdd.agent': 'agente-y' })));
  ix.add(normalizeTrace(rec('agent.spawned', { 'sdd.agent': 'agente-y' })));
  ix.add(normalizeTrace(rec('agent.stopped', { 'sdd.agent': 'agente-y' })));
  assert.equal(ix.agents.get('agente-y').live.get('s1').count, 1);
  ix.add(normalizeTrace(rec('agent.stopped', { 'sdd.agent': 'agente-y' })));
  assert.equal(ix.agents.get('agente-y').live.size, 0);
});

test('texto do trace sai sem caracteres de controle (sem injeção de ANSI)', () => {
  const ESC = String.fromCharCode(27);
  const n = normalizeTrace(rec('tool.completed', { 'tool.name': 'Bash', 'tool.command': `echo a\nb${ESC}[2J` }));
  assert.ok(!n.summary.includes(ESC) && !n.summary.includes('\n'));
  assert.ok(!String(n.attrs['tool.command']).includes(ESC));
});
