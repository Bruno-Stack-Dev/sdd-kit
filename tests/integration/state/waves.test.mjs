// Execução em ondas: a CLI decide o que roda junto (um agente por onda, guardião sozinho, specs
// dependentes depois, limite da config) e o estado recusa duas tarefas do mesmo agente numa onda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempProject, cleanup, runSdd } from '../../helpers.mjs';
import { stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { baseConfig, spec, plan, tasks } from '../../fixtures/project.mjs';

// Contratos → (mocks ∥ store) → testes → guardião, em duas specs independentes.
const BRANCHED = [
  { id: 'T-001', agent: 'agente-arquiteto-contratos' },
  { id: 'T-002', agent: 'agente-mock-data', deps: ['T-001'] },
  { id: 'T-003', agent: 'agente-frontend', deps: ['T-001'] },
  { id: 'T-004', agent: 'agente-qa-testes', deps: ['T-002', 'T-003'] },
  { id: 'T-005', agent: 'agente-spec-guardian', deps: ['T-004'] },
];

function project(config = baseConfig()) {
  const files = { 'sdd.config.yaml': stringifyYaml(config) };
  for (const id of ['BIB-100', 'BIB-200']) {
    files[`specs/features/${id}.md`] = spec(id);
    files[`specs/plans/${id}.md`] = plan(id);
    files[`specs/tasks/${id}.md`] = tasks(id, BRANCHED);
  }
  const dir = tempProject(files);
  assert.equal(runSdd(['tasks', 'sync', '--root', dir]).status, 0);
  return dir;
}
const sdd = (args, dir) => runSdd([...args, '--root', dir]);
const wave = (dir, extra = []) => {
  const r = sdd(['tasks', 'wave', '--json', ...extra], dir);
  assert.equal(r.status, 0, r.out);
  return JSON.parse(r.stdout);
};
const start = (dir, task, agent, w) => {
  const r = sdd(['event', 'TASK_STARTED', '--task', task, '--agent', agent, '--wave', w], dir);
  assert.equal(r.status, 0, r.out);
};
const done = (dir, task) => assert.equal(sdd(['event', 'TASK_COMPLETED', '--task', task], dir).status, 0);

test('primeira onda: um agente de contratos por vez, mesmo com duas specs independentes', () => {
  const dir = project();
  try {
    const w = wave(dir);
    assert.equal(w.id, 'wave-1');
    assert.deepEqual(w.wave.map((t) => [t.id, t.model]), [['BIB-100/T-001', 'opus']]);
    assert.deepEqual(w.deferred.map((d) => d.id), ['BIB-200/T-001']);
    assert.match(w.deferred[0].reason, /um @agente-arquiteto-contratos por onda/);
  } finally { cleanup(dir); }
});

test('ramos paralelos: agentes diferentes rodam juntos, cada um no modelo do papel; limite da config', () => {
  const dir = project();
  try {
    start(dir, 'BIB-100/T-001', 'agente-arquiteto-contratos', 'wave-1');
    done(dir, 'BIB-100/T-001');
    const w = wave(dir);
    assert.equal(w.id, 'wave-2', 'o id conta as ondas já registradas');
    assert.deepEqual(w.wave.map((t) => `${t.id}:${t.model}`), ['BIB-100/T-002:haiku', 'BIB-100/T-003:sonnet', 'BIB-200/T-001:opus']);
    const two = wave(dir, ['--max', '2']);
    assert.equal(two.wave.length, 2);
    assert.match(two.deferred.find((d) => d.id === 'BIB-200/T-001').reason, /limite de 2/);
    assert.equal(wave(dir, ['--spec', 'BIB-200']).wave.length, 1);
    const ready = JSON.parse(sdd(['tasks', 'ready', '--json'], dir).stdout);
    assert.deepEqual(ready.parallel_safe, w.wave.map((t) => t.id));
    assert.equal(sdd(['tasks', 'wave', '--max', '0'], dir).status, 2);
  } finally { cleanup(dir); }
});

test('agents.parallel.max: 1 volta ao sequencial', () => {
  const dir = project(baseConfig({ agents: { parallel: { max: 1 } } }));
  try {
    start(dir, 'BIB-100/T-001', 'agente-arquiteto-contratos', 'wave-1');
    done(dir, 'BIB-100/T-001');
    const w = wave(dir);
    assert.equal(w.max, 1);
    assert.equal(w.wave.length, 1);
  } finally { cleanup(dir); }
});

test('estado: numa onda, o mesmo agente não pega duas tarefas; a onda seguinte espera o agente livre', () => {
  const dir = project();
  try {
    start(dir, 'BIB-100/T-001', 'agente-arquiteto-contratos', 'wave-1');
    done(dir, 'BIB-100/T-001');
    for (const [t, a] of [['BIB-100/T-002', 'agente-mock-data'], ['BIB-100/T-003', 'agente-frontend'], ['BIB-200/T-001', 'agente-arquiteto-contratos']]) start(dir, t, a, 'wave-2');
    const clash = sdd(['event', 'TASK_STARTED', '--task', 'BIB-200/T-003', '--agent', 'agente-frontend', '--wave', 'wave-2', '--meta', '{"force":true}'], dir);
    assert.equal(clash.status, 1);
    assert.match(clash.out, /já tem BIB-100\/T-003 em andamento/);
    const state = JSON.parse(sdd(['state', 'show', '--json'], dir).stdout);
    assert.equal(state.tasks['BIB-100/T-003'].wave, 'wave-2');
    done(dir, 'BIB-200/T-001');
    // BIB-200 liberou mocks e store, mas @agente-mock-data e @agente-frontend seguem na BIB-100.
    const w = wave(dir);
    assert.deepEqual(w.wave, []);
    assert.deepEqual(w.deferred.map((d) => d.reason), ['@agente-mock-data já tem tarefa em andamento', '@agente-frontend já tem tarefa em andamento']);
    done(dir, 'BIB-100/T-002');
    assert.deepEqual(wave(dir).wave.map((t) => t.id), ['BIB-200/T-002']);
  } finally { cleanup(dir); }
});

test('guardião roda sozinho e segura a onda enquanto revisa', () => {
  const dir = project();
  try {
    start(dir, 'BIB-100/T-001', 'agente-arquiteto-contratos', 'wave-1');
    done(dir, 'BIB-100/T-001');
    for (const [t, a] of [['BIB-100/T-002', 'agente-mock-data'], ['BIB-100/T-003', 'agente-frontend']]) { start(dir, t, a, 'wave-2'); done(dir, t); }
    start(dir, 'BIB-100/T-004', 'agente-qa-testes', 'wave-3');
    done(dir, 'BIB-100/T-004');
    const w = wave(dir);
    assert.deepEqual(w.wave.map((t) => [t.id, t.model, t.exclusive]), [['BIB-100/T-005', 'opus', true]]);
    assert.match(w.deferred.find((d) => d.id === 'BIB-200/T-001').reason, /onda é do guardião/);
    start(dir, 'BIB-100/T-005', 'agente-spec-guardian', w.id);
    const during = wave(dir);
    assert.equal(during.wave.length, 0);
    assert.match(during.deferred[0].reason, /guardião em andamento/);
    assert.deepEqual(during.running.map((r) => r.id), ['BIB-100/T-005']);
  } finally { cleanup(dir); }
});

test('spec com depende-de só entra na onda depois da spec de que depende estar implementada', () => {
  const files = {
    'sdd.config.yaml': stringifyYaml(baseConfig()),
    'specs/features/A.md': spec('BIB-100'),
    'specs/features/B.md': spec('BIB-110', { deps: ['BIB-100'] }),
    'specs/tasks/A.md': tasks('BIB-100', [{ id: 'T-001', agent: 'agente-arquiteto-contratos' }]),
    'specs/tasks/B.md': tasks('BIB-110', [{ id: 'T-001', agent: 'agente-frontend' }]),
  };
  const dir = tempProject(files);
  try {
    assert.equal(runSdd(['tasks', 'sync', '--root', dir]).status, 0);
    const w = wave(dir);
    assert.deepEqual(w.wave.map((t) => t.id), ['BIB-100/T-001']);
    assert.match(w.deferred[0].reason, /depende de BIB-100/);
  } finally { cleanup(dir); }
});
