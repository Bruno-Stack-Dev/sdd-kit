import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, applyEvent, emptyState } from '../../../scripts/lib/state.mjs';
import { validateEvent } from '../../../scripts/lib/events.mjs';

let n = 0;
const ev = (type, fields = {}) => ({ v: 1, id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, ts: '2026-09-23T10:00:00.000Z', type, ...fields });

function happyPath() {
  return [
    ev('SESSION_STARTED', { session: 's1' }),
    ev('SPEC_CREATED', { spec: 'S-100' }),
    ev('PLAN_CREATED', { spec: 'S-100' }),
    ev('TASK_CREATED', { task: 'S-100/T-001', agent: 'agente-frontend' }),
    ev('TASK_CREATED', { task: 'S-100/T-002', agent: 'agente-spec-guardian' }),
    ev('TASK_STARTED', { task: 'S-100/T-001' }),
    ev('TASK_COMPLETED', { task: 'S-100/T-001' }),
    ev('TEST_PASSED', { spec: 'S-100', meta: { command: 'npm test' } }),
    ev('TASK_STARTED', { task: 'S-100/T-002' }),
    ev('GUARDIAN_STARTED', { spec: 'S-100' }),
    ev('GUARDIAN_APPROVED', { spec: 'S-100', meta: { evidence: 'relatorio.md' } }),
    ev('TASK_COMPLETED', { task: 'S-100/T-002' }),
    ev('SPEC_IMPLEMENTED', { spec: 'S-100' }),
    ev('SESSION_FINISHED', { session: 's1' }),
  ];
}

test('caminho feliz: spec chega a implemented sem anomalias', () => {
  const s = reduce(happyPath(), {}, validateEvent);
  assert.deepEqual(s.anomalies, []);
  assert.equal(s.specs['S-100'].status, 'implemented');
  assert.equal(s.tasks['S-100/T-002'].status, 'completed');
  assert.equal(s.events, 14);
  assert.ok(s.sessions.s1.finished);
});

test('reducer é determinístico (mesma entrada → mesmo estado)', () => {
  const evs = happyPath();
  assert.equal(JSON.stringify(reduce(evs)), JSON.stringify(reduce(structuredClone(evs))));
});

test('guardião: tarefa *-guardian não conclui sem GUARDIAN_APPROVED', () => {
  const evs = happyPath().slice(0, 9); // até TASK_STARTED da T-002
  const s = reduce(evs);
  const err = applyEvent(s, ev('TASK_COMPLETED', { task: 'S-100/T-002' }));
  assert.match(err, /só conclui depois de GUARDIAN_APPROVED/);
  assert.equal(s.tasks['S-100/T-002'].status, 'in_progress', 'estado não muda quando o evento é recusado');
});

test('GUARDIAN_APPROVED exige revisão iniciada e evidência', () => {
  const s = reduce(happyPath().slice(0, 7));
  assert.match(applyEvent(s, ev('GUARDIAN_APPROVED', { spec: 'S-100', meta: { evidence: 'x' } })), /não está em revisão/);
  applyEvent(s, ev('GUARDIAN_STARTED', { spec: 'S-100' }));
  assert.match(applyEvent(s, ev('GUARDIAN_APPROVED', { spec: 'S-100' })), /exige evidência/);
});

test('GUARDIAN_REJECTED volta a spec para in_progress e exige motivo', () => {
  const s = reduce(happyPath().slice(0, 10));
  assert.match(applyEvent(s, ev('GUARDIAN_REJECTED', { spec: 'S-100' })), /exige o motivo/);
  assert.equal(applyEvent(s, ev('GUARDIAN_REJECTED', { spec: 'S-100', meta: { reason: 'CA-02 sem teste' } })), null);
  assert.equal(s.specs['S-100'].status, 'in_progress');
  assert.equal(s.specs['S-100'].rejections, 1);
  assert.equal(s.specs['S-100'].last_rejection, 'CA-02 sem teste');
});

