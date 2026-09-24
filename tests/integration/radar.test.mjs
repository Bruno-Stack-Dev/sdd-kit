// sdd radar: inventário do que o projeto já tem e checagem determinística de candidatos
// (em-uso > em-adr > no-backlog > avaliado > mencionado > novo), sem rede e sem escrever nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, cleanup, runSdd, runLint, writeFile, KIT_ROOT } from '../helpers.mjs';
import { nameMatcher, RADAR_FILE_RE } from '../../scripts/lib/radar.mjs';

const sdd = (dir, ...a) => runSdd([...a, '--root', dir]);
const json = (dir, ...a) => {
  const r = sdd(dir, ...a, '--json');
  assert.equal(r.status, 0, r.out);
  return JSON.parse(r.stdout);
};
const doc = (id, titulo, body = '', status = 'rascunho') => `---\ndoc-id: ${id}\ntitulo: ${titulo}\nstatus: ${status}\n---\n\n${body}\n`;

function project() {
  return tempProject({
    'sdd.config.yaml': 'version: 3\nproject:\n  name: plataforma-agentes\n  type: web\n  stage: MVP\nstack:\n  backend: python 3.12 + fastapi\n  llm: qwen 32b local via ollama\n',
    'apps/agents/pyproject.toml': '[project]\nname = "agents"\ndependencies = ["langgraph>=0.4", "fastapi"]\n',
    'web/package.json': JSON.stringify({ dependencies: { react: '^19' }, devDependencies: { vitest: '^3' } }),
    '.claude/tools/x/requirements.txt': 'pytest\n',
    'specs/decisions/ADR-001-observabilidade.md': '---\nadr-id: ADR-001\ntitulo: Observabilidade de LLM\nstatus: descartado\n---\n\nPhoenix foi avaliado e descartado por exigir mais infra.\n',
    'specs/discovery/BACKLOG.md': doc('BACKLOG', 'Backlog', '- **F-02.1 — Guardrails com NeMo Guardrails** _(→ vira SPEC)_'),
    'specs/discovery/INFRA.md': doc('INFRA', 'Infra', 'Serving com llama.cpp na workstation.'),
    'specs/discovery/RADAR-2026-08-01.md': doc('RADAR-2026-08-01', 'Radar anterior', '| promptfoo | 0.100 | adiar |', 'aprovada'),
  });
}

test('nameMatcher: sem caixa, separadores opcionais nos dois sentidos e fronteira de palavra', () => {
  const m = (name, text) => nameMatcher(name)(text);
  assert.ok(m('llama.cpp', 'llama-cpp-python'));
  assert.ok(m('llamacpp', 'Serving com llama.cpp'));
  assert.ok(m('NeMo Guardrails', 'nemoguardrails'));
  assert.ok(m('nemoguardrails', '- **F-02.1 — Guardrails com NeMo Guardrails**'), 'forma colada acha a separada');
  assert.ok(m('LangGraph', '@langchain/langgraph'));
  assert.ok(m('@langchain/langgraph', '@langchain/langgraph'));
  assert.ok(!m('graph', 'langgraph'), 'exige fronteira');
  assert.ok(!m('ai', 'fastapi'));
  assert.ok(!m('lang graph', 'langgraphs'));
  assert.ok(m('c++', 'backend em C++ 20') && !m('c++', 'c'), 'símbolo casa literalmente');
  assert.equal(nameMatcher('  '), null);
});

test('RADAR_FILE_RE: sufixo de foco com maiúscula, acento e dígitos', () => {
  for (const f of ['RADAR-2026-09-24.md', 'RADAR-2026-09-24-observabilidade.md', 'RADAR-2026-09-24-agentes-de-IA.md', 'RADAR-2026-09-24-observação_2.md']) {
    assert.equal(f.match(RADAR_FILE_RE)?.[1], '2026-09-24', f);
  }
  for (const f of ['RADAR-2026-09-24-.md', 'RADAR-2026-9-24.md', 'RADAR-2026-09-24 foco.md']) assert.ok(!RADAR_FILE_RE.test(f), f);
});

