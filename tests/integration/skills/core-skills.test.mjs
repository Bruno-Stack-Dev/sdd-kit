// Skills núcleo (workflows migrados de .claude/commands) e compatibilidade dos /nomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { KIT_ROOT } from '../../helpers.mjs';
import { validateSkill, strictYamlIssues, frontmatterOf } from '../../../scripts/lib/skills.mjs';
import { parseYaml } from '../../../scripts/lib/yaml.mjs';

const CORE = ['sdd-init', 'sdd-status', 'gerar-projeto', 'gerar-skills', 'nova-spec', 'implementar-spec', 'implementar-tarefa', 'validar-e2e'];
const SIDE_EFFECT = CORE.filter((s) => s !== 'sdd-status');
const skillDir = (s) => join(KIT_ROOT, '.claude', 'skills', s);
const fm = (s) => parseYaml(frontmatterOf(readFileSync(join(skillDir(s), 'SKILL.md'), 'utf8')));

for (const s of CORE) {
  test(`skill núcleo ${s}: conforme à spec, com evals, metadata sdd-core e CLI resolvível`, () => {
    const v = validateSkill(skillDir(s), { owned: true, root: KIT_ROOT });
    assert.deepEqual(v.errors, [], v.errors.join('\n'));
    const f = fm(s);
    assert.equal(f.metadata['sdd-core'], 'true');
    assert.ok(f.description.length >= 80 && f.description.length <= 1024);
    assert.match(f.description, /Use (quando|depois)/, 'descrição com gatilho explícito');
    const text = readFileSync(join(skillDir(s), 'SKILL.md'), 'utf8');
    assert.ok(text.split('\n').length < 120, 'SKILL.md curto (progressive disclosure)');
    // ${CLAUDE_SKILL_DIR}/../../../scripts/sdd.mjs resolve para a CLI tanto em cópia quanto em plugin
    assert.match(text, /\$\{CLAUDE_SKILL_DIR\}\/\.\.\/\.\.\/\.\.\/scripts\/sdd\.mjs/);
    assert.ok(existsSync(resolve(skillDir(s), '..', '..', '..', 'scripts', 'sdd.mjs')));
    const ev = JSON.parse(readFileSync(join(skillDir(s), 'evals', 'evals.json'), 'utf8'));
    assert.equal(ev.skill_name, s);
    assert.ok(ev.evals.length >= 2);
    for (const c of ev.evals) assert.ok(Array.isArray(c.expectations) && c.expectations.length, `${s}/${c.id} sem expectations`);
  });
}

test('workflows com efeito colateral só são invocados pelo usuário', () => {
  for (const s of SIDE_EFFECT) assert.equal(fm(s)['disable-model-invocation'], true, s);
  assert.equal(fm('sdd-status')['disable-model-invocation'], undefined, 'sdd-status é somente leitura');
});

test('comandos legados são aliases finos que apontam para a skill de mesmo nome', () => {
  for (const s of CORE) {
    const t = readFileSync(join(KIT_ROOT, '.claude', 'commands', `${s}.md`), 'utf8');
    assert.match(t, new RegExp(`\\.claude/skills/${s}/SKILL\\.md`));
    assert.match(t, /\$ARGUMENTS/);
    assert.match(t, /Remoção prevista: 4\.0\.0/);
    assert.ok(t.split('\n').length < 20);
  }
});

test('nenhum frontmatter do kit tem YAML inválido para parsers padrão', () => {
  const files = [
    ...readdirSync(join(KIT_ROOT, '.claude', 'commands')).map((f) => join(KIT_ROOT, '.claude', 'commands', f)),
    ...readdirSync(join(KIT_ROOT, '.claude', 'agents')).map((f) => join(KIT_ROOT, '.claude', 'agents', f)),
    ...CORE.map((s) => join(skillDir(s), 'SKILL.md')),
  ];
  const packs = join(KIT_ROOT, '.claude', 'skills', '_packs');
  for (const p of readdirSync(packs)) for (const s of readdirSync(join(packs, p))) {
    const f = join(packs, p, s, 'SKILL.md');
    if (existsSync(f)) files.push(f);
  }
  const bad = files.filter((f) => f.endsWith('.md')).map((f) => [f, strictYamlIssues(frontmatterOf(readFileSync(f, 'utf8')))]).filter(([, i]) => i.length);
  assert.deepEqual(bad, []);
});

test('motores em prosa viraram references das skills; caminhos v2 são stubs', () => {
  for (const [skill, ref] of [['gerar-projeto', 'GERADOR'], ['sdd-init', 'DISCOVERY'], ['sdd-init', 'AUDITORIA'], ['sdd-init', 'FECHAMENTO']]) {
    assert.ok(existsSync(join(skillDir(skill), 'references', `${ref}.md`)), ref);
  }
  for (const n of ['GERADOR', 'DISCOVERY', 'AUDITORIA']) {
    assert.match(readFileSync(join(KIT_ROOT, 'specs', '_gerador', `${n}.md`), 'utf8'), /movido para a skill/);
  }
  const gerador = readFileSync(join(skillDir('gerar-projeto'), 'references', 'GERADOR.md'), 'utf8');
  assert.ok(!gerador.includes('node scripts/sdd.mjs '), 'referência usa `sdd`, agnóstica ao modo');
});