test('SPEC_IMPLEMENTED recusado: sem aprovação, com tarefa aberta, teste falho ou gate bloqueado', () => {
  let s = reduce(happyPath().slice(0, 9));
  assert.match(applyEvent(s, ev('SPEC_IMPLEMENTED', { spec: 'S-100' })), /só vira implementada depois de GUARDIAN_APPROVED/);

  s = reduce(happyPath().slice(0, 11)); // aprovada, T-002 ainda em andamento
  assert.match(applyEvent(s, ev('SPEC_IMPLEMENTED', { spec: 'S-100' })), /tarefas abertas: S-100\/T-002/);

  s = reduce([...happyPath().slice(0, 12), ev('TEST_FAILED', { spec: 'S-100' })]);
  assert.match(applyEvent(s, ev('SPEC_IMPLEMENTED', { spec: 'S-100' })), /último teste .* falhou/);

  s = reduce([...happyPath().slice(0, 12), ev('GATE_BLOCKED', { gate: 'coverage', spec: 'S-100', meta: { reason: '72%' } })]);
  assert.match(applyEvent(s, ev('SPEC_IMPLEMENTED', { spec: 'S-100' })), /gate\(s\) bloqueado\(s\): coverage/);
});

test('SPEC_UPDATED depois da aprovação invalida a aprovação', () => {
  const s = reduce([...happyPath().slice(0, 11), ev('SPEC_UPDATED', { spec: 'S-100' })]);
  assert.equal(s.specs['S-100'].status, 'in_progress');
  assert.ok(s.specs['S-100'].approval_invalidated);
});

test('tarefas: bloqueio exige motivo; não conclui o que não começou; dependência pendente', () => {
  const graph = { tasks: new Map([['S-100/T-002', { id: 'S-100/T-002', dependsOn: ['S-100/T-001'], spec: 'S-100' }]]) };
  const s = reduce(happyPath().slice(0, 5));
  assert.match(applyEvent(s, ev('TASK_BLOCKED', { task: 'S-100/T-001' })), /exige um motivo/);
  assert.match(applyEvent(s, ev('TASK_COMPLETED', { task: 'S-100/T-001' })), /só uma tarefa em andamento/);
  assert.match(applyEvent(s, ev('TASK_STARTED', { task: 'S-100/T-002' }), { graph }), /dependências não concluídas: S-100\/T-001/);
  assert.equal(applyEvent(s, ev('TASK_STARTED', { task: 'S-100/T-002', meta: { force: true } }), { graph }), null);
});

test('evento com chave repetida é ignorado (idempotência)', () => {
  const evs = [ev('SPEC_CREATED', { spec: 'S-1', key: 'spec-created:S-1' }), ev('SPEC_CREATED', { spec: 'S-1', key: 'spec-created:S-1' })];
  const s = reduce(evs);
  assert.equal(s.duplicates, 1);
  assert.deepEqual(s.anomalies, []);
});

test('transição inválida vira anomalia e não altera o estado', () => {
  const s = reduce([ev('TASK_STARTED', { task: 'X/T-001' }), ev('SPEC_CREATED', { spec: 'S-1' })]);
  assert.equal(s.anomalies.length, 1);
  assert.equal(s.events, 1);
});

test('schema: evento malformado vira anomalia', () => {
  const s = reduce([{ v: 1, id: 'nao-uuid', ts: 'ontem', type: 'SPEC_CREATED', spec: 'S-1' }], {}, validateEvent);
  assert.equal(s.anomalies.length, 1);
  assert.match(s.anomalies[0].error, /\/id/);
});

test('importação v2: LEDGER_IMPORTED e imported_status no TASK_CREATED', () => {
  const s = reduce([
    ev('LEDGER_IMPORTED', { meta: { specs: [{ spec: 'S-1', state: 'feita' }, { spec: 'S-2', state: 'em-andamento' }] } }),
    ev('TASK_CREATED', { task: 'S-2/T-001', meta: { imported_status: 'completed' } }),
  ]);
  assert.equal(s.specs['S-1'].status, 'implemented');
  assert.equal(s.specs['S-1'].imported, true);
  assert.equal(s.specs['S-2'].status, 'in_progress');
  assert.equal(s.tasks['S-2/T-001'].status, 'completed');
  assert.equal(s.tasks['S-2/T-001'].imported, true);
});

test('estado vazio tem versão e estrutura fixas', () => {
  const s = emptyState();
  assert.equal(s.v, 1);
  assert.deepEqual(Object.keys(s.tests), ['last', 'by_spec']);
});
