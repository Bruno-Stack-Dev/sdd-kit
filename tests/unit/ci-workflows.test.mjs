// Higiene dos workflows do GitHub Actions: SHAs fixados, permissões mínimas, sem gatilhos perigosos,
// segredos só nos workflows manuais/noturnos e nada de push/publicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT } from '../helpers.mjs';

const DIR = join(KIT_ROOT, '.github', 'workflows');
const WF = Object.fromEntries(readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => [f, readFileSync(join(DIR, f), 'utf8').split(String.fromCharCode(13)).join('')]));

test('workflows esperados existem', () => {
  assert.deepEqual(Object.keys(WF).sort(), ['agent-scan.yml', 'ci.yml', 'evals.yml']);
});

test('toda action é fixada por SHA de 40 caracteres com a tag em comentário', () => {
  for (const [f, text] of Object.entries(WF)) {
    for (const m of text.matchAll(/uses:\s*(\S+)(.*)/g)) {
      assert.match(m[1], /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${f}: ${m[1]} não está fixada por SHA`);
      assert.match(m[2], /#\s*v\d/, `${f}: ${m[1]} sem a tag em comentário`);
    }
  }
});

test('permissões mínimas e sem gatilhos perigosos', () => {
  for (const [f, text] of Object.entries(WF)) {
    assert.match(text, /^permissions:\n\s+contents: read$/m, `${f}: permissions: contents: read no topo`);
    assert.doesNotMatch(text, /pull_request_target|workflow_run/, `${f}: gatilho perigoso`);
    assert.doesNotMatch(text, /contents:\s*write|id-token:\s*write|packages:\s*write/, `${f}: permissão de escrita`);
    assert.doesNotMatch(text, /git push|npm publish|gh release/, `${f}: publicação/push não é papel do CI`);
    assert.match(text, /persist-credentials: false/, `${f}: checkout sem credenciais persistidas`);
  }
});

test('CI do PR não usa segredos nem dispara em dobro (push só na main)', () => {
  const ci = WF['ci.yml'];
  assert.doesNotMatch(ci, /secrets\./);
  assert.match(ci, /push:\n\s+branches: \[main\]/);
  for (const step of ['sdd-lint.mjs', 'doctor --full', 'doctor --security', 'skills verify', 'eval export-promptfoo', 'eval run', 'node --test', 'pytest']) {
    assert.ok(ci.includes(step), `ci.yml sem o passo '${step}'`);
  }
});

test('segredos só nos workflows manuais/noturnos, com NOT_RUN sem eles', () => {
  assert.match(WF['evals.yml'], /secrets\.ANTHROPIC_API_KEY/);
  assert.match(WF['evals.yml'], /workflow_dispatch/);
  assert.match(WF['evals.yml'], /@anthropic-ai\/claude-agent-sdk@\d+\.\d+\.\d+/);
  assert.match(WF['agent-scan.yml'], /secrets\.SNYK_TOKEN/);
  assert.doesNotMatch(WF['agent-scan.yml'], /schedule:|pull_request|push:/, 'agent scan só manual');
  assert.match(WF['agent-scan.yml'], /if: inputs\.consent/);
});
