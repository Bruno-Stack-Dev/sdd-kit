// Instalação em modo plugin e cópia, upgrade com backup e migração de um projeto v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, tempProject, cleanup, writeFile, readFile, runSdd, runNode } from '../../helpers.mjs';
import { mergeSettings, upsertClaudeBlock, compareVersions, CLAUDE_BEGIN, engineFiles } from '../../../scripts/lib/install.mjs';
import { ENGINE_VERSION } from '../../../scripts/lib/engine.mjs';

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('init --mode plugin: só estado do projeto; settings referencia o plugin, sem hooks locais', () => {
  const dir = tempProject({ 'README.md': '# app\n' });
  try {
    const r = runSdd(['init', '--mode', 'plugin', '--root', dir]);
    assert.equal(r.status, 0, r.out);
    assert.ok(existsSync(join(dir, 'sdd.config.yaml')));
    for (const d of ['features', 'plans', 'tasks', 'decisions', 'discovery', '_entrada']) assert.ok(existsSync(join(dir, 'specs', d)), d);
    assert.ok(!existsSync(join(dir, 'scripts')), 'modo plugin não copia o motor');
    assert.ok(!existsSync(join(dir, 'specs', '_gerador')));
    const s = json(join(dir, '.claude', 'settings.json'));
    assert.equal(s.enabledPlugins['sdd-kit@sdd-kit'], true);
    assert.equal(s.extraKnownMarketplaces['sdd-kit'].source.repo, 'Bruno-Stack-Dev/sdd-kit');
    assert.equal(s.hooks, undefined);
    assert.ok(s.permissions.deny.includes('Read(./.env)'));
    assert.ok(readFile(dir, 'CLAUDE.md').includes(CLAUDE_BEGIN));
    assert.equal(json(join(dir, '.sdd', 'engine.json')).mode, 'plugin');
  } finally { cleanup(dir); }
});

test('init --mode copy: motor copiado funciona sozinho (CLI, hooks, doctor)', () => {
  const dir = tempProject();
  try {
    assert.equal(runSdd(['init', '--mode', 'copy', '--root', dir]).status, 0);
    for (const f of ['scripts/sdd.mjs', 'scripts/hooks/sdd-hook.mjs', 'policies/sdd-policy.json', 'schemas/sdd-config.schema.json', 'specs/_gerador/GERADOR.md', '.claude/agents/agente-spec-guardian.md']) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    const s = json(join(dir, '.claude', 'settings.json'));
    assert.ok(JSON.stringify(s.hooks.PreToolUse).includes('sdd-hook.mjs'));
    const v = runNode(join(dir, 'scripts', 'sdd.mjs'), ['version'], { cwd: dir });
    assert.match(v.stdout, new RegExp(ENGINE_VERSION.replace(/\./g, '\\.')));
    // o motor copiado roda o doctor contra o próprio projeto (config do exemplo tem placeholders críticos)
    const d = JSON.parse(runNode(join(dir, 'scripts', 'sdd.mjs'), ['doctor', '--fast', '--json'], { cwd: dir }).stdout);
    assert.ok(d.checks.some((c) => c.id === 'config.valid' && c.status === 'fail'));
  } finally { cleanup(dir); }
});

test('init é idempotente (não duplica bloco do CLAUDE.md nem hooks)', () => {
  const dir = tempProject();
  try {
    runSdd(['init', '--mode', 'copy', '--root', dir]);
    runSdd(['init', '--mode', 'copy', '--root', dir]);
    assert.equal(readFile(dir, 'CLAUDE.md').split(CLAUDE_BEGIN).length, 2);
    const s = json(join(dir, '.claude', 'settings.json'));
    assert.equal(s.hooks.PreToolUse.length, 1);
  } finally { cleanup(dir); }
});

test('init recusa o repositório do motor', () => {
  assert.equal(runSdd(['init', '--root', KIT_ROOT]).status, 2);
});

