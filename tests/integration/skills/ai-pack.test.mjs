// Pack `ai`: detecção de IA no produto, skills conformes, sem tabela de recomendação fixa,
// ativação com templates/referências, manifesto de plugin e aviso do doctor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, tempProject, cleanup, writeFile, runSdd } from '../../helpers.mjs';
import { stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { baseConfig } from '../../fixtures/project.mjs';
import { detectAi } from '../../../scripts/lib/ai-detect.mjs';
import { validateSkill } from '../../../scripts/lib/skills.mjs';

const PACK = join(KIT_ROOT, '.claude', 'skills', '_packs', 'ai');
const FIXTURE = join(KIT_ROOT, 'tests', 'fixtures', 'ai-rag-project');
const SKILLS = readdirSync(PACK).filter((n) => !n.startsWith('_') && !n.startsWith('.'));
const sdd = (dir, ...a) => runSdd([...a, '--root', dir]);

test('ai detect: fixture com RAG usa IA e sugere AI-RAG; projeto sem IA não usa', () => {
  const r = detectAi(FIXTURE);
  assert.equal(r.uses_ai, true);
  assert.deepEqual(r.signals.llm, ['anthropic']);
  assert.deepEqual(r.signals.rag, ['qdrant-client']);
  assert.ok(r.suggested_artifacts.includes('AI-RAG'));
  assert.ok(!r.suggested_artifacts.includes('AI-MEMORY'));
  assert.equal(r.pack, 'ai');
  const plain = detectAi(join(KIT_ROOT, 'tests', 'fixtures', 'python-api'));
  assert.equal(plain.uses_ai, false);
  assert.deepEqual(plain.suggested_artifacts, []);
});

test('ai detect: agentes e memória em package.json; "ai" sozinho é ambíguo', () => {
  const a = tempProject({ 'package.json': JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': '1', mem0ai: '1' } }) });
  const b = tempProject({ 'package.json': JSON.stringify({ dependencies: { ai: '4' } }) });
  try {
    const r = detectAi(a);
    assert.equal(r.uses_ai, true);
    assert.ok(r.suggested_artifacts.includes('AI-MEMORY') && r.suggested_artifacts.includes('AI-OBSERVABILITY'));
    assert.equal(detectAi(b).uses_ai, false);
    const cli = sdd(a, 'ai', 'detect', '--json');
    assert.equal(cli.status, 0);
    assert.equal(JSON.parse(cli.stdout).uses_ai, true);
  } finally { cleanup(a); cleanup(b); }
});

test('skills do pack ai são conformes à spec Agent Skills, com evals e método comum', () => {
  assert.equal(SKILLS.length, 8);
  for (const s of SKILLS) {
    const res = validateSkill(join(PACK, s));
    assert.deepEqual(res.errors, [], `${s}: ${res.errors.join('; ')}`);
    assert.deepEqual(res.warnings ?? [], [], `${s}: ${(res.warnings ?? []).join('; ')}`);
    const md = readFileSync(join(PACK, s, 'SKILL.md'), 'utf8');
    assert.match(md, /AVALIACAO-DE-TECNOLOGIA\.md/, `${s} deve citar o método comum`);
    assert.match(md, /sdd-pack: "ai"/);
    const ev = JSON.parse(readFileSync(join(PACK, s, 'evals', 'evals.json'), 'utf8'));
    assert.equal(ev.skill_name, s);
    assert.ok(ev.evals.length >= 2);
  }
});

test('sem tabela de recomendação fixa: candidatos só como "a verificar", sempre com a opção mínima', () => {
  const method = readFileSync(join(PACK, '_ai-references', 'AVALIACAO-DE-TECNOLOGIA.md'), 'utf8');
  assert.match(method, /não traz tabela de recomendação fixa/);
  assert.match(method, /documentação oficial atual/);
  assert.match(method, /NÃO VERIFICADO/);
  assert.match(method, /ADR/);
  for (const s of ['ai-architecture-evaluator', 'ai-model-strategy', 'ai-rag-memory-designer', 'ai-structured-output-designer', 'ai-evals-designer', 'ai-security-reviewer', 'ai-observability-governance']) {
    const md = readFileSync(join(PACK, s, 'SKILL.md'), 'utf8');
    assert.match(md, /candidatos a verificar|Ferramentas a verificar|Backends a verificar/i, `${s}: nomes devem vir como candidatos a verificar`);
    assert.doesNotMatch(md, /\b(recomendamos|use sempre|a melhor opção é)\b/i, `${s}: sem recomendação fixa`);
  }
});

test('templates AI-* existem e exigem evidência datada', () => {
  const tpl = join(PACK, '_ai-templates');
  for (const t of ['AI-ARCHITECTURE', 'AI-MODEL-STRATEGY', 'AI-RAG', 'AI-MEMORY', 'AI-EVALS', 'AI-SECURITY', 'AI-OBSERVABILITY', 'AI-DATA-GOVERNANCE']) {
    const md = readFileSync(join(tpl, `${t}.md`), 'utf8');
    assert.match(md, /Evidências consultadas/, t);
    assert.match(md, /Consultado em/, t);
  }
});

test('lock, plugin e marketplace do pack ai coerentes (conteúdo próprio, MIT, core)', () => {
  const lock = JSON.parse(readFileSync(join(KIT_ROOT, 'skills.lock.json'), 'utf8'));
  assert.equal(lock.packs.ai.license, 'MIT');
  assert.equal(lock.packs.ai.trust, 'core');
  assert.equal(Object.keys(lock.packs.ai.skills).length, 8);
  const plugin = JSON.parse(readFileSync(join(PACK, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'sdd-ai');
  assert.equal(plugin.skills, './');
  const market = JSON.parse(readFileSync(join(KIT_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.ok(market.plugins.some((p) => p.name === 'sdd-ai' && p.source === './.claude/skills/_packs/ai'));
});

test('pack activate ai copia skills, templates e referências (links relativos continuam válidos)', () => {
  const dir = tempProject({ 'sdd.config.yaml': stringifyYaml(baseConfig()) });
  try {
    const r = sdd(dir, 'pack', 'activate', 'ai');
    assert.equal(r.status, 0, r.stderr);
    for (const s of SKILLS) assert.ok(existsSync(join(dir, '.claude', 'skills', s, 'SKILL.md')), s);
    assert.ok(existsSync(join(dir, '.claude', 'skills', '_ai-templates', 'AI-RAG.md')));
    assert.ok(existsSync(join(dir, '.claude', 'skills', '_ai-references', 'AVALIACAO-DE-TECNOLOGIA.md')));
    assert.ok(!existsSync(join(dir, '.claude', 'skills', '.claude-plugin')));
    for (const s of SKILLS) assert.deepEqual(validateSkill(join(dir, '.claude', 'skills', s)).errors, [], s);
  } finally { cleanup(dir); }
});

test('doctor avisa: produto usa IA sem o pack; pack declarado mas inativo', () => {
  const dir = tempProject({});
  try {
    cpSync(FIXTURE, dir, { recursive: true });
    let rep = JSON.parse(sdd(dir, 'doctor', '--json').stdout);
    const declared = rep.checks.find((c) => c.id === 'supply.packs-declared');
    assert.equal(declared.status, 'warn');
    assert.match(declared.title, /ai/);
    // Sem o pack declarado, o aviso vira "o produto usa IA".
    // Checkout com autocrlf pode trazer CRLF: normaliza antes de editar.
    const cfg = readFileSync(join(dir, 'sdd.config.yaml'), 'utf8').split(String.fromCharCode(13)).join('').replace(/integrations:\n\s+packs:\n\s+- ai\n/, '');
    assert.doesNotMatch(cfg, /- ai\n/, 'bloco integrations.packs removido');
    writeFile(dir, 'sdd.config.yaml', cfg);
    rep = JSON.parse(sdd(dir, 'doctor', '--json').stdout);
    const ai = rep.checks.find((c) => c.id === 'supply.ai-pack');
    assert.equal(ai?.status, 'warn');
    assert.match(ai.title, /llm/);
    // Ativado, os dois somem.
    writeFile(dir, 'sdd.config.yaml', cfg + 'integrations:\n  packs:\n    - ai\n');
    assert.equal(sdd(dir, 'pack', 'activate', 'ai').status, 0);
    rep = JSON.parse(sdd(dir, 'doctor', '--json').stdout);
    assert.equal(rep.checks.find((c) => c.id === 'supply.packs-declared').status, 'pass');
    assert.equal(rep.checks.find((c) => c.id === 'supply.ai-pack'), undefined);
  } finally { cleanup(dir); }
});
