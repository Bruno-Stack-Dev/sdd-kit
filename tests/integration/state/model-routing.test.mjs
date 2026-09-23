// Roteamento de modelos pela CLI: tarefas herdam o modelo do papel do agente, o estado registra o
// modelo usado e a reprovação no guardião sobe o nível da nova tentativa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, runSdd } from '../../helpers.mjs';
import { stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { baseConfig, greenfieldProject } from '../../fixtures/project.mjs';

const json = (args, dir) => {
  const r = runSdd([...args, '--json', '--root', dir]);
  assert.equal(r.status, 0, r.out);
  return JSON.parse(r.stdout);
};
const ok = (args, dir) => { const r = runSdd([...args, '--root', dir]); assert.equal(r.status, 0, r.out); return r; };

test('tasks ready/show trazem o modelo escolhido pelo papel do agente', () => {
  const dir = greenfieldProject();
  try {
    ok(['tasks', 'sync'], dir);
    const ready = json(['tasks', 'ready'], dir);
    assert.deepEqual(ready.routing['BIB-100/T-001'], { model: 'opus', effort: 'high', tier: 'deep', role: 'design', source: 'policy', signals: [] });
    assert.match(ok(['tasks', 'ready'], dir).stdout, /BIB-100\/T-001\s+@agente-arquiteto-contratos\s+\[opus\]/);
    const show = json(['tasks', 'show', 'BIB-100/T-002'], dir);
    assert.equal(show.routing.model, 'sonnet');
    assert.equal(json(['tasks', 'show', 'BIB-100/T-004'], dir).routing.model, 'opus');
  } finally { cleanup(dir); }
});

test('TASK_STARTED registra --model/--effort; valores inválidos são recusados', () => {
  const dir = greenfieldProject();
  try {
    ok(['tasks', 'sync'], dir);
    ok(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--agent', 'agente-arquiteto-contratos', '--model', 'opus', '--effort', 'high'], dir);
    const t = json(['state', 'show'], dir).tasks['BIB-100/T-001'];
    assert.deepEqual([t.model, t.effort], ['opus', 'high']);
    assert.equal(runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-002', '--model', 'gpt-5', '--root', dir]).status, 2);
    assert.equal(runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-002', '--effort', 'turbo', '--root', dir]).status, 2);
  } finally { cleanup(dir); }
});

test('reprovação no guardião sobe o modelo da nova tentativa; reabertura também', () => {
  const dir = greenfieldProject();
  try {
    ok(['tasks', 'sync'], dir);
    for (const [task, agent] of [['T-001', 'agente-arquiteto-contratos'], ['T-002', 'agente-frontend'], ['T-003', 'agente-qa-testes']]) {
      ok(['event', 'TASK_STARTED', '--task', `BIB-100/${task}`, '--agent', agent], dir);
      ok(['event', 'TASK_COMPLETED', '--task', `BIB-100/${task}`], dir);
    }
    assert.equal(json(['models', 'resolve', '--task', 'BIB-100/T-002'], dir).model, 'sonnet');
    ok(['event', 'GUARDIAN_STARTED', '--spec', 'BIB-100'], dir);
    ok(['event', 'GUARDIAN_REJECTED', '--spec', 'BIB-100', '--reason', 'CA-02 sem teste negativo'], dir);
    const r = json(['models', 'resolve', '--task', 'BIB-100/T-002'], dir);
    assert.deepEqual([r.model, r.effort, r.signals], ['opus', 'high', ['rework']]);
    assert.ok(r.reasons.some((x) => /reprovada 1×/.test(x)));
    assert.equal(json(['models', 'resolve', '--task', 'BIB-110/T-002'], dir).model, 'sonnet', 'outra spec não é afetada');
    ok(['event', 'TASK_REOPENED', '--task', 'BIB-100/T-003'], dir);
    assert.deepEqual(json(['models', 'resolve', '--task', 'BIB-100/T-003'], dir).signals, ['rework', 'reopened']);
    assert.equal(json(['state', 'show'], dir).tasks['BIB-100/T-003'].reopened, 1);
  } finally { cleanup(dir); }
});

test('config do projeto: perfil, override por agente e modelo por etapa', () => {
  const pipelines = { frontend: [
    { id: 'contratos', name: 'Contratos', agent: 'agente-arquiteto-contratos' },
    { id: 'store', name: 'Store', agent: 'agente-frontend', model: 'haiku', effort: 'low' },
    { id: 'testes', name: 'Testes', agent: 'agente-qa-testes' },
    { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
  ] };
  const config = baseConfig({ pipelines, agents: { models: { profile: 'economy', overrides: { 'agente-qa-testes': 'deep' } } } });
  const dir = greenfieldProject({ 'sdd.config.yaml': stringifyYaml(config) });
  try {
    ok(['tasks', 'sync'], dir);
    const v = runSdd(['config', 'validate', '--root', dir]);
    assert.equal(v.status, 0, v.out);
    assert.match(v.out, /abaixo do piso/, 'etapa de build fixada em haiku avisa');
    // As tarefas do fixture não declaram `pipeline:` nem usam o nome da etapa: sem etapa
    // identificada, vale a política do agente (com o perfil e o override da config).
    assert.equal(json(['models', 'resolve', '--task', 'BIB-100/T-001'], dir).model, 'sonnet', 'economy desce contratos para standard');
    assert.equal(json(['models', 'resolve', '--task', 'BIB-100/T-003'], dir).model, 'opus', 'override por agente');
    assert.equal(json(['models', 'resolve', '--task', 'BIB-100/T-004'], dir).model, 'opus', 'guardião não desce no economy');
    const list = json(['models', 'list'], dir);
    assert.equal(list.profile, 'economy');
    const store = list.steps.find((s) => s.step === 'store');
    assert.deepEqual([store.model, store.effort, store.source.model], ['haiku', 'low', 'pipeline']);
  } finally { cleanup(dir); }
});

test('spec new: a tarefa é ligada à etapa da pipeline e herda o modelo fixado nela', () => {
  const pipelines = { api: [
    { id: 'contrato', name: 'Contrato de API', agent: 'agente-arquiteto-contratos' },
    { id: 'servicos', name: 'Serviços', agent: 'agente-backend', model: 'deep' },
    { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
  ] };
  const dir = greenfieldProject({ 'sdd.config.yaml': stringifyYaml(baseConfig({ pipelines })) });
  try {
    ok(['spec', 'new', '--slug', 'pedidos', '--pipeline', 'api', '--new-block'], dir);
    const tasks = json(['tasks', 'list'], dir).tasks.filter((t) => t.agent === 'agente-backend');
    assert.equal(tasks.length, 1);
    const r = json(['models', 'resolve', '--task', tasks[0].id], dir);
    assert.deepEqual([r.pipeline, r.step, r.model, r.source.model], ['api', 'servicos', 'opus', 'pipeline']);
    assert.equal(runSdd(['models', 'resolve', '--agent', 'agente-backend', '--pipeline', 'api', '--step', 'servicos', '--root', dir]).status, 0);
    assert.equal(runSdd(['models', 'resolve', '--agent', 'agente-inexistente', '--root', dir]).status, 1);
    assert.equal(runSdd(['models', 'list', '--profile', 'turbo', '--root', dir]).status, 2);
  } finally { cleanup(dir); }
});