test('upgrade (cópia): restaura arquivo do motor com backup, relata obsoletos, preserva allow do projeto', () => {
  const dir = tempProject();
  try {
    runSdd(['init', '--mode', 'copy', '--root', dir]);
    writeFile(dir, 'specs/_gerador/GERADOR.md', '# versão local alterada\n');
    writeFile(dir, 'scripts/lib/velho.mjs', '// removido na versão nova\n');
    const s = json(join(dir, '.claude', 'settings.json'));
    s.permissions.allow.push('Bash(go test:*)');
    writeFile(dir, '.claude/settings.json', JSON.stringify(s));
    const r = JSON.parse(runSdd(['upgrade', '--json', '--root', dir]).stdout);
    assert.ok(r.actions.some((a) => a.kind === 'updated' && a.path === 'specs/_gerador/GERADOR.md'));
    assert.ok(r.actions.some((a) => a.kind === 'obsolete' && a.path === 'scripts/lib/velho.mjs'));
    assert.ok(existsSync(join(dir, 'scripts', 'lib', 'velho.mjs')), 'obsoleto não é apagado');
    assert.equal(readFile(dir, 'specs/_gerador/GERADOR.md'), readFileSync(join(KIT_ROOT, 'specs', '_gerador', 'GERADOR.md'), 'utf8'));
    assert.equal(readFileSync(join(r.backup, 'specs', '_gerador', 'GERADOR.md'), 'utf8'), '# versão local alterada\n');
    assert.ok(json(join(dir, '.claude', 'settings.json')).permissions.allow.includes('Bash(go test:*)'));
  } finally { cleanup(dir); }
});

test('upgrade em modo plugin não copia nada', () => {
  const dir = tempProject();
  try {
    runSdd(['init', '--mode', 'plugin', '--root', dir]);
    const r = runSdd(['upgrade', '--root', dir]);
    assert.equal(r.status, 0);
    assert.match(r.out, /plugin update/);
    assert.ok(!existsSync(join(dir, 'scripts')));
  } finally { cleanup(dir); }
});

test('migração v2 → v3 ponta a ponta: upgrade + config migrate + import-ledger + doctor', () => {
  const dir = tempProject();
  try {
    // simula um projeto instalado com o kit v2: motor antigo copiado + config e ledger escritos à mão
    writeFile(dir, 'scripts/sdd-lint.mjs', '// sdd-lint v2\n');
    writeFile(dir, 'specs/_gerador/GERADOR.md', '# GERADOR v2\n');
    writeFile(dir, '.claude/agents/agente-frontend.md', '---\nname: agente-frontend\ndescription: versão v2 customizada\n---\n');
    writeFile(dir, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Read', 'Bash(npx:*)'], deny: ['Bash(git push:*)'] } }));
    writeFile(dir, 'sdd.config.md', readFileSync(join(KIT_ROOT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-filled.md'), 'utf8'));
    writeFile(dir, 'specs/features/BIB-100-acervo.md', '---\nspec-id: BIB-100\ntitulo: Acervo\nstatus: implementada\ncas: 1\ndepende-de: []\n---\n- **CA-01**: x\n');
    writeFile(dir, 'specs/_gerador/LEDGER-biblioteca.md', '| # | Spec | Slug | Depende de | Estado |\n|---|---|---|---|---|\n| 1 | `BIB-100` | acervo | — | feita |\n');

    const up = JSON.parse(runSdd(['upgrade', '--json', '--root', dir]).stdout);
    assert.ok(up.actions.some((a) => a.path === '.claude/agents/agente-frontend.md' && a.kind === 'updated'));
    const backupAgent = join(up.backup, '.claude', 'agents', 'agente-frontend.md');
    assert.match(readFileSync(backupAgent, 'utf8'), /versão v2 customizada/, 'customização v2 preservada no backup');

    const cli = (...a) => runNode(join(dir, 'scripts', 'sdd.mjs'), a, { cwd: dir });
    assert.equal(cli('config', 'migrate').status, 0);
    assert.equal(cli('state', 'import-ledger', 'specs/_gerador/LEDGER-biblioteca.md').status, 0);
    assert.equal(cli('tasks', 'sync').status, 0);
    const st = JSON.parse(cli('state', 'show', '--json').stdout);
    assert.equal(st.specs['BIB-100'].status, 'implemented');
    assert.equal(st.specs['BIB-100'].imported, true);
    const d = JSON.parse(cli('doctor', '--project', '--json').stdout);
    assert.deepEqual(d.checks.filter((c) => c.status === 'fail'), [], JSON.stringify(d.checks.filter((c) => c.status === 'fail'), null, 2));
    // allowlist v2 mantida (decisão do usuário), mas o doctor aponta o npx irrestrito
    const sec = JSON.parse(cli('doctor', '--security', '--json').stdout);
    assert.equal(sec.checks.find((c) => c.id === 'settings.broad-allow').status, 'warn');
    assert.equal(sec.checks.find((c) => c.id === 'hooks.pretooluse').status, 'pass');
  } finally { cleanup(dir); }
});

test('mergeSettings: preserva hooks próprios do projeto e substitui os do SDD', () => {
  const project = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'meu-hook.sh' }] }, { matcher: 'X', hooks: [{ type: 'command', command: 'node scripts/hooks/sdd-hook.mjs pre-tool-use --velho' }] }] } };
  const engine = { hooks: { PreToolUse: [{ matcher: 'Bash|Read', hooks: [{ type: 'command', command: 'node sdd-hook.mjs pre-tool-use' }] }] }, permissions: { allow: [], deny: ['a'] } };
  const m = mergeSettings(project, engine);
  assert.equal(m.hooks.PreToolUse.length, 2);
  assert.ok(m.hooks.PreToolUse.some((h) => JSON.stringify(h).includes('meu-hook.sh')));
  assert.ok(!JSON.stringify(m.hooks).includes('--velho'));
  const plugin = mergeSettings(m, engine, { withHooks: false, plugin: true });
  assert.equal(plugin.hooks.PreToolUse.length, 1, 'modo plugin remove só os hooks locais do SDD');
});

