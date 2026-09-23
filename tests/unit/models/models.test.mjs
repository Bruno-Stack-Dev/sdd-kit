// Roteamento de modelos: papel → nível, perfil, sinais do contexto, piso e fontes explícitas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routingPolicy, resolveModel, roleOf, parseChoice, validateRouting } from '../../../scripts/lib/models.mjs';
import { validateConfig } from '../../../scripts/lib/config.mjs';
import { readAgents } from '../../../scripts/lib/doctor/agents-skills.mjs';
import { KIT_ROOT } from '../../helpers.mjs';
import { baseConfig as validConfig } from '../../fixtures/project.mjs';

const policy = routingPolicy();
const agents = readAgents(KIT_ROOT);
const cfg = (models, extra = {}) => ({ agents: { models }, ...extra });

test('política: todo agente do kit tem papel, e papéis/níveis/perfis são coerentes', () => {
  for (const a of agents) assert.ok(policy.agents[a.base], `${a.base} sem papel em policies/model-routing.json`);
  for (const name of Object.keys(policy.agents)) assert.ok(agents.some((a) => a.base === name), `${name} na política, mas não existe`);
  for (const [name, r] of Object.entries(policy.roles)) {
    assert.ok(policy.order.includes(r.tier) && policy.order.includes(r.floor), name);
    assert.ok(policy.order.indexOf(r.floor) <= policy.order.indexOf(r.tier), `${name}: piso acima do nível`);
  }
  assert.ok(policy.profiles[policy.default_profile]);
});

test('frontmatter dos agentes do kit materializa a política no perfil balanced', () => {
  for (const a of agents) {
    const r = resolveModel({ agent: a.base, profile: 'balanced' });
    assert.equal(a.fm.model, r.model, `${a.base}: model`);
    assert.equal(a.fm.effort, r.effort, `${a.base}: effort`);
  }
});

test('escolha pela função: guardiões e contratos no topo, implementação no padrão, mocks no leve', () => {
  const m = (agent) => resolveModel({ agent }).model;
  assert.equal(m('agente-spec-guardian'), 'opus');
  assert.equal(m('agente-arquiteto-guardian'), 'opus');
  assert.equal(m('agente-arquiteto-contratos'), 'opus');
  assert.equal(m('agente-backend'), 'sonnet');
  assert.equal(m('agente-qa-testes'), 'sonnet');
  assert.equal(m('agente-mock-data'), 'haiku');
});

test('perfis: quality sobe, economy desce sem furar o piso (guardião continua no topo)', () => {
  assert.equal(resolveModel({ agent: 'agente-backend', profile: 'quality' }).model, 'opus');
  assert.equal(resolveModel({ agent: 'agente-mock-data', profile: 'quality' }).model, 'sonnet');
  assert.equal(resolveModel({ agent: 'agente-spec-guardian', profile: 'economy' }).model, 'opus');
  assert.equal(resolveModel({ agent: 'agente-backend', profile: 'economy' }).model, 'sonnet', 'piso de build é standard');
  assert.equal(resolveModel({ agent: 'agente-revisor-ux', profile: 'economy' }).model, 'haiku');
  assert.equal(resolveModel({ agent: 'agente-arquiteto-contratos', profile: 'economy' }).model, 'sonnet');
  assert.equal(resolveModel({ agent: 'agente-backend', config: cfg({ profile: 'quality' }) }).profile, 'quality');
  assert.throws(() => resolveModel({ agent: 'agente-backend', profile: 'turbo' }), /perfil 'turbo'/);
});

test('sinais: reprovação no guardião, reabertura, spec grande e tags críticas sobem um nível (limitado)', () => {
  const backend = (context) => resolveModel({ agent: 'agente-backend', context });
  assert.equal(backend({ specState: { rejections: 1 } }).model, 'opus');
  assert.deepEqual(backend({ specState: { rejections: 1 } }).signals, ['rework']);
  assert.equal(backend({ taskState: { reopened: 2 } }).model, 'opus');
  assert.equal(backend({ spec: { caCount: 12, fm: {} } }).model, 'opus');
  assert.equal(backend({ spec: { caCount: 3, fm: { tags: ['seguranca'] } } }).model, 'opus');
  assert.equal(backend({ spec: { caCount: 3, fm: { tags: '[ui, docs]' } } }).model, 'sonnet');
  const all = resolveModel({ agent: 'agente-mock-data', context: { specState: { rejections: 1 }, taskState: { reopened: 1 } } });
  assert.equal(all.model, 'sonnet', 'dois sinais, mas o escalonamento é limitado a +1');
  assert.ok(all.reasons.some((r) => /limitado/.test(r)));
  assert.equal(resolveModel({ agent: 'agente-mock-data', context: { spec: { caCount: 20, fm: {} } } }).model, 'haiku', 'spec grande só pesa para build/verify');
});

test('etapa de guardião roda no topo mesmo com agente de outro papel', () => {
  const r = resolveModel({ agent: 'agente-qa-testes', step: { id: 'g', name: 'G', agent: 'agente-qa-testes', guardian: true } });
  assert.equal(r.model, 'opus');
  assert.ok(r.reasons.some((x) => /etapa de guardião/.test(x)));
});

