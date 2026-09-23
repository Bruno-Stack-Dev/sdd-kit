// Observabilidade: trace local pelos hooks, redação, filtros, export OTLP (fail-open).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { KIT_ROOT, cleanup, writeFile, readFile, runNode, runSdd, SDD_CLI } from '../../helpers.mjs';
import { greenfieldProject } from '../../fixtures/project.mjs';
import { toOtlp, traceIdFor } from '../../../scripts/lib/trace.mjs';

const HOOK = join(KIT_ROOT, 'scripts', 'hooks', 'sdd-hook.mjs');
const hook = (event, input, root) => runNode(HOOK, [event], { cwd: root, input: JSON.stringify({ cwd: root, session_id: 'sess-obs', ...input }), env: { CLAUDE_PROJECT_DIR: root } });
const traceLines = (dir) => {
  const d = join(dir, '.sdd', 'trace');
  return existsSync(d) ? readdirSync(d).flatMap((f) => readFileSync(join(d, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))) : [];
};

test('hooks gravam trace correlacionado à tarefa em andamento, sem conteúdo e com segredo redigido', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--root', dir]);
    hook('session-start', { source: 'startup' }, dir);
    hook('subagent-start', { agent_type: 'agente-arquiteto-contratos' }, dir);
    hook('post-tool-use', { tool_name: 'Write', agent_type: 'agente-arquiteto-contratos', tool_input: { file_path: join(dir, 'src', 'types.ts'), content: 'SEGREDO-DE-CONTEUDO' } }, dir);
    const fake = 'ghp_' + 'a1'.repeat(18);
    hook('post-tool-use', { tool_name: 'Bash', tool_input: { command: `echo ${fake}` } }, dir);
    hook('pre-tool-use', { tool_name: 'Bash', tool_input: { command: 'git push --force' } }, dir);
    hook('subagent-stop', { agent_type: 'agente-arquiteto-contratos', stop_hook_active: false }, dir);
    hook('session-end', { reason: 'exit' }, dir);
    const t = traceLines(dir);
    const names = t.map((x) => x.name);
    for (const n of ['session.started', 'agent.spawned', 'file.modified', 'tool.completed', 'policy.decision', 'agent.stopped', 'session.finished']) assert.ok(names.includes(n), n);
    const mod = t.find((x) => x.name === 'file.modified');
    assert.equal(mod.attrs['sdd.task'], 'BIB-100/T-001');
    assert.equal(mod.attrs['sdd.spec'], 'BIB-100');
    assert.equal(mod.trace_id, traceIdFor('sess-obs'));
    const raw = readdirSync(join(dir, '.sdd', 'trace')).map((f) => readFileSync(join(dir, '.sdd', 'trace', f), 'utf8')).join('');
    assert.ok(!raw.includes('SEGREDO-DE-CONTEUDO'), 'conteúdo de arquivo nunca vai para o trace');
    assert.ok(!raw.includes(fake), 'segredo redigido');
    assert.match(raw, /REDACTED:github-token/);
    assert.equal(t.find((x) => x.name === 'policy.decision').attrs['policy.decision'], 'deny');
  } finally { cleanup(dir); }
});

test('observability.trace: false desliga o trace', () => {
  const dir = greenfieldProject();
  try {
    writeFile(dir, 'sdd.config.yaml', readFile(dir, 'sdd.config.yaml') + 'observability:\n  trace: false\n');
    hook('post-tool-use', { tool_name: 'Bash', tool_input: { command: 'ls' } }, dir);
    assert.equal(traceLines(dir).length, 0);
  } finally { cleanup(dir); }
});

test('trace show filtra por tarefa e agente, juntando trace e eventos de domínio', () => {
  const dir = greenfieldProject();
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    runSdd(['event', 'TASK_STARTED', '--task', 'BIB-100/T-001', '--session', 'sess-obs', '--root', dir]);
    hook('post-tool-use', { tool_name: 'Write', agent_type: 'agente-arquiteto-contratos', tool_input: { file_path: join(dir, 'src', 'a.ts') } }, dir);
    const items = JSON.parse(runSdd(['trace', 'show', '--task', 'BIB-100/T-001', '--json', '--root', dir]).stdout);
    assert.ok(items.some((i) => i.source === 'event' && i.name === 'task.started'));
    assert.ok(items.some((i) => i.source === 'trace' && i.name === 'file.modified'));
    const bySpec = JSON.parse(runSdd(['trace', 'show', '--spec', 'BIB-100', '--json', '--root', dir]).stdout);
    assert.ok(bySpec.length >= 2);
    assert.equal(JSON.parse(runSdd(['trace', 'show', '--agent', 'agente-inexistente', '--json', '--root', dir]).stdout).length, 0);
  } finally { cleanup(dir); }
});

test('toOtlp produz resourceSpans com traceId de 32 hex e spanId de 16 hex', () => {
  const o = toOtlp([{ source: 'trace', ts: '2026-09-23T10:00:00.000Z', trace_id: traceIdFor('s'), span_id: 'abcdef0123456789', name: 'tool.completed', session: 's', status: 'ok', attrs: { 'tool.name': 'Bash', n: 2 } }]);
  const span = o.resourceSpans[0].scopeSpans[0].spans[0];
  assert.match(span.traceId, /^[0-9a-f]{32}$/);
  assert.match(span.spanId, /^[0-9a-f]{16}$/);
  assert.equal(span.startTimeUnixNano, String(Date.parse('2026-09-23T10:00:00.000Z') * 1e6));
  assert.ok(span.attributes.some((a) => a.key === 'tool.name' && a.value.stringValue === 'Bash'));
  assert.equal(o.resourceSpans[0].resource.attributes[0].value.stringValue, 'sdd-kit');
});

function runAsync(args) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [SDD_CLI, ...args]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => res({ code, out }));
  });
}

test('trace export envia OTLP/HTTP ao backend; backend fora do ar não perde nada (fail-open)', async () => {
  const dir = greenfieldProject();
  const received = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { received.push({ url: req.url, type: req.headers['content-type'], body: JSON.parse(body) }); res.end('{}'); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/v1/traces`;
  try {
    runSdd(['tasks', 'sync', '--root', dir]);
    hook('session-start', { source: 'startup' }, dir);
    const ok = await runAsync(['trace', 'export', '--otlp', url, '--root', dir]);
    assert.equal(ok.code, 0, ok.out);
    assert.equal(received.length, 1);
    assert.equal(received[0].url, '/v1/traces');
    assert.equal(received[0].type, 'application/json');
    assert.ok(received[0].body.resourceSpans[0].scopeSpans[0].spans.length >= 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
  try {
    const down = await runAsync(['trace', 'export', '--otlp', url, '--root', dir]);
    assert.equal(down.code, 1);
    assert.match(down.out, /indisponível/);
    assert.ok(existsSync(join(dir, '.sdd', 'trace')), 'trace local preservado');
  } finally { cleanup(dir); }
});
