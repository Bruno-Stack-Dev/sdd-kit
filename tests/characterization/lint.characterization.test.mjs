// Caracterização do sdd-lint v2 (Fase 0). Captura o comportamento observável do linter — exit code,
// mensagens e a linha de resumo — para que a refatoração em biblioteca (Fase 3) não o altere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempProject, cleanup, runLint, specDoc, KIT_ROOT } from '../helpers.mjs';

function lint(files) {
  const dir = tempProject(files);
  try { return runLint(dir); } finally { cleanup(dir); }
}

// Prefixo montado por concatenação: o próprio sdd-lint varre este arquivo à procura de caminhos
// literais de skill e reportaria as fixtures como links quebrados.
const SK = '.claude' + '/skills/';

const SUMMARY = /sdd-lint: (\d+) item\(ns\) verificado\(s\) · (\d+) erro\(s\) · (\d+) aviso\(s\)/;
function summary(out) {
  const m = out.match(SUMMARY);
  assert.ok(m, `linha de resumo ausente:\n${out}`);
  return { checked: Number(m[1]), errors: Number(m[2]), warns: Number(m[3]) };
}

test('diretório vazio: 0 itens, exit 0', () => {
  const r = lint({});
  assert.equal(r.status, 0);
  assert.deepEqual(summary(r.out), { checked: 0, errors: 0, warns: 0 });
});

test('spec válida passa', () => {
  const r = lint({ 'specs/features/SPEC-2026-100-x.md': specDoc() });
  assert.equal(r.status, 0);
  assert.deepEqual(summary(r.out), { checked: 1, errors: 0, warns: 0 });
});

test('spec sem frontmatter → erro', () => {
  const r = lint({ 'specs/features/a.md': '# sem frontmatter\n' });
  assert.equal(r.status, 1);
  assert.match(r.out, /✖ specs[\\/]features[\\/]a\.md: sem frontmatter/);
});

test('falta spec-id e titulo → dois erros', () => {
  const r = lint({ 'specs/features/a.md': specDoc({ 'spec-id': undefined, titulo: undefined }) });
  assert.equal(r.status, 1);
  assert.match(r.out, /falta 'spec-id'/);
  assert.match(r.out, /falta 'titulo'/);
  assert.equal(summary(r.out).errors, 2);
});

test('status inválido → erro; status aceitos: rascunho|implementada|aprovada|arquivada', () => {
  assert.equal(lint({ 'specs/features/a.md': specDoc({ status: 'feito' }) }).status, 1);
  for (const s of ['rascunho', 'implementada', 'aprovada', 'arquivada']) {
    assert.equal(lint({ 'specs/features/a.md': specDoc({ status: s }) }).status, 0, s);
  }
});

test('status com comentário inline YAML é aceito', () => {
  const r = lint({ 'specs/features/a.md': specDoc({ status: 'rascunho            # rascunho | implementada' }) });
  assert.equal(r.status, 0);
});

test('cas não numérico → erro', () => {
  const r = lint({ 'specs/features/a.md': specDoc({ cas: 'dois' }) });
  assert.equal(r.status, 1);
  assert.match(r.out, /'cas' não é número/);
});

test('implementada com cas: 0 → aviso, exit 0', () => {
  const r = lint({ 'specs/features/a.md': specDoc({ status: 'implementada', cas: '0' }) });
  assert.equal(r.status, 0);
  assert.match(r.out, /⚠ .*'cas: 0'/);
  assert.equal(summary(r.out).warns, 1);
});

test('depende-de que não é lista → aviso', () => {
  const r = lint({ 'specs/features/a.md': specDoc({ 'depende-de': 'SPEC-2026-010' }) });
  assert.equal(r.status, 0);
  assert.match(r.out, /'depende-de' deveria ser uma lista/);
});

test('specs em architecture/ e apis/ também são validadas; README e _* são ignorados', () => {
  const r = lint({
    'specs/architecture/a.md': specDoc(),
    'specs/apis/b.md': specDoc(),
    'specs/features/README.md': 'livre',
    'specs/features/_rascunho.md': 'livre',
  });
  assert.equal(r.status, 0);
  assert.equal(summary(r.out).checked, 2);
});

test('plans/, tasks/ e decisions/ NÃO são validados no v2', () => {
  const r = lint({
    'specs/plans/a.md': 'sem frontmatter',
    'specs/tasks/a.md': 'sem frontmatter',
    'specs/decisions/a.md': 'sem frontmatter',
  });
  assert.equal(r.status, 0);
  assert.equal(summary(r.out).checked, 0);
});

test('discovery: exige doc-id, titulo e status sem "implementada"', () => {
  const ok = '---\ndoc-id: VISAO\ntitulo: Visão\nstatus: rascunho\n---\n';
  assert.equal(lint({ 'specs/discovery/VISAO.md': ok }).status, 0);
  const bad = '---\ntitulo: Visão\nstatus: implementada\n---\n';
  const r = lint({ 'specs/discovery/VISAO.md': bad });
  assert.equal(r.status, 1);
  assert.match(r.out, /falta 'doc-id'/);
  assert.match(r.out, /'status' inválido/);
});

