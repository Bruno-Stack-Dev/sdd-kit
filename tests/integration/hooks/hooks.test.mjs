// Hooks rodando como o Claude Code os roda: JSON no stdin, resposta no stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, cleanup, writeFile, runNode, runSdd } from '../../helpers.mjs';
import { greenfieldProject, spec } from '../../fixtures/project.mjs';

const HOOK = join(KIT_ROOT, 'scripts', 'hooks', 'sdd-hook.mjs');

function hook(event, input, root, env = {}) {
  const r = runNode(HOOK, [event], { cwd: root, input: JSON.stringify({ cwd: root, session_id: 'sess-1', ...input }), env: { CLAUDE_PROJECT_DIR: root, ...env } });
  let json = null;
  if (r.stdout.trim()) json = JSON.parse(r.stdout);
  return { ...r, json };
}

const decision = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? 'allow';

test('PreToolUse: deny, ask e allow no formato do Claude Code', () => {
  const dir = greenfieldProject();
  try {
    const deny = hook('pre-tool-use', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push --force' } }, dir);
    assert.equal(deny.status, 0);
    assert.equal(decision(deny), 'deny');
    assert.equal(deny.json.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(deny.json.hookSpecificOutput.permissionDecisionReason, /force-push/);
    assert.equal(decision(hook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'npm install left-pad' } }, dir)), 'ask');
    const allow = hook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'npm test' } }, dir);
    assert.equal(allow.stdout, '', 'allow = sem saída (valem as permissões normais)');
    assert.equal(decision(hook('pre-tool-use', { tool_name: 'Read', tool_input: { file_path: join(dir, '.env') } }, dir)), 'deny');
    assert.equal(decision(hook('pre-tool-use', { tool_name: 'Edit', tool_input: { file_path: join(dir, '.sdd', 'events.jsonl') } }, dir)), 'deny');
  } finally { cleanup(dir); }
});

test('PreToolUse: subagente auditor (agent_type) não escreve código', () => {
  const dir = greenfieldProject();
  try {
    const r = hook('pre-tool-use', { tool_name: 'Write', agent_type: 'agente-spec-guardian', tool_input: { file_path: join(dir, 'src', 'a.ts') } }, dir);
    assert.equal(decision(r), 'deny');
    assert.match(r.json.hookSpecificOutput.permissionDecisionReason, /auditor não altera/);
  } finally { cleanup(dir); }
});

test('PreToolUse: config do projeto endurece a política (protected_paths)', () => {
  const dir = greenfieldProject();
  try {
    const cfg = readFileSync(join(dir, 'sdd.config.yaml'), 'utf8') + 'security:\n  protected_paths:\n    - "dados-reais/**"\n';
    writeFile(dir, 'sdd.config.yaml', cfg);
    assert.equal(decision(hook('pre-tool-use', { tool_name: 'Read', tool_input: { file_path: join(dir, 'dados-reais', 'x.csv') } }, dir)), 'deny');
  } finally { cleanup(dir); }
});

test('PreToolUse: falha interna + comando destrutivo = deny (fail-closed); não destrutivo = não bloqueia', () => {
  const dir = greenfieldProject();
  try {
    const env = { SDD_HOOK_TEST_THROW: '1' };
    const d = hook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }, dir, env);
    assert.equal(decision(d), 'deny');
    assert.match(d.json.hookSpecificOutput.permissionDecisionReason, /fail-closed/);
    const ok = hook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'ls' } }, dir, env);
    assert.equal(ok.stdout, '');
    assert.equal(ok.status, 0);
    assert.match(ok.stderr, /erro interno ignorado/);
  } finally { cleanup(dir); }
});

test('PostToolUse: spec inválida bloqueia com o motivo; config YAML inválida também', () => {
  const dir = greenfieldProject();
  try {
    const file = join(dir, 'specs', 'features', 'BIB-100-acervo.md');
    writeFile(dir, 'specs/features/BIB-100-acervo.md', spec('BIB-100').replace('status: rascunho', 'status: pronta'));
    const r = hook('post-tool-use', { tool_name: 'Edit', tool_input: { file_path: file } }, dir);
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /status inválido 'pronta'/);
    writeFile(dir, 'specs/features/BIB-100-acervo.md', spec('BIB-100'));
    assert.equal(hook('post-tool-use', { tool_name: 'Edit', tool_input: { file_path: file } }, dir).stdout, '');
    writeFile(dir, 'sdd.config.yaml', 'version: 3\n');
    const c = hook('post-tool-use', { tool_name: 'Write', tool_input: { file_path: join(dir, 'sdd.config.yaml') } }, dir);
    assert.equal(c.json.decision, 'block');
    assert.match(c.json.reason, /campo obrigatório ausente/);
  } finally { cleanup(dir); }
});