test('upsertClaudeBlock não duplica bloco v2 colado à mão', () => {
  const v2 = '# Projeto\n\n## Spec-Driven Development (SDD Kit)\n\ntexto antigo\n';
  assert.equal(upsertClaudeBlock(v2), v2);
  const once = upsertClaudeBlock('# P\n');
  assert.equal(upsertClaudeBlock(once), once);
});

test('compareVersions entende pré-release', () => {
  assert.equal(compareVersions('3.0.0-dev', '3.0.0'), -1);
  assert.equal(compareVersions('3.1.0', '3.0.9'), 1);
  assert.equal(compareVersions('3.0.0', '3.0.0'), 0);
});

test('manifesto do plugin: caminhos existem, versões em sincronia, hooks via CLAUDE_PLUGIN_ROOT', () => {
  const plugin = json(join(KIT_ROOT, '.claude-plugin', 'plugin.json'));
  assert.equal(plugin.name, 'sdd-kit');
  assert.equal(plugin.version, ENGINE_VERSION);
  for (const k of ['commands', 'agents', 'skills', 'hooks']) assert.ok(existsSync(join(KIT_ROOT, plugin[k])), k);
  const market = json(join(KIT_ROOT, '.claude-plugin', 'marketplace.json'));
  assert.equal(market.plugins.find((p) => p.name === 'sdd-kit').version, ENGINE_VERSION);
  const hooks = json(join(KIT_ROOT, 'hooks', 'hooks.json'));
  for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStop', 'Stop', 'SessionEnd']) {
    assert.match(JSON.stringify(hooks.hooks[ev]), /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/hooks\/sdd-hook\.mjs/, ev);
  }
  // os eventos dos hooks do plugin e do modo cópia são os mesmos
  const settings = json(join(KIT_ROOT, '.claude', 'settings.json'));
  assert.deepEqual(Object.keys(hooks.hooks).sort(), Object.keys(settings.hooks).sort());
});

test('lista de arquivos do motor não inclui testes, docs nem CI', () => {
  const files = engineFiles();
  assert.ok(files.includes('scripts/sdd.mjs'));
  assert.ok(!files.some((f) => /^(tests|docs|\.github)\//.test(f)));
});

test('packs como plugins: manifesto próprio, versão do motor e skills no diretório do pack', () => {
  const market = json(join(KIT_ROOT, '.claude-plugin', 'marketplace.json'));
  const packs = market.plugins.filter((p) => p.name !== 'sdd-kit');
  assert.deepEqual(packs.map((p) => p.name).sort(), ['sdd-ai', 'sdd-architecture', 'sdd-design-system', 'sdd-uiux']);
  for (const p of packs) {
    const m = json(join(KIT_ROOT, p.source, '.claude-plugin', 'plugin.json'));
    assert.equal(m.name, p.name);
    assert.equal(m.version, ENGINE_VERSION);
    assert.equal(m.skills, './');
    const skills = readdirSync(join(KIT_ROOT, p.source)).filter((d) => existsSync(join(KIT_ROOT, p.source, d, 'SKILL.md')));
    assert.ok(skills.length >= 7, `${p.name}: ${skills.length} skills`);
  }
});
