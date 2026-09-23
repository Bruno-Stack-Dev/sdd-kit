// Adapters para outros clientes: skills no padrão aberto, CLI substituída, instruções do projeto,
// instalação sem sobrescrever o que não é do adapter e detecção de adapter desatualizado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, tempProject, cleanup, writeFile, runSdd } from '../../helpers.mjs';
import { stringifyYaml } from '../../../scripts/lib/yaml.mjs';
import { baseConfig } from '../../fixtures/project.mjs';
import { portSkill, mergeBlock, TARGETS } from '../../../scripts/lib/adapters.mjs';
import { validateSkill, frontmatterOf, strictYamlIssues } from '../../../scripts/lib/skills.mjs';
import { parseYaml } from '../../../scripts/lib/yaml.mjs';

const sdd = (dir, ...a) => runSdd([...a, '--root', dir]);
const SK = ['.claude', 'skills'].join('/');

/** Projeto em modo cópia mínimo: CLI + skills núcleo + agentes + config com regras e gate. */
function copyModeProject() {
  const dir = tempProject({
    'sdd.config.yaml': stringifyYaml(baseConfig({ rules: ['Nada de any no TypeScript.'], human_gates: [{ id: 'G1', name: 'Aprovar exclusão de acervo' }] })),
    'scripts/sdd.mjs': '// stub: a CLI real vem do motor em modo cópia\n',
  });
  cpSync(join(KIT_ROOT, '.claude', 'skills'), join(dir, '.claude', 'skills'), { recursive: true, filter: (p) => !/[\\/]_packs([\\/]|$)/.test(p) });
  cpSync(join(KIT_ROOT, '.claude', 'agents'), join(dir, '.claude', 'agents'), { recursive: true });
  return dir;
}

test('portSkill: só campos da spec, CLI relativa, sem ${CLAUDE_SKILL_DIR}, nota de efeito colateral', () => {
  const src = readFileSync(join(KIT_ROOT, '.claude', 'skills', 'implementar-tarefa', 'SKILL.md'), 'utf8');
  const { text, dropped } = portSkill(src, 'codex');
  assert.ok(dropped.includes('disable-model-invocation'));
  const fm = parseYaml(frontmatterOf(text));
  assert.deepEqual(Object.keys(fm).filter((k) => !['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(k)), []);
  assert.equal(fm.metadata['sdd-adapter'], 'codex');
  assert.match(fm.metadata['sdd-claude-only'], /disable-model-invocation/);
  assert.deepEqual(strictYamlIssues(frontmatterOf(text)), []);
  assert.doesNotMatch(text, /CLAUDE_SKILL_DIR|\$ARGUMENTS/);
  assert.match(text, /`node scripts\/sdd\.mjs`/);
  assert.match(text, /Execução só a pedido explícito do usuário/);
  assert.match(text, /ARGUMENTOS/);
});

test('mergeBlock preserva o conteúdo fora do bloco e é idempotente', () => {
  const a = mergeBlock('# Meu projeto\n\nregra minha\n', 'bloco v1');
  const b = mergeBlock(a, 'bloco v2');
  assert.match(b, /regra minha/);
  assert.match(b, /bloco v2/);
  assert.doesNotMatch(b, /bloco v1/);
  assert.equal(mergeBlock(b, 'bloco v2'), b);
});

test('build sem --install gera em .sdd/adapters/<alvo>/ para todos os alvos, skills válidas', () => {
  const dir = copyModeProject();
  try {
    for (const target of Object.keys(TARGETS)) {
      const r = sdd(dir, 'adapters', 'build', target, '--json');
      assert.equal(r.status, 0, r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.count, 9);
      const skillsDir = join(dir, '.sdd', 'adapters', target, TARGETS[target].skills);
      for (const s of readdirSync(skillsDir).filter((n) => !n.startsWith('.') && !n.startsWith('_'))) {
        const v = validateSkill(join(skillsDir, s));
        assert.deepEqual(v.errors, [], `${target}/${s}: ${v.errors.join('; ')}`);
        assert.deepEqual(v.warnings, [], `${target}/${s}: ${v.warnings.join('; ')}`);
      }
      assert.ok(existsSync(join(skillsDir, '_template-skill.md')), 'apoio viaja junto');
      const instr = readFileSync(join(dir, '.sdd', 'adapters', target, TARGETS[target].instructions), 'utf8');
      assert.match(instr, /Nada de any no TypeScript/);
      assert.match(instr, /Aprovar exclusão de acervo/);
      assert.match(instr, /agente-spec-guardian/);
      assert.match(instr, /GUARDIAN_APPROVED/);
    }
    assert.ok(!existsSync(join(dir, 'AGENTS.md')), 'sem --install nada vai para os caminhos do cliente');
  } finally { cleanup(dir); }
});

test('--install preserva AGENTS.md do usuário e não sobrescreve skill alheia; status detecta desatualização', () => {
  const dir = copyModeProject();
  try {
    writeFile(dir, 'AGENTS.md', '# Regras da equipe\n\nUse pnpm.\n');
    writeFile(dir, '.agents/skills/nova-spec/SKILL.md', '---\nname: nova-spec\ndescription: skill do time, não do adapter.\n---\n# minha\n');
    let r = sdd(dir, 'adapters', 'build', 'codex', '--install');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /não foi gerada pelo adapter — mantida/);
    assert.match(readFileSync(join(dir, '.agents/skills/nova-spec/SKILL.md'), 'utf8'), /skill do time/);
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    assert.match(agents, /Use pnpm/);
    assert.match(agents, /SDD-KIT:BEGIN/);
    assert.equal(sdd(dir, 'adapters', 'status').status, 0);
    // A skill de origem muda → adapter desatualizado (status e doctor).
    writeFile(dir, `${SK}/sdd-status/SKILL.md`, readFileSync(join(dir, SK, 'sdd-status', 'SKILL.md'), 'utf8') + '\nNova regra.\n');
    const st = sdd(dir, 'adapters', 'status', '--json');
    assert.equal(st.status, 1);
    assert.deepEqual(JSON.parse(st.stdout)[0].stale, ['sdd-status']);
    const rep = JSON.parse(sdd(dir, 'doctor', '--skills', '--json').stdout);
    assert.equal(rep.checks.find((c) => c.id === 'adapters.codex').status, 'warn');
    // Rebuild resolve.
    r = sdd(dir, 'adapters', 'build', 'codex', '--install');
    assert.equal(r.status, 0);
    assert.equal(sdd(dir, 'adapters', 'status').status, 0);
  } finally { cleanup(dir); }
});

test('--packs inclui skills e apoio do pack; modo plugin (sem CLI no projeto) é recusado', () => {
  const dir = copyModeProject();
  const plugin = tempProject({ 'sdd.config.yaml': stringifyYaml(baseConfig()) });
  try {
    const r = sdd(dir, 'adapters', 'build', 'generic', '--packs', 'ai', '--json');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).count, 17);
    assert.ok(existsSync(join(dir, '.sdd/adapters/generic/skills/_ai-references/AVALIACAO-DE-TECNOLOGIA.md')));
    mkdirSync(join(plugin, '.claude', 'skills', 'x'), { recursive: true });
    const p = sdd(plugin, 'adapters', 'build', 'codex');
    assert.notEqual(p.status, 0);
    assert.match(p.stderr + p.stdout, /modo cópia/);
  } finally { cleanup(dir); cleanup(plugin); }
});