test('PostToolUse: tarefa com ciclo bloqueia', () => {
  const dir = greenfieldProject();
  try {
    const rel = 'specs/tasks/BIB-110-emprestimo.md';
    writeFile(dir, rel, '---\ntarefas-de: BIB-110\n---\n- [ ] [T-001] a (@agente-frontend) 🔒 T-002\n- [ ] [T-002] b (@agente-frontend) 🔒 T-001\n');
    const r = hook('post-tool-use', { tool_name: 'Write', tool_input: { file_path: join(dir, rel) } }, dir);
    assert.match(r.json.reason, /ciclo/);
  } finally { cleanup(dir); }
});

test('SessionStart: contexto com CLI, config e retomada; registra sessão', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--root', dir]);
    const r = hook('session-start', { hook_event_name: 'SessionStart', source: 'startup' }, dir);
    const ctx = r.json.hookSpecificOutput.additionalContext;
    assert.match(ctx, /CLI determinística/);
    assert.match(ctx, /em andamento: BIB-100\/T-001/);
    assert.match(ctx, /Guardrails ativos/);
    assert.ok(existsSync(join(dir, '.sdd', 'cache', 'session.json')));
    const log = readFileSync(join(dir, '.sdd', 'events.jsonl'), 'utf8');
    assert.match(log, /"type":"SESSION_STARTED","session":"sess-1"/);
    // idempotente para a mesma sessão/origem (ex.: hook registrado duas vezes)
    hook('session-start', { source: 'startup' }, dir);
    assert.equal(readFileSync(join(dir, '.sdd', 'events.jsonl'), 'utf8').match(/SESSION_STARTED/g).length, 1);
  } finally { cleanup(dir); }
});

test('SessionStart fora de projeto SDD não emite nada', () => {
  const dir = greenfieldProject();
  try {
    const plain = join(dir, 'src');
    writeFile(dir, 'src/x.txt', 'x');
    assert.equal(hook('session-start', { source: 'startup' }, plain).stdout, '');
  } finally { cleanup(dir); }
});

test('Stop: spec implementada sem guardião bloqueia uma vez; stop_hook_active libera', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    writeFile(dir, 'specs/features/BIB-100-acervo.md', spec('BIB-100', { status: 'implementada' }));
    const r = hook('stop', { hook_event_name: 'Stop', stop_hook_active: false }, dir);
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /sem SPEC_IMPLEMENTED/);
    assert.equal(hook('stop', { stop_hook_active: true }, dir).stdout, '');
    assert.ok(existsSync(join(dir, '.sdd', 'reports', 'session-sess-1.md')));
  } finally { cleanup(dir); }
});

test('SubagentStop: tarefa em andamento do agente e revisão sem veredito', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--root', dir]);
    const r = hook('subagent-stop', { agent_type: 'agente-arquiteto-contratos' }, dir);
    assert.match(r.json.reason, /BIB-100\/T-001 ainda 'in_progress'/);
    assert.equal(hook('subagent-stop', { agent_type: 'agente-frontend' }, dir).stdout, '');
    runSdd(['event', 'GUARDIAN_STARTED', '--spec', 'BIB-100', '--root', dir]);
    assert.match(hook('subagent-stop', { agent_type: 'agente-spec-guardian' }, dir).json.reason, /sem veredito/);
    assert.equal(hook('subagent-stop', { agent_type: 'agente-spec-guardian', stop_hook_active: true }, dir).stdout, '');
  } finally { cleanup(dir); }
});

test('SessionEnd registra SESSION_FINISHED', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    hook('session-end', { hook_event_name: 'SessionEnd' }, dir);
    assert.match(readFileSync(join(dir, '.sdd', 'events.jsonl'), 'utf8'), /SESSION_FINISHED/);
  } finally { cleanup(dir); }
});

test('settings.json do kit registra os hooks críticos e nega segredos', () => {
  const s = JSON.parse(readFileSync(join(KIT_ROOT, '.claude', 'settings.json'), 'utf8'));
  for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'SubagentStop', 'Stop', 'SessionEnd']) {
    assert.ok(JSON.stringify(s.hooks[ev]).includes('sdd-hook.mjs'), ev);
  }
  assert.ok(s.permissions.deny.includes('Read(./.env)'));
  assert.ok(!s.permissions.allow.includes('Bash(npx:*)'), 'npx irrestrito saiu do allow');
});