test('radar inventory: stack, dependências por manifesto (sem .claude/), ADRs, discovery, backlog e radares', () => {
  const dir = project();
  try {
    const r = json(dir, 'radar', 'inventory');
    assert.equal(r.config.source, 'yaml');
    assert.equal(r.config.project.stage, 'MVP');
    assert.equal(r.config.stack.llm, 'qwen 32b local via ollama');
    assert.deepEqual(r.dependencies.map((m) => m.file).sort(), ['apps/agents/pyproject.toml', 'web/package.json']);
    assert.ok(r.dependencies.find((m) => m.file === 'web/package.json').deps.includes('vitest'), 'devDependencies contam');
    assert.deepEqual(r.adrs.map((a) => [a.id, a.status, a.title]), [['ADR-001', 'descartado', 'Observabilidade de LLM']]);
    assert.equal(r.backlog.file, 'specs/discovery/BACKLOG.md');
    assert.deepEqual(r.radars.map((x) => x.date), ['2026-08-01']);
    assert.ok(!r.discovery.some((d) => d.file.includes('RADAR-')), 'radar não é listado como doc de discovery');
    assert.ok(r.ai.uses_ai, 'langgraph é sinal de IA');
  } finally { cleanup(dir); }
});

test('radar check: status por precedência, com arquivo e trecho', () => {
  const dir = project();
  try {
    const r = json(dir, 'radar', 'check', 'langgraph', 'phoenix', 'nemo-guardrails,promptfoo', 'llama.cpp', 'ollama', 'langfuse');
    const by = Object.fromEntries(r.map((c) => [c.name, c]));
    assert.equal(by.langgraph.status, 'em-uso');
    assert.deepEqual(by.langgraph.where[0].matches, ['langgraph']);
    assert.equal(by.ollama.status, 'em-uso', 'stack da config conta como em uso');
    assert.equal(by.ollama.where[0].detail, 'stack');
    assert.equal(by.phoenix.status, 'em-adr');
    assert.match(by.phoenix.where[0].detail, /ADR-001 · descartado/);
    assert.match(by.phoenix.where[0].matches[0], /descartado/);
    assert.equal(by['nemo-guardrails'].status, 'no-backlog');
    assert.equal(by.promptfoo.status, 'avaliado');
    assert.equal(by['llama.cpp'].status, 'mencionado');
    assert.equal(by.langfuse.status, 'novo');
    assert.deepEqual(by.langfuse.where, []);
  } finally { cleanup(dir); }
});

test('radar check: crates, módulos Go, Poetry e `next.js` contam como em uso; radar com sufixo é avaliado', () => {
  const dir = tempProject({
    'rs/Cargo.toml': '[package]\nname = "app"\nlicense = "MIT"\n[dependencies]\nserde = "1.0"\n',
    'go/go.mod': 'module example.com/app\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n',
    'py/pyproject.toml': '[tool.poetry.dependencies]\npython = "^3.12"\nfastapi = "^0.110"\n',
    'web/package.json': JSON.stringify({ dependencies: { next: '^15' } }),
    'specs/discovery/RADAR-2026-09-24-agentes-de-IA.md': doc('RADAR-2026-09-24-agentes-de-IA', 'Radar', 'langfuse: adiar'),
  });
  try {
    const r = json(dir, 'radar', 'check', 'serde', 'gin', 'fastapi', 'next.js', 'langfuse', 'mit', 'app');
    const by = Object.fromEntries(r.map((c) => [c.name, c.status]));
    assert.deepEqual(by, { serde: 'em-uso', gin: 'em-uso', fastapi: 'em-uso', 'next.js': 'em-uso', langfuse: 'avaliado', mit: 'novo', app: 'novo' });
    const inv = json(dir, 'radar', 'inventory');
    assert.deepEqual(inv.radars.map((x) => x.date), ['2026-09-24']);
    assert.deepEqual(inv.discovery, []);
  } finally { cleanup(dir); }
});

