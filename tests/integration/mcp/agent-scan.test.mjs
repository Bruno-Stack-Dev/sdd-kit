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
    const r = runSdd(['scan', 'agents', '--consent', '--root', dir], { env: env(bin, false) });
    assert.match(r.out, /SNYK_TOKEN ausente/);
    assert.ok(!existsSync(marker));
  } finally { cleanup(bin); cleanup(dir); }
});

test('com consentimento e token: executa a versão fixada, guarda a saída crua e o doctor mostra', async () => {
  const { dir: bin, marker } = fakeUvx(0);
  const dir = tempProject({ '.mcp.json': '{"mcpServers":{}}' });
  try {
    if (!win) await runChmod(join(bin, 'uvx'));
    const r = runSdd(['scan', 'agents', '--consent', '--json', '--root', dir], { env: env(bin, true) });
    const out = JSON.parse(r.stdout);
    assert.equal(out.status, 'pass', r.out);
    assert.match(out.cmd, /snyk-agent-scan@0\.6\.4 scan .*\.mcp\.json --json --ci/);
    assert.ok(existsSync(marker));
    const reports = readdirSync(join(dir, '.sdd', 'reports')).filter((f) => f.startsWith('agent-scan-'));
    assert.equal(reports.length, 1);
    const d = JSON.parse(runSdd(['doctor', '--mcp', '--json', '--root', dir]).stdout);
    assert.equal(d.checks.find((c) => c.id === 'scanner.agent-scan').status, 'pass');
  } finally { cleanup(bin); cleanup(dir); }
});

test('doctor sem nenhum scan: NOT_RUN (nunca PASS)', () => {
  const dir = tempProject();
  try {
    const d = JSON.parse(runSdd(['doctor', '--mcp', '--json', '--root', dir]).stdout);
    assert.equal(d.checks.find((c) => c.id === 'scanner.agent-scan').status, 'not_run');
  } finally { cleanup(dir); }
});