function config({ s7 = 'nenhum', s8 = 'nenhum', s11 } = {}) {
  const parts = ['# cfg', '', '## 7. Padrões proibidos', '', s7, '', '## 8. Gates de controle humano', '', s8, ''];
  if (s11) parts.push('## 11. Portões de engenharia', '', s11, '');
  return parts.join('\n');
}

test('config: seção 7 ausente → erro', () => {
  const r = lint({ 'sdd.config.md': '# cfg\n\n## 8. Gates\n\nnenhum\n' });
  assert.equal(r.status, 1);
  assert.match(r.out, /seção 7 \(Padrões proibidos\) ausente/);
});

test('config: placeholder na seção 8 → erro', () => {
  const r = lint({ 'sdd.config.md': config({ s8: '| <ex.: situação> | x |' }) });
  assert.equal(r.status, 1);
  assert.match(r.out, /seção 8 .*placeholders/);
});

test('config: sdd.config.example.md nunca é validado', () => {
  const r = lint({ 'sdd.config.example.md': '## 7. x\n<TODO>\n' });
  assert.equal(r.status, 0);
});

test('config: portões ativos na seção 11 viram avisos (não bloqueiam)', () => {
  const s11 = [
    '| Portão | Ativar? | Como |',
    '|---|---|---|',
    '| Cobertura | true | 80% |',
    '| Auditoria | false | npm audit |',
    '| Lint | <ex.: `false`> | x |',
  ].join('\n');
  const r = lint({ 'sdd.config.md': config({ s11 }) });
  assert.equal(r.status, 0);
  assert.match(r.out, /portões de engenharia ativos .*: Cobertura$/m);
  assert.equal(summary(r.out).warns, 1);
});

const skill = (name, desc = 'Descrição suficientemente longa para passar no limite mínimo.', extra = '') =>
  `---\nname: ${name}\ndescription: ${desc}\n${extra}---\n# ${name}\n`;

test('skill: name diferente do diretório → erro', () => {
  const r = lint({ [SK + 'minha/SKILL.md']: skill('outra') });
  assert.equal(r.status, 1);
  assert.match(r.out, /'name' \(outra\) difere do diretório 'minha'/);
});

test('skill: description fora de 40..1024 → erro', () => {
  const r = lint({ [SK + 'minha/SKILL.md']: skill('minha', 'curta') });
  assert.equal(r.status, 1);
  assert.match(r.out, /'description' com 5 chars/);
});

test('skill: references inexistente → erro; existente → ok', () => {
  const bad = lint({ [SK + 'minha/SKILL.md']: skill('minha', undefined, 'references: [refs/a.md]\n') });
  assert.equal(bad.status, 1);
  assert.match(bad.out, /references aponta para caminho inexistente 'refs\/a\.md'/);
  const good = lint({
    [SK + 'minha/SKILL.md']: skill('minha', undefined, 'references:\n  - refs/a.md\n'),
    [SK + 'minha/refs/a.md']: 'ok',
  });
  assert.equal(good.status, 0);
});

test('skill: diretório sem SKILL.md → erro; diretórios _* ignorados', () => {
  const r = lint({ [SK + 'vazia/nota.md']: 'x', [SK + '_privado/x.md']: 'x' });
  assert.equal(r.status, 1);
  assert.match(r.out, /vazia[\\/]SKILL\.md: SKILL\.md ausente/);
});

test('packs inativos em _packs/<pack>/<skill> são validados', () => {
  const r = lint({ [SK + '_packs/p/s1/SKILL.md']: skill('errado') });
  assert.equal(r.status, 1);
  assert.match(r.out, /_packs\/p\/s1\/SKILL\.md: 'name'/);
});

test('agente: name diferente do arquivo e description ausente → erros', () => {
  const r = lint({ '.claude/agents/agente-x.md': '---\nname: agente-y\n---\n' });
  assert.equal(r.status, 1);
  assert.match(r.out, /'name' \(agente-y\) difere do arquivo 'agente-x'/);
  assert.match(r.out, /agente-x\.md: falta 'description'/);
});

test('comando sem description → erro', () => {
  const r = lint({ '.claude/commands/x.md': '# sem frontmatter' });
  assert.equal(r.status, 1);
  assert.match(r.out, /sem frontmatter com 'description'/);
});

test('caminho interno .claude/skills/<x> inexistente → erro; globs e placeholders ignorados', () => {
  const r = lint({
    'doc.md': `veja ${SK}nao-existe/SKILL.md e ${SK}ds-* e ${SK}<nome>`,
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /doc\.md: caminho inexistente '\.claude\/skills\/nao-existe\/SKILL\.md'/);
  assert.equal(summary(r.out).errors, 1);
});

test('caminho interno resolvido via pack inativo é aceito', () => {
  const r = lint({
    'doc.md': `use ${SK}s1/SKILL.md`,
    [SK + '_packs/p/s1/SKILL.md']: skill('s1'),
  });
  assert.equal(r.status, 0);
});

test('o próprio kit passa no lint sem erros', () => {
  const r = runLint(KIT_ROOT);
  assert.equal(r.status, 0, r.out);
  const s = summary(r.out);
  assert.equal(s.errors, 0);
  assert.ok(s.checked >= 85, `esperado >= 85 itens, veio ${s.checked}`);
});
