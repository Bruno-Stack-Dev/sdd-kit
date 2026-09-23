// sdd export-context: respeita .gitignore, exclui sensíveis/segredos/lockfiles/binários, dry-run não
// escreve, --redact redige, saída local não versionada, Repomix só com consentimento (NOT_RUN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempProject, cleanup, writeFile, runSdd } from '../helpers.mjs';
import { globToRegExp } from '../../scripts/lib/export-context.mjs';

const sdd = (dir, ...a) => runSdd([...a, '--root', dir]);
// Segredo sintético montado em partes (o próprio repositório não pode conter o literal).
const FAKE_KEY = ['sk', 'ant', 'api03', 'x'.repeat(30)].join('-');
const FAKE_AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';

function project() {
  const dir = tempProject({
    'src/app.js': 'export const soma = (a, b) => a + b;\n',
    'src/config.js': `export const key = "${FAKE_KEY}";\nexport const porta = 3000;\n`,
    'docs/README.md': 'Doc com ```crase tripla``` no meio.\n',
    '.env': 'DB_PASSWORD=supersecreta\n',
    '.env.example': 'DB_PASSWORD=\n',
    'certs/server.pem': 'conteúdo\n',
    'package-lock.json': '{}\n',
    'dist/bundle.js': 'ignorado pelo gitignore\n',
    '.gitignore': 'dist/\n',
    '.sdd/events.jsonl': '{}\n',
    '.sdd/.gitignore': 'state.json\n',
  });
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

test('globToRegExp: ** cruza diretórios; sem / casa em qualquer nível', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(globToRegExp('*.md').test('docs/README.md'));
  assert.ok(!globToRegExp('src/*.js').test('src/a/b.js'));
  assert.ok(globToRegExp('**/*.test.mjs').test('tests/unit/x.test.mjs'));
});

test('dry-run: lista inclusões e exclusões por motivo e não escreve nada', () => {
  const dir = project();
  try {
    const r = sdd(dir, 'export-context', '--dry-run', '--json');
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const inc = out.included.map((f) => f.path);
    const exc = Object.fromEntries(out.excluded.map((e) => [e.path, e.reason]));
    assert.ok(inc.includes('src/app.js') && inc.includes('docs/README.md') && inc.includes('.env.example'));
    assert.equal(exc['.env'], 'sensível');
    assert.equal(exc['certs/server.pem'], 'sensível');
    assert.equal(exc['src/config.js'], 'segredo');
    assert.equal(exc['package-lock.json'], 'lockfile');
    assert.equal(exc['logo.png'], 'binário');
    assert.ok(!inc.includes('dist/bundle.js') && !exc['dist/bundle.js'], 'respeita .gitignore');
    assert.ok(!inc.some((p) => p.startsWith('.sdd/')));
    assert.doesNotMatch(r.stdout, new RegExp(FAKE_KEY), 'nunca imprime o segredo');
    assert.ok(!existsSync(join(dir, '.sdd', 'context')));
  } finally { cleanup(dir); }
});

test('gera markdown local sem segredos, com fence seguro, e ignora .sdd/context/ no git', () => {
  const dir = project();
  try {
    const r = sdd(dir, 'export-context', '--json');
    assert.equal(r.status, 0, r.stderr);
    const res = JSON.parse(r.stdout);
    const md = readFileSync(res.out, 'utf8');
    assert.match(md, /# Contexto do projeto/);
    assert.match(md, /### src\/app\.js/);
    assert.doesNotMatch(md, new RegExp(FAKE_KEY));
    assert.doesNotMatch(md, /supersecreta/);
    assert.match(md, /````markdown\nDoc com ```crase tripla```/, 'fence maior que a maior sequência de crases do conteúdo');
    assert.deepEqual(res.secrets_excluded.map((e) => e.path), ['src/config.js']);
    assert.match(readFileSync(join(dir, '.sdd', '.gitignore'), 'utf8'), /^context\/$/m);
  } finally { cleanup(dir); }
});

test('--redact inclui o arquivo com o segredo redigido; --include recorta; xml funciona', () => {
  const dir = project();
  try {
    writeFile(dir, 'src/aws.js', `const id = "${FAKE_AWS}";\n`);
    const out = join(dir, 'out', 'ctx.xml');
    const r = sdd(dir, 'export-context', '--redact', '--include', 'src/**', '--format', 'xml', '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const xml = readFileSync(out, 'utf8');
    assert.match(xml, /<file path="src\/config\.js" redacted="true">/);
    assert.match(xml, /\[REDACTED:anthropic-key\]/);
    assert.match(xml, /\[REDACTED:aws-access-key\]/);
    assert.doesNotMatch(xml, new RegExp(FAKE_KEY));
    assert.doesNotMatch(xml, /docs\/README\.md/, '--include recorta');
  } finally { cleanup(dir); }
});

test('Repomix sem --consent é NOT_RUN e não executa nada', () => {
  const dir = project();
  try {
    const r = sdd(dir, 'export-context', '--repomix');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /NOT_RUN/);
    assert.match(r.stdout, /repomix@1\.18\.1/);
    assert.doesNotMatch(r.stdout, /--no-security-check/);
    assert.ok(!existsSync(join(dir, '.sdd', 'context')) || readdirSync(join(dir, '.sdd', 'context')).length === 0);
  } finally { cleanup(dir); }
});
