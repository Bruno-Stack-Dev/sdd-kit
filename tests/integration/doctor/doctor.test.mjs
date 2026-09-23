// sdd doctor: projeto saudável, projeto quebrado, saída JSON estável, NOT_RUN honesto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, writeFile, runSdd, KIT_ROOT } from '../../helpers.mjs';
import { greenfieldProject, spec, tasks, STANDARD_TASKS } from '../../fixtures/project.mjs';

const doctor = (dir, ...args) => runSdd(['doctor', ...args, '--root', dir]);
const json = (dir, ...args) => JSON.parse(doctor(dir, ...args, '--json').stdout);
const byId = (r, id) => r.checks.find((c) => c.id === id);

test('projeto greenfield saudável: fast e project sem falhas', () => {
  const dir = greenfieldProject();
  try {
    for (const mode of ['--fast', '--project']) {
      const r = json(dir, mode);
      const fails = r.checks.filter((c) => c.status === 'fail');
      assert.deepEqual(fails, [], `${mode}: ${JSON.stringify(fails, null, 2)}`);
      assert.notEqual(r.summary.overall, 'NOT_READY');
    }
    assert.equal(doctor(dir, '--project').status, 0);
  } finally { cleanup(dir); }
});

test('saída JSON tem forma estável (mode, checks[], summary.overall)', () => {
  const dir = greenfieldProject();
  try {
    const r = json(dir, '--fast');
    assert.equal(r.mode, 'fast');
    assert.ok(Array.isArray(r.checks) && r.checks.length > 3);
    for (const c of r.checks) {
      assert.ok(['pass', 'warn', 'fail', 'not_run', 'skip'].includes(c.status));
      assert.equal(typeof c.id, 'string');
      assert.equal(typeof c.group, 'string');
    }
    assert.ok(['READY', 'READY_WITH_WARNINGS', 'NOT_READY'].includes(r.summary.overall));
  } finally { cleanup(dir); }
});

function brokenProject() {
  return greenfieldProject({
    // spec implementada sem trilha do guardião + cas divergente do corpo
    'specs/features/BIB-100-acervo.md': spec('BIB-100', { status: 'implementada', cas: 2, title: 'Acervo' }).replace('cas: 2', 'cas: 5'),
    // ciclo e dependência inexistente
    'specs/tasks/BIB-110-emprestimo.md': tasks('BIB-110', [
      { id: 'T-001', agent: 'agente-frontend', deps: ['T-002'] },
      { id: 'T-002', agent: 'agente-frontend', deps: ['T-001'] },
      { id: 'T-003', agent: 'agente-qa-testes', deps: ['T-404'] },
    ]),
    // plano órfão
    'specs/plans/BIB-999-fantasma.md': '---\nplano-id: BIB-999\nspec-relacionada: BIB-999\n---\n',
    // ADR inválido
    'specs/decisions/ADR-001-x.md': '---\nadr-id: ADR-002\ntitulo: x\nstatus: talvez\n---\n',
    // padrão proibido violado
    'src/relogio.ts': 'export const agora = () => Date.now();\n',
    // segredo e arquivo sensível (fora do git: o doctor varre o disco)
    'src/config.ts': 'const k = "AKIA' + 'ABCDEFGHIJKLMNOP";\n',
    '.env': 'SENHA=123\n',
  });
}

test('projeto quebrado: cada defeito vira falha identificável', () => {
  const dir = brokenProject();
  try {
    // cria trilha de estado para a spec (para o doctor saber que ela NÃO foi aprovada)
    runSdd(['event', 'SPEC_CREATED', '--spec', 'BIB-100', '--root', dir]);
    const r = json(dir, '--full');
    const failText = r.checks.filter((c) => c.status === 'fail').map((c) => `${c.id}: ${c.title}\n${c.details.join('\n')}`).join('\n');
    assert.match(failText, /'cas: 5' mas o corpo tem 2 CA/);
    assert.match(failText, /frontmatter 'implementada', mas o estado diz 'draft'/);
    assert.match(failText, /ciclo de dependência entre tarefas/);
    assert.match(failText, /depende de 'BIB-110\/T-404', que não existe/);
    assert.match(failText, /plano de 'BIB-999', que não existe/);
    assert.match(failText, /nome do arquivo não começa com o adr-id 'ADR-002'/);
    assert.match(failText, /status inválido 'talvez'/);
    assert.match(failText, /Date\\\.now\\\(\\\)\/ em src\/: 1 ocorrência/);
    assert.match(failText, /src\/config\.ts:1: possível aws-access-key/);
    assert.match(failText, /\.env parece segredo/);
    assert.equal(r.summary.overall, 'NOT_READY');
    assert.equal(doctor(dir, '--full').status, 1);
  } finally { cleanup(dir); }
});

test('check forbidden: exit 1 com violação, lista file:linha; improved quando abaixo do esperado', () => {
  const dir = brokenProject();
  try {
    const r = runSdd(['check', 'forbidden', '--root', dir]);
    assert.equal(r.status, 1);
    assert.match(r.out, /src\/relogio\.ts:1/);
    writeFile(dir, 'src/relogio.ts', 'export const agora = () => 0;\n');
    assert.equal(runSdd(['check', 'forbidden', '--root', dir]).status, 0);
  } finally { cleanup(dir); }
});

test('scanner externo ausente é NOT_RUN, nunca PASS', () => {
  const dir = greenfieldProject();
  try {
    const r = json(dir, '--skills');
    const s = byId(r, 'scanner.skill-scanner');
    assert.equal(s.status, 'not_run');
  } finally { cleanup(dir); }
});

test('--strict transforma avisos em NOT_READY', () => {
  const dir = greenfieldProject();
  try {
    const normal = json(dir, '--fast');
    if (normal.summary.warn > 0) {
      assert.equal(doctor(dir, '--fast', '--strict').status, 1);
    }
  } finally { cleanup(dir); }
});

test('modos múltiplos são erro de uso', () => {
  assert.equal(runSdd(['doctor', '--fast', '--full', '--root', KIT_ROOT]).status, 2);
});

test('no repositório do motor, valida o próprio motor em vez de exigir config', () => {
  const r = JSON.parse(runSdd(['doctor', '--fast', '--json', '--root', KIT_ROOT]).stdout);
  assert.equal(byId(r, 'engine.mode').status, 'pass');
  assert.equal(byId(r, 'engine.example').status, 'pass');
  assert.equal(byId(r, 'engine.example-view').status, 'pass');
  assert.equal(r.checks.find((c) => c.id === 'config.present'), undefined);
});

test('tarefas e specs do kit padrão: projeto com STANDARD_TASKS não tem agentes desconhecidos', () => {
  const dir = greenfieldProject({ 'specs/tasks/BIB-110-emprestimo.md': tasks('BIB-110', STANDARD_TASKS) });
  try {
    assert.equal(byId(json(dir, '--fast'), 'tasks.graph').status, 'pass');
  } finally { cleanup(dir); }
});
