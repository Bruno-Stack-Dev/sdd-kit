import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSkill } from '../../../scripts/lib/skills.mjs';
import { scanText, redact, isSensitivePath } from '../../../scripts/lib/secrets.mjs';
import { tempProject, cleanup } from '../../helpers.mjs';
import { join } from 'node:path';

const skill = (fm, body = '# x\n') => `---\n${fm}\n---\n${body}`;

function check(name, content, extra = {}, opts = {}) {
  const dir = tempProject({ [`s/${name}/SKILL.md`]: content, ...extra });
  try { return validateSkill(join(dir, 's', name), opts); } finally { cleanup(dir); }
}

test('skill conforme à spec Agent Skills', () => {
  const r = check('minha-skill', skill('name: minha-skill\ndescription: Faz algo útil. Use quando precisar.\nlicense: MIT\nmetadata:\n  autor: kit'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('name fora do padrão, hífen duplo, maiúscula, diferente do diretório', () => {
  for (const n of ['Minha', 'a--b', '-a', 'a-']) {
    const r = check('x', skill(`name: "${n}"\ndescription: d`));
    assert.ok(r.errors.some((e) => /padrão Agent Skills|difere/.test(e)), n);
  }
});

test('campos fora da spec: aviso para vendorizada, erro para skill do kit', () => {
  const content = skill('name: s\ndescription: d\npack: x\ninputs: [a]');
  assert.ok(check('s', content).warnings.some((w) => /fora da spec.*pack, inputs/.test(w)));
  assert.ok(check('s', content, {}, { owned: true }).errors.some((e) => /fora da spec/.test(e)));
});

test('extensões do Claude Code são reconhecidas como informação, não erro', () => {
  const r = check('s', skill('name: s\ndescription: d\ndisable-model-invocation: true\nargument-hint: "[x]"'), {}, { owned: true });
  assert.deepEqual(r.errors, []);
  assert.match(r.info[0], /disable-model-invocation, argument-hint/);
});

test('links para references/ inexistentes e evals malformadas', () => {
  const r = check('s', skill('name: s\ndescription: d', 'veja [ref](references/nao.md)\n'), { 's/s/evals/evals.json': '{"skill_name":"outra","evals":[{"id":1}]}' }, { owned: true });
  assert.ok(r.errors.some((e) => /references\/nao\.md/.test(e)));
  assert.ok(r.errors.some((e) => /skill_name 'outra'/.test(e)));
  assert.ok(r.errors.some((e) => /caso 0 precisa de id, prompt e expected_output/.test(e)));
});

test('description acima de 1024 é erro', () => {
  const r = check('s', skill(`name: s\ndescription: ${'a'.repeat(1025)}`));
  assert.ok(r.errors.some((e) => /1025 caracteres/.test(e)));
});

// Segredos falsos montados por concatenação para este arquivo não disparar o scanner.
const FAKE = {
  aws: 'AKIA' + 'Z'.repeat(16),
  gh: 'ghp_' + 'a1'.repeat(18),
  ant: 'sk-ant-' + 'x'.repeat(30),
  pk: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
};

test('scanText detecta segredos comuns e respeita o marcador de exceção', () => {
  const text = [`a = "${FAKE.aws}"`, `t = ${FAKE.gh}`, FAKE.pk, `k = ${FAKE.ant} // sdd-secrets: allow`, 'nada aqui'].join('\n');
  const ids = scanText(text).map((h) => `${h.id}@${h.line}`);
  assert.deepEqual(ids, ['aws-access-key@1', 'github-token@2', 'private-key@3']);
});

test('redact substitui segredos', () => {
  const out = redact(`token=${FAKE.gh} e ${FAKE.aws}`);
  assert.ok(!out.includes(FAKE.gh) && !out.includes(FAKE.aws));
  assert.match(out, /\[REDACTED:github-token\]/);
});

test('isSensitivePath: .env e chaves sim; exemplos e chaves públicas não', () => {
  for (const p of ['.env', 'app/.env.local', '.env.production', 'id_rsa', 'certs/server.pem', 'deploy/key.p12', 'home/.ssh/config', 'credentials.json', 'gcp-service-account.json']) {
    assert.equal(isSensitivePath(p), true, p);
  }
  for (const p of ['.env.example', '.env.sample', 'id_rsa.pub', 'src/env.ts', 'README.md', 'docs/secrets.md']) {
    assert.equal(isSensitivePath(p), false, p);
  }
});
