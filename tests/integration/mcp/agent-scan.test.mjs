// sdd scan agents: nunca executa sem consentimento, token e ferramenta; guarda a saída crua.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tempProject, cleanup, runSdd } from '../../helpers.mjs';

const win = process.platform === 'win32';

/** uvx falso: grava um marcador ao ser executado e imprime JSON. */
function fakeUvx(exitCode = 0) {
  const marker = 'EXECUTOU.txt';
  const files = win
    ? { 'uvx.cmd': `@echo off\r\necho executado > "%~dp0${marker}"\r\necho {"issues":[]}\r\nexit /b ${exitCode}\r\n` }
    : { uvx: `#!/bin/sh\necho executado > "$(dirname "$0")/${marker}"\necho '{"issues":[]}'\nexit ${exitCode}\n` };
  const dir = tempProject(files);
  return { dir, marker: join(dir, marker) };
}

// Em Unix o script precisa do bit de execução (no Windows o .cmd já é executável).
async function runChmod(file) {
  const fs = await import('node:fs');
  fs.chmodSync(file, 0o755);
}

const env = (bin, token) => ({ PATH: [bin, process.env.PATH].join(delimiter), ...(token ? { SNYK_TOKEN: 'tok-teste' } : { SNYK_TOKEN: '' }) });

test('sem --consent: NOT_RUN e nada é executado', async () => {
  const { dir: bin, marker } = fakeUvx();
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--root', dir], { env: env(bin, true) });
    assert.equal(r.status, 0);
    assert.match(r.out, /NOT_RUN — requer --consent/);
    assert.ok(!existsSync(marker));
  } finally { cleanup(bin); cleanup(dir); }
});

test('com --consent mas sem SNYK_TOKEN: NOT_RUN e nada é executado', async () => {
  const { dir: bin, marker } = fakeUvx();
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--run-mcp-servers', '--root', dir], { env: env(bin, false) });
    assert.match(r.out, /SNYK_TOKEN ausente/);
    assert.ok(!existsSync(marker));
  } finally { cleanup(bin); cleanup(dir); }
});

test('com consentimento e token: executa a versão fixada, guarda a saída crua e o doctor mostra', async () => {
  const { dir: bin, marker } = fakeUvx(0);
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--run-mcp-servers', '--json', '--root', dir], { env: env(bin, true) });
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'pass', r.out);
    assert.match(out.cmd, /snyk-agent-scan@0\.6\.4 scan .*\.mcp\.json --json --ci --dangerously-run-mcp-servers/);
    assert.ok(existsSync(marker));
    const reports = readdirSync(join(dir, '.sdd', 'reports')).filter((f) => f.startsWith('agent-scan-'));
    assert.equal(reports.length, 1);
    const d = JSON.parse(runSdd(['doctor', '--mcp', '--json', '--root', dir]).stdout);
    assert.equal(d.checks.find((c) => c.id === 'scanner.agent-scan').status, 'pass');
  } finally { cleanup(bin); cleanup(dir); }
});

test('com --consent mas sem --run-mcp-servers: NOT_RUN e nada é executado', async () => {
  const { dir: bin, marker } = fakeUvx();
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--root', dir], { env: env(bin, true) });
    assert.equal(r.status, 0);
    assert.match(r.out, /NOT_RUN — requer também --run-mcp-servers/);
    assert.ok(!existsSync(marker));
  } finally { cleanup(bin); cleanup(dir); }
});

test('doctor sem nenhum scan: NOT_RUN (nunca PASS)', () => {
  const dir = tempProject();
  try {
    const d = JSON.parse(runSdd(['doctor', '--mcp', '--json', '--root', dir]).stdout);
    assert.equal(d.checks.find((c) => c.id === 'scanner.agent-scan').status, 'not_run');
  } finally { cleanup(dir); }
});

test('falha do scanner: o diagnóstico sai na saída (runner descartável perde o relatório), com segredos redigidos', async () => {
  const fakeToken = 'ghp_' + 'a'.repeat(36);
  const msg = `Error: autenticacao recusada para ${fakeToken}`;
  const files = win
    ? { 'uvx.cmd': `@echo off\r\necho linha de progresso\r\necho ${msg} 1>&2\r\nexit /b 2\r\n` }
    : { uvx: `#!/bin/sh\necho 'linha de progresso'\necho '${msg}' 1>&2\nexit 2\n` };
  const bin = tempProject(files);
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--run-mcp-servers', '--root', dir], { env: env(bin, true) });
    assert.equal(r.status, 1);
    assert.match(r.out, /agent-scan FAIL \(exit 2\)/);
    assert.match(r.out, /autenticacao recusada/);
    assert.match(r.out, /\[REDACTED:github-token\]/);
    assert.doesNotMatch(r.out, new RegExp(fakeToken));
  } finally { cleanup(bin); cleanup(dir); }
});

test('resumo do JSON do scanner: erros e achados em qualquer nível, sem depender do schema', async () => {
  const { summarizeScanJson } = await import('../../../scripts/commands/scan.mjs');
  const json = JSON.stringify({ paths: [{ path: '/x/.mcp.json', error: 'falha ao iniciar o servidor', servers: [{ name: 's1', issues: [{ code: 'W001', message: 'descrição de ferramenta com instrução oculta', reference: 's1/tool' }] }] }] });
  const out = summarizeScanJson(`log antes do json\n${json}`).join('\n');
  assert.match(out, /erros \(1\)/);
  assert.match(out, /falha ao iniciar o servidor/);
  assert.match(out, /achados \(1\)/);
  assert.match(out, /\[W001\] descrição de ferramenta com instrução oculta \(s1\/tool\)/);
  assert.deepEqual(summarizeScanJson('sem json aqui'), []);
  assert.match(summarizeScanJson('{"ok":true}').join(' '), /sem erros nem achados reconhecíveis; chaves de topo: ok/);
});

test('falha com stderr só de instalação do uvx: o diagnóstico traz o resultado do stdout', async () => {
  const json = JSON.stringify({ issues: [{ code: 'E002', message: 'skill com prompt injection' }] });
  const files = win
    ? { 'out.json': json, 'uvx.cmd': `@echo off\r\necho Downloading pydantic-core (2.0MiB) 1>&2\r\necho Installed 55 packages in 16ms 1>&2\r\ntype "%~dp0out.json"\r\nexit /b 1\r\n` }
    : { 'out.json': json, uvx: `#!/bin/sh\necho 'Downloading pydantic-core (2.0MiB)' 1>&2\necho 'Installed 55 packages in 16ms' 1>&2\ncat "$(dirname "$0")/out.json"\nexit 1\n` };
  const bin = tempProject(files);
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--run-mcp-servers', '--root', dir], { env: env(bin, true) });
    assert.equal(r.status, 1);
    assert.match(r.out, /agent-scan FAIL \(exit 1\)/);
    assert.match(r.out, /\[E002\] skill com prompt injection/);
    assert.doesNotMatch(r.out, /Downloading pydantic-core/, 'ruído de instalação do uv é filtrado');
  } finally { cleanup(bin); cleanup(dir); }
});
