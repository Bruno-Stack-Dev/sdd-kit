import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateConfig, normalizeConfig, loadConfig } from '../../../scripts/lib/config.mjs';
import { parseLegacyConfigMd, renderConfigMd } from '../../../scripts/lib/config-md.mjs';
import { parseYaml, stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { KIT_ROOT, tempProject, cleanup, writeFile } from '../../helpers.mjs';

export function validConfig(overrides = {}) {
  return {
    version: 3,
    project: { name: 'Biblioteca', type: 'SaaS web', domain: 'empréstimo de livros', stage: 'mock-first', updated_at: '2026-09-23' },
    stack: { framework: 'Vue 3 + TypeScript', ui_library: null, state: 'Pinia', package_manager: 'npm' },
    commands: { test: 'npx vitest run', e2e: 'npx playwright test', typecheck: 'npm run typecheck' },
    paths: { specs: 'specs/', contracts: 'src/types/', mocks: 'src/<modulo>/mocks/' },
    numbering: { prefix: 'SPEC-2026-', increment: 10, start: 'auto' },
    pipelines: {
      frontend: [
        { id: 'contratos', name: 'Contratos', agent: 'agente-arquiteto-contratos', output: 'tipos' },
        { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true },
      ],
    },
    rules: ['**Spec-driven.** Todo trabalho deriva de uma spec.'],
    forbidden_patterns: [{ pattern: 'Date\\.now\\(\\)', scope: 'src/', expected: 0 }],
    human_gates: [],
    blocked_topics: [],
    ...overrides,
  };
}

test('config válida passa sem erros', () => {
  const r = validateConfig(validConfig(), { root: KIT_ROOT });
  assert.deepEqual(r.errors, []);
});

test('campo obrigatório ausente e campo desconhecido', () => {
  const cfg = validConfig();
  delete cfg.commands;
  cfg.comands = {};
  const paths = validateConfig(cfg, { root: KIT_ROOT }).errors.map((e) => e.path);
  assert.ok(paths.includes('/commands'));
  assert.ok(paths.includes('/comands'));
});

test('versão futura é recusada com mensagem clara', () => {
  const r = validateConfig(validConfig({ version: 4 }), { root: KIT_ROOT });
  assert.match(r.errors[0].message, /mais nova que o motor/);
});

test('placeholder em seção crítica é erro; fora dela é aviso', () => {
  const r = validateConfig(validConfig({
    forbidden_patterns: [{ pattern: '<ex.: Date\\.now>', scope: 'src/' }],
    stack: { framework: '<TODO>' },
  }), { root: KIT_ROOT });
  assert.ok(r.errors.some((e) => e.path === '/forbidden_patterns/0/pattern'));
  assert.ok(r.warnings.some((w) => w.path === '/stack/framework'));
});

test('regex inválida em forbidden_patterns é erro', () => {
  const r = validateConfig(validConfig({ forbidden_patterns: [{ pattern: '(', scope: 'src/' }] }), { root: KIT_ROOT });
  assert.ok(r.errors.some((e) => e.path === '/forbidden_patterns/0/pattern' && /regex inválida/.test(e.message)));
});

test('pipeline: agente inexistente, ID duplicado, sem guardião', () => {
  const r = validateConfig(validConfig({
    pipelines: { api: [
      { id: 'a', name: 'A', agent: 'agente-que-nao-existe' },
      { id: 'a', name: 'B', agent: 'agente-backend' },
    ] },
  }), { root: KIT_ROOT });
  assert.ok(r.errors.some((e) => /não existe/.test(e.message)));
  assert.ok(r.errors.some((e) => /duplicado/.test(e.message)));
  assert.ok(r.warnings.some((w) => /sem etapa de guardião/.test(w.message)));
});

test('round-trip: yaml → md (visão) → yaml preserva a config', () => {
  const cfg = normalizeConfig(validConfig({
    defaults: { multi_tenant: 'não', sensitive_data: null },
    engineering_gates: {
      coverage: { enabled: true, blocking: true, command: 'npx vitest --coverage', threshold: 80 },
      audit: { enabled: false, command: null },
      custom: { enabled: true, label: 'Portão com rótulo próprio' },
    },
    design_system: { identity: { name: 'Apex', framework: 'react' }, integrations: { figma: { active: 'false', reference: 'x|y' } } },
    security: { destructive_git: 'deny', production: { db_write: 'ask', markers: ['prod'] } },
    integrations: { mcp_profile: 'minimal', packs: ['arch'] },
    stack: { framework: 'Go 1.23', backend: { language: 'go', router: 'chi' } },
    commands: { test: 'go test ./...', e2e: null, lint: 'golangci-lint run', smoke: 'make smoke' },
    paths: { specs: 'specs/', backend: { root: 'cmd/', handlers: 'internal/http/' } },
    forbidden_patterns: [{ pattern: 'fmt\\.Println|log\\.Print', scope: 'internal/', expected: 0, reason: 'use o logger' }],
    human_gates: [{ decision: 'aprovar reembolso', entity: 'Pedido', setter: 'aprovarReembolso()', invariant: null }],
    blocked_topics: ['biometria'],
    rules: ['Regra `com código` e **negrito**', 'Outra | com pipe'],
  }));
  const back = normalizeConfig(parseLegacyConfigMd(renderConfigMd(cfg)));
  assert.deepEqual(back, cfg);
});

test('round-trip: model/effort por etapa e agents.models sobrevivem à visão md', () => {
  const cfg = normalizeConfig(validConfig({
    pipelines: { frontend: [
      { id: 'contratos', name: 'Contratos', agent: 'agente-arquiteto-contratos', model: 'deep' },
      { id: 'store', name: 'Store', agent: 'agente-frontend', effort: 'low' },
      { id: 'guardiao', name: 'Guardião', agent: 'agente-spec-guardian', guardian: true, model: 'claude-opus-5-5', effort: 'max' },
    ] },
    agents: { models: { profile: 'economy', overrides: { 'agente-backend': { model: 'opus', effort: 'high' } } } },
  }));
  const md = renderConfigMd(cfg);
  assert.match(md, /\| Guardião \| Modelo \| Esforço \|/);
  assert.deepEqual(normalizeConfig(parseLegacyConfigMd(md)), cfg);
  assert.doesNotMatch(renderConfigMd(normalizeConfig(validConfig())), /Modelo/, 'sem model/effort a tabela não muda');
});

test('migração do exemplo v2 preserva seções e marca placeholders', () => {
  const md = readFileSync(join(KIT_ROOT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-example.md'), 'utf8');
  const cfg = parseLegacyConfigMd(md);
  assert.deepEqual(Object.keys(cfg.pipelines), ['frontend', 'backend', 'delivery']);
  assert.equal(cfg.pipelines.frontend.length, 7);
  assert.equal(cfg.pipelines.backend.length, 7);
  assert.equal(cfg.pipelines.frontend.at(-1).guardian, true);
  assert.equal(cfg.forbidden_patterns[0].pattern, '<ex.: primeicons|<i class="pi">>');
  assert.equal(cfg.numbering.increment, 10);
  assert.equal(cfg.rules.length, 7);
  assert.ok(cfg.design_system.identity);
  assert.ok(Object.keys(cfg.engineering_gates).includes('dependency_audit'));
});

test('md legado preenchido migra para config válida', () => {
  const md = readFileSync(join(KIT_ROOT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-filled.md'), 'utf8');
  const cfg = normalizeConfig(parseLegacyConfigMd(md));
  const r = validateConfig(cfg, { root: KIT_ROOT });
  assert.deepEqual(r.errors, []);
  assert.equal(cfg.commands.test, 'npx vitest run');
  assert.equal(cfg.commands.e2e, null);
  assert.equal(cfg.stack.ui_library, null);
  assert.deepEqual(cfg.forbidden_patterns, [{ pattern: 'primeicons|<i class="pi">', scope: 'src/', expected: 0 }]);
  assert.deepEqual(cfg.human_gates, []);
  assert.deepEqual(cfg.blocked_topics, []);
  assert.equal(cfg.numbering.prefix, 'BIB-');
  assert.equal(cfg.legacy.sections['13. Observações do time'].includes('revisão quinzenal'), true);
});

test('loadConfig: yaml canônico, md legado, ambos e nenhum', () => {
  const dir = tempProject();
  try {
    assert.equal(loadConfig(dir).source, 'none');
    writeFile(dir, 'sdd.config.md', readFileSync(join(KIT_ROOT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-filled.md'), 'utf8'));
    const legacy = loadConfig(dir);
    assert.equal(legacy.source, 'md-legacy');
    assert.ok(legacy.warnings.some((w) => /config legada/.test(w.message)));
    writeFile(dir, 'sdd.config.yaml', stringifyYaml(validConfig()));
    const both = loadConfig(dir);
    assert.equal(both.source, 'yaml');
    assert.ok(both.warnings.some((w) => /escrito à mão/.test(w.message)));
    writeFile(dir, 'sdd.config.md', renderConfigMd(validConfig()));
    assert.ok(!loadConfig(dir).warnings.some((w) => w.path === 'sdd.config.md'));
    writeFile(dir, 'sdd.config.yaml', 'a:\n\tb: 1\n');
    assert.match(loadConfig(dir).errors[0].message, /YAML inválido: linha 2/);
  } finally { cleanup(dir); }
});

test('exemplo canônico sdd.config.example.yaml passa no schema (só placeholders pendentes)', () => {
  const cfg = parseYaml(readFileSync(join(KIT_ROOT, 'sdd.config.example.yaml'), 'utf8'));
  const r = validateConfig(cfg, { root: KIT_ROOT });
  const nonPlaceholder = r.errors.filter((e) => !/placeholder/.test(e.message));
  assert.deepEqual(nonPlaceholder, []);
});

test('sdd.config.example.md é a visão gerada do exemplo YAML (em dia)', () => {
  const cfg = parseYaml(readFileSync(join(KIT_ROOT, 'sdd.config.example.yaml'), 'utf8'));
  const md = readFileSync(join(KIT_ROOT, 'sdd.config.example.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(md, renderConfigMd(cfg, { source: 'sdd.config.example.yaml' }));
});