test('radar: paths.specs da config vale para leitura e para `paths`; config fora do formato não quebra', () => {
  const dir = tempProject({
    'sdd.config.yaml': 'version: 3\nproject:\n  name: x\npaths:\n  specs: docs/specs/\nstack: python + fastapi\nintegrations:\n  packs: ai\n',
    'docs/specs/discovery/RADAR-2026-08-01.md': doc('RADAR-2026-08-01', 'Radar', 'vllm'),
    'docs/specs/decisions/ADR-001-x.md': '---\nadr-id: ADR-001\nstatus: aceito\n---\n\n# ADR-001: Serving com vLLM\n',
  });
  try {
    const inv = json(dir, 'radar', 'inventory');
    assert.deepEqual(inv.paths, { specs: 'docs/specs', discovery: 'docs/specs/discovery', decisions: 'docs/specs/decisions' });
    assert.deepEqual(inv.radars.map((x) => x.file), ['docs/specs/discovery/RADAR-2026-08-01.md']);
    assert.deepEqual(inv.adrs.map((a) => a.title), ['ADR-001: Serving com vLLM'], 'título cai no heading sem `titulo`');
    assert.deepEqual(inv.config.packs, ['ai']);
    const human = sdd(dir, 'radar', 'inventory');
    assert.equal(human.status, 0, human.out);
    assert.match(human.stdout, /stack\s+python \+ fastapi/);
    assert.match(human.stdout, /novos radares em docs\/specs\/discovery\//);
    assert.equal(json(dir, 'radar', 'check', 'vllm')[0].status, 'em-adr');
  } finally { cleanup(dir); }
});

test('radar: sem config nem specs não falha; uso incorreto sai com 2; nada é escrito', () => {
  const dir = tempProject({ 'README.md': 'vazio\n' });
  try {
    const inv = json(dir, 'radar', 'inventory');
    assert.equal(inv.config.source, 'none');
    assert.deepEqual([inv.adrs, inv.discovery, inv.radars, inv.backlog], [[], [], [], null]);
    assert.equal(json(dir, 'radar', 'check', 'vllm')[0].status, 'novo');
    assert.equal(sdd(dir, 'radar', 'check').status, 2);
    assert.equal(sdd(dir, 'radar').status, 2);
    assert.deepEqual(readdirSync(dir), ['README.md']);
    const human = sdd(dir, 'radar', 'check', 'vllm');
    assert.match(human.stdout, /vllm\s+novo/);
    assert.match(human.stdout, /Ocorrência não é decisão/);
  } finally { cleanup(dir); }
});

test('template radar: doc de discovery válido para o lint e listado pela CLI', () => {
  const dir = project();
  try {
    const t = runSdd(['template', 'show', 'radar']);
    assert.equal(t.status, 0, t.out);
    assert.match(t.stdout, /doc-id: RADAR-AAAA-MM-DD/);
    writeFile(dir, 'specs/discovery/RADAR-2026-09-24.md', t.stdout.replace(/AAAA-MM-DD/g, '2026-09-24'));
    const lint = runLint(dir);
    assert.ok(!/RADAR-2026-09-24/.test(lint.out), lint.out);
    assert.match(runSdd(['template', 'list']).stdout, /radar/);
  } finally { cleanup(dir); }
});

test('GERADOR oferece o radar no fechamento, sem rodá-lo por conta própria', () => {
  const g = readFileSync(join(KIT_ROOT, '.claude', 'skills', 'gerar-projeto', 'references', 'GERADOR.md'), 'utf8');
  const passo7 = g.slice(g.indexOf('## Passo 7'));
  assert.match(passo7, /\/radar-ferramentas/);
  assert.match(passo7, /não rode por conta própria/);
});
