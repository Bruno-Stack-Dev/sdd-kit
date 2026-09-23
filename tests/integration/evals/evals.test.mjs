// Harness de evals: reprova de verdade, suíte determinística verde sem regressão, exportação em dia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, runSdd } from '../../helpers.mjs';
import { getPath, runCase, runDeterministic, compareWithBaseline } from '../../../scripts/lib/evals.mjs';
import { buildPromptfooTests } from '../../../scripts/commands/eval.mjs';
import { stringifyYaml, parseYaml } from '../../../scripts/lib/yaml.mjs';

test('getPath: filtros por chave (com pontos no valor), índices e raiz array', () => {
  const o = { checks: [{ id: 'specs.valid', status: 'fail', details: ['a'] }], list: [{ pack: 'arch', active: true }] };
  assert.equal(getPath(o, 'checks[id=specs.valid].status'), 'fail');
  assert.equal(getPath(o, 'checks.0.details.0'), 'a');
  assert.equal(getPath(o.list, '[pack=arch].active'), true);
  assert.equal(getPath(o, 'checks[id=nao].status'), undefined);
});

test('o harness reprova expectativa errada (não é verde por construção)', () => {
  const bad = runCase({ id: 'x', category: 'teste', run: ['policy', 'check', '--command', 'git push --force', '--json'], expect: [{ path: 'decision', equals: 'allow' }] });
  assert.equal(bad.passed, false);
  assert.equal(bad.results[0].actual, 'deny');
  const missing = runCase({ id: 'y', category: 'teste', fixture: 'python-api', run: ['doctor', '--fast', '--json'], expect: [{ path: 'checks[id=nao-existe].status', equals: 'pass' }] });
  assert.equal(missing.passed, false);
  assert.equal(runCase({ id: 'z', category: 'teste', fixture: 'nao-existe', run: ['version'] }).passed, false);
});

test('suíte determinística: todos os casos passam e não há regressão contra o baseline', () => {
  const res = runDeterministic();
  const failed = res.results.filter((r) => !r.passed);
  assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
  assert.ok(Object.keys(res.categories).length >= 13, 'as 13 categorias do plano estão cobertas');
  assert.deepEqual(compareWithBaseline(res).regressions, []);
});

test('generated-tests.yaml do Promptfoo está em dia com as evals das skills e dos agentes', () => {
  const current = readFileSync(join(KIT_ROOT, 'evals', 'promptfoo', 'generated-tests.yaml'), 'utf8').replace(/\r\n/g, '\n');
  const tests = parseYaml(current);
  assert.deepEqual(tests, buildPromptfooTests());
  assert.ok(tests.length >= 30);
  assert.ok(tests.every((t) => t.assert[0].type === 'llm-rubric'));
  assert.ok(current.startsWith('# AUTO-GENERATED'));
  assert.ok(stringifyYaml(tests).length > 0);
});

test('suíte com modelo sem ANTHROPIC_API_KEY: NOT_RUN, não falha nem finge sucesso', () => {
  const r = runSdd(['eval', 'run', '--suite', 'model', '--json'], { env: { ANTHROPIC_API_KEY: '' } });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).status, 'not_run');
});
