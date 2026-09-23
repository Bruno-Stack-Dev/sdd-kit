import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCycle, topoOrder, buildTaskGraph, buildSpecGraph, readyTasks } from '../../../scripts/lib/graph.mjs';
import { loadTasks, loadSpecs, nextSpecId, countAcceptanceCriteria, resolveTaskId } from '../../../scripts/lib/specs.mjs';
import { tempProject, cleanup } from '../../helpers.mjs';
import { spec, tasks } from '../../fixtures/project.mjs';

const AGENTS = new Set(['agente-frontend', 'agente-qa-testes', 'agente-spec-guardian']);

test('findCycle e topoOrder', () => {
  assert.equal(findCycle({ a: ['b'], b: ['c'], c: [] }), null);
  assert.deepEqual(findCycle({ a: ['b'], b: ['c'], c: ['a'] }), ['a', 'b', 'c', 'a']);
  assert.deepEqual(topoOrder({ c: ['b'], b: ['a'], a: [] }), ['a', 'b', 'c']);
});

function graphOf(files) {
  const dir = tempProject(files);
  try {
    return buildTaskGraph(loadTasks(dir), loadSpecs(dir), AGENTS);
  } finally { cleanup(dir); }
}

test('grafo válido: IDs qualificados por spec e dependências locais resolvidas', () => {
  const g = graphOf({
    'specs/features/A.md': spec('A-100'),
    'specs/tasks/A.md': tasks('A-100', [{ id: 'T-001', agent: 'agente-frontend' }, { id: 'T-002', agent: 'agente-qa-testes', deps: ['T-001'] }]),
  });
  assert.deepEqual(g.errors, []);
  assert.deepEqual(g.tasks.get('A-100/T-002').dependsOn, ['A-100/T-001']);
});

test('detecta ciclo, dependência órfã, agente desconhecido, duplicata e spec inexistente', () => {
  const g = graphOf({
    'specs/features/A.md': spec('A-100'),
    'specs/tasks/A.md': tasks('A-100', [
      { id: 'T-001', agent: 'agente-frontend', deps: ['T-002'] },
      { id: 'T-002', agent: 'agente-frontend', deps: ['T-001'] },
      { id: 'T-003', agent: 'agente-inventado', deps: ['T-009'] },
      { id: 'T-003', agent: 'agente-frontend' },
    ]),
    'specs/tasks/B.md': tasks('B-999', [{ id: 'T-001', agent: 'agente-frontend' }]),
  });
  const msgs = g.errors.map((e) => e.message).join('\n');
  assert.match(msgs, /ciclo de dependência entre tarefas/);
  assert.match(msgs, /depende de 'A-100\/T-009', que não existe/);
  assert.match(msgs, /agente '@agente-inventado' não existe/);
  assert.match(msgs, /ID de tarefa duplicado 'A-100\/T-003'/);
  assert.match(msgs, /tarefas de 'B-999', mas essa spec não existe/);
});

test('linha fora da gramática é erro com número da linha', () => {
  const g = graphOf({
    'specs/features/A.md': spec('A-100'),
    'specs/tasks/A.md': '---\ntarefas-de: A-100\n---\n- [ ] [T-001] sem agente\n',
  });
  assert.match(g.errors[0].path, /A\.md:4$/);
});

test('dependência entre specs: ciclo, inexistente e spec-id duplicado', () => {
  const g = buildSpecGraph([
    { id: 'A', file: 'a.md', dependsOn: ['B'] },
    { id: 'B', file: 'b.md', dependsOn: ['A', 'Z'] },
    { id: 'A', file: 'a2.md', dependsOn: [] },
  ]);
  const msgs = g.errors.map((e) => e.message).join('\n');
  assert.match(msgs, /spec-id duplicado 'A'/);
  assert.match(msgs, /depende-de 'Z'/);
  assert.match(msgs, /ciclo de dependência entre specs/);
});

test('readyTasks respeita status e dependências', () => {
  const g = graphOf({
    'specs/features/A.md': spec('A-100'),
    'specs/tasks/A.md': tasks('A-100', [
      { id: 'T-001', agent: 'agente-frontend', box: 'x' },
      { id: 'T-002', agent: 'agente-qa-testes', deps: ['T-001'] },
      { id: 'T-003', agent: 'agente-spec-guardian', deps: ['T-002'] },
    ]),
  });
  const status = (id) => g.tasks.get(id).checkbox;
  assert.deepEqual(readyTasks(g, status).map((t) => t.id), ['A-100/T-002']);
});

test('resolveTaskId: local ambíguo entre specs, qualificado é exato', () => {
  const all = [{ id: 'A/T-001', localId: 'T-001' }, { id: 'B/T-001', localId: 'T-001' }];
  assert.equal(resolveTaskId('T-001', all).length, 2);
  assert.equal(resolveTaskId('B/T-001', all).length, 1);
});

test('nextSpecId: primeiro bloco, próximo submódulo e novo bloco', () => {
  const empty = tempProject();
  const used = tempProject({ 'specs/features/a.md': spec('BIB-100'), 'specs/features/b.md': spec('BIB-110'), 'specs/tasks/c.md': tasks('BIB-120', []) });
  try {
    const numbering = { prefix: 'BIB-', increment: 10, start: 'auto' };
    assert.equal(nextSpecId(empty, numbering), 'BIB-100');
    assert.equal(nextSpecId(used, numbering), 'BIB-130');
    assert.equal(nextSpecId(used, numbering, { newBlock: true }), 'BIB-200');
    assert.equal(nextSpecId(empty, { prefix: 'X-', increment: 5, start: 40 }), 'X-040');
  } finally { cleanup(empty); cleanup(used); }
});

test('countAcceptanceCriteria conta CAs únicos no corpo', () => {
  assert.equal(countAcceptanceCriteria('- **CA-01**: a\n- **CA-02**: b\n- CA-02: repetido\ntexto CA-09 solto'), 2);
});