test('fontes explícitas: etapa > override por agente > política; explícito não sofre perfil nem sinais', () => {
  const config = cfg({ profile: 'quality', overrides: { 'agente-backend': 'haiku' } });
  const ov = resolveModel({ agent: 'agente-backend', config, context: { specState: { rejections: 3 } } });
  assert.equal(ov.model, 'haiku');
  assert.equal(ov.source.model, 'config');
  assert.ok(ov.warnings.some((w) => /abaixo do piso/.test(w)));
  const step = resolveModel({ agent: 'agente-backend', config, step: { id: 's', name: 'S', agent: 'agente-backend', model: 'deep', effort: 'max' } });
  assert.deepEqual([step.model, step.effort, step.source.model, step.source.effort], ['opus', 'max', 'pipeline', 'pipeline']);
  const mixed = resolveModel({ agent: 'agente-backend', config: cfg({ overrides: { 'agente-backend': { effort: 'high' } } }) });
  assert.deepEqual([mixed.model, mixed.effort, mixed.source.model, mixed.source.effort], ['sonnet', 'high', 'policy', 'config']);
  const inherit = resolveModel({ agent: 'agente-backend', step: { model: 'inherit' } });
  assert.deepEqual([inherit.model, inherit.tier, inherit.effort], ['inherit', null, null]);
  const id = resolveModel({ agent: 'agente-backend', step: { model: 'claude-sonnet-5' } });
  assert.equal(id.model, 'claude-sonnet-5');
});

test('parseChoice aceita nível, alias e ID completo; recusa o resto', () => {
  assert.deepEqual(parseChoice('light'), { tier: 'light', model: 'haiku', effort: 'low' });
  assert.deepEqual(parseChoice('opus'), { tier: 'deep', model: 'opus' });
  assert.deepEqual(parseChoice('fable'), { tier: null, model: 'fable' });
  assert.equal(parseChoice('gpt-5'), null);
  assert.equal(parseChoice(undefined), null);
});

test('papel de agente fora da política: config > sufixo -guardian > somente leitura > build', () => {
  assert.equal(roleOf('agente-pagamentos-guardian', {}).role, 'audit');
  assert.equal(roleOf('agente-leitor', { fm: { tools: 'Read, Grep' } }).role, 'review');
  assert.equal(roleOf('agente-leitor', { fm: { tools: 'Read, Edit', disallowedTools: 'Edit' } }).role, 'review');
  assert.equal(roleOf('agente-pagamentos', { fm: { tools: 'Read, Edit' } }).role, 'build');
  assert.equal(roleOf('agente-pagamentos', {}).role, 'build', 'sem tools declaradas herda escrita');
  const byConfig = roleOf('agente-backend', { config: cfg({ roles: { 'agente-backend': 'design' } }) });
  assert.deepEqual([byConfig.role, byConfig.source], ['design', 'config']);
  assert.equal(resolveModel({ agent: 'agente-backend', config: cfg({ roles: { 'agente-backend': 'design' } }) }).model, 'opus');
});

test('config: schema aceita model/effort por etapa e agents.models; recusa valores inválidos', () => {
  const ok = validateConfig(validConfig({
    pipelines: { frontend: [
      { id: 'contratos', name: 'Contratos', agent: 'agente-arquiteto-contratos', model: 'deep', effort: 'high' },
      { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
    ] },
    agents: { models: { profile: 'economy', overrides: { 'agente-backend': 'opus', 'agente-e2e': { model: 'sonnet', effort: 'low' } }, roles: { 'agente-mock-data': 'build' } } },
  }), { root: KIT_ROOT });
  assert.deepEqual(ok.errors, []);
  const bad = validateConfig(validConfig({
    pipelines: { frontend: [{ id: 'g', name: 'G', agent: 'agente-spec-guardian', guardian: true, model: 'gpt-5', effort: 'extreme' }] },
    agents: { models: { profile: 'turbo', roles: { 'agente-backend': 'chefe' } } },
  }), { root: KIT_ROOT });
  for (const path of ['/pipelines/frontend/0/model', '/pipelines/frontend/0/effort', '/agents/models/profile', '/agents/models/roles/agente-backend']) {
    assert.ok(bad.errors.some((e) => e.path === path), `esperava erro em ${path}: ${JSON.stringify(bad.errors)}`);
  }
});

test('config: override de agente inexistente é erro; guardião abaixo do piso é aviso', () => {
  const agentsSet = new Set(agents.map((a) => a.base));
  const r = validateRouting({
    agents: { models: { overrides: { 'agente-fantasma': 'opus' } } },
    pipelines: { p: [{ id: 'g', name: 'G', agent: 'agente-spec-guardian', guardian: true, model: 'haiku' }] },
  }, agentsSet);
  assert.ok(r.errors.some((e) => /agente-fantasma/.test(e.message)));
  assert.ok(r.warnings.some((w) => w.path === '/pipelines/p/0/model' && /abaixo do piso/.test(w.message)));
});
