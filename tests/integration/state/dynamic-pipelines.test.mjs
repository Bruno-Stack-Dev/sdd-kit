// Pipelines dinâmicas: o mesmo motor gera trabalho coerente para stacks diferentes, sem edição.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, tempProject, cleanup, runSdd } from '../../helpers.mjs';
import { parseYaml, stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { validateConfig } from '../../../scripts/lib/config.mjs';
import { baseConfig } from '../../fixtures/project.mjs';

const EX = join(KIT_ROOT, 'docs', 'examples', 'pipelines');
const examples = readdirSync(EX).filter((f) => f.endsWith('.yaml')).map((f) => ({ file: f, pipelines: parseYaml(readFileSync(join(EX, f), 'utf8')) }));

test('há exemplos para API, frontend, CLI e dados, todos válidos no schema', () => {
  assert.deepEqual(examples.map((e) => Object.keys(e.pipelines)[0]).sort(), ['api', 'cli', 'data', 'frontend']);
  for (const e of examples) {
    const r = validateConfig(baseConfig({ pipelines: e.pipelines }), { root: KIT_ROOT });
    assert.deepEqual(r.errors, [], `${e.file}: ${JSON.stringify(r.errors)}`);
    const steps = Object.values(e.pipelines)[0];
    assert.equal(steps.at(-1).guardian, true, `${e.file}: termina no guardião`);
  }
});

for (const e of examples) {
  const [name, steps] = Object.entries(e.pipelines)[0];
  test(`spec new com a pipeline '${name}' gera uma tarefa por etapa, com o agente da etapa`, () => {
    const dir = tempProject({ 'sdd.config.yaml': stringifyYaml(baseConfig({ pipelines: e.pipelines })) });
    try {
      assert.equal(runSdd(['spec', 'new', '--slug', 'modulo', '--pipeline', name, '--root', dir]).status, 0);
      const tasks = JSON.parse(runSdd(['tasks', 'list', '--json', '--root', dir]).stdout).tasks;
      assert.equal(tasks.length, steps.length);
      tasks.forEach((t, i) => {
        assert.equal(t.agent, steps[i].agent, `${name} etapa ${i + 1}`);
        assert.ok(t.title.startsWith(steps[i].name), `${t.title} × ${steps[i].name}`);
        assert.deepEqual(t.deps, i ? [tasks[i - 1].id] : []);
      });
      const plan = readFileSync(join(dir, 'specs', 'plans', 'BIB-100-modulo.md'), 'utf8');
      for (const s of steps) assert.ok(plan.includes(`### Fase ${steps.indexOf(s) + 1} — ${s.name}`), s.name);
    } finally { cleanup(dir); }
  });
}

test('templates de plano e tarefas não fixam nenhuma pipeline de stack', () => {
  const tarefas = readFileSync(join(KIT_ROOT, 'specs', '_templates', 'template-tarefas.md'), 'utf8');
  const linhas = tarefas.split('\n').filter((l) => /^- \[ \] \[T-/.test(l));
  assert.ok(linhas.length >= 7);
  for (const l of linhas) assert.match(l, /\] <etapa/, `linha de tarefa fixa: ${l}`);
  const plano = readFileSync(join(KIT_ROOT, 'specs', '_templates', 'template-plano.md'), 'utf8');
  assert.ok(!/### Fase \d — (Contratos|Mocks|Estado\/store|UI)/.test(plano), 'plano sem fases de frontend fixas');
  assert.match(plano, /Gerado por `sdd spec new`/);
});
