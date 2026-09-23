import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, delimiter } from 'node:path';
import { detectLanguages } from '../../../scripts/lib/lsp.mjs';
import { tempProject, cleanup, runSdd } from '../../helpers.mjs';

function withPath(dirs, fn) {
  const old = process.env.PATH;
  process.env.PATH = dirs.join(delimiter);
  try { return fn(); } finally { process.env.PATH = old; }
}

test('detecta linguagens por manifesto e extensão, sem falsos positivos de package.json sozinho', () => {
  const dir = tempProject({
    'go.mod': 'module x\n', 'cmd/main.go': 'package main\n',
    'api/pyproject.toml': '[project]\n', 'api/app.py': 'x=1\n',
    'svc/App.csproj': '<Project/>', 'svc/Program.cs': 'class P{}',
    'package.json': '{"name":"tools-only"}',
    'lib/tool.rb': 'puts 1\n',
  });
  try {
    const r = withPath([], () => detectLanguages(dir));
    const langs = r.languages.map((l) => l.language).sort();
    assert.deepEqual(langs, ['csharp', 'go', 'python']);
    assert.deepEqual(r.unsupported, ['ruby']);
    const go = r.languages.find((l) => l.language === 'go');
    assert.equal(go.plugin, 'gopls-lsp@claude-plugins-official');
    assert.equal(go.binaryFound, false);
  } finally { cleanup(dir); }
});

test('encontra o language server no PATH sem executá-lo', () => {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const bin = tempProject({ [`typescript-language-server${ext}`]: 'echo nunca executado' });
  const dir = tempProject({ 'tsconfig.json': '{}', 'src/a.ts': 'export const a = 1;\n' });
  try {
    const r = withPath([bin], () => detectLanguages(dir));
    const ts = r.languages.find((l) => l.language === 'typescript');
    assert.equal(ts.binaryFound, true);
    assert.match(ts.binaryPath, /typescript-language-server/);
  } finally { cleanup(bin); cleanup(dir); }
});

test('doctor avisa quando há linguagem tipada sem code intelligence habilitado', () => {
  const dir = tempProject({ 'go.mod': 'module x\n', 'main.go': 'package main\n', 'sdd.config.yaml': 'version: 3\n' });
  try {
    const d = JSON.parse(runSdd(['doctor', '--project', '--json', '--root', dir]).stdout);
    const c = d.checks.find((x) => x.id === 'lsp');
    assert.equal(c.status, 'warn');
    assert.match(c.details.join(' '), /gopls-lsp/);
  } finally { cleanup(dir); }
});
