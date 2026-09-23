// Contratos do kit que precisam sobreviver à migração v2 → v3 (Fase 0).
// Escritos de forma agnóstica ao formato: um workflow pode ser um comando legado
// (.claude/commands/<nome>.md) ou uma Agent Skill (.claude/skills/<nome>/), desde que o /nome exista
// e continue roteando para o mesmo motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT } from '../helpers.mjs';

const V2_WORKFLOWS = [
  'sdd-init', 'sdd-status', 'gerar-projeto', 'gerar-skills',
  'nova-spec', 'implementar-spec', 'implementar-tarefa', 'validar-e2e',
];

function readTree(dir) {
  let text = '';
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) text += readTree(p);
    else if (name.endsWith('.md')) text += `\n${readFileSync(p, 'utf8')}`;
  }
  return text;
}

/** Texto completo de um workflow: comando legado + skill (SKILL.md e references/). */
function workflowText(name) {
  let text = '';
  const cmd = join(KIT_ROOT, '.claude', 'commands', `${name}.md`);
  if (existsSync(cmd)) text += readFileSync(cmd, 'utf8');
  const skillDir = join(KIT_ROOT, '.claude', 'skills', name);
  if (existsSync(skillDir)) text += readTree(skillDir);
  return text;
}

for (const name of V2_WORKFLOWS) {
  test(`/${name} continua invocável (comando ou skill com o mesmo nome)`, () => {
    const cmd = existsSync(join(KIT_ROOT, '.claude', 'commands', `${name}.md`));
    const skill = existsSync(join(KIT_ROOT, '.claude', 'skills', name, 'SKILL.md'));
    assert.ok(cmd || skill, `nem comando nem skill para /${name}`);
  });
}

test('/sdd-init roteia para discovery (novo) e auditoria (existente)', () => {
  const t = workflowText('sdd-init');
  assert.match(t, /DISCOVERY\.md/);
  assert.match(t, /AUDITORIA\.md/);
});

test('/gerar-projeto executa o motor GERADOR', () => {
  assert.match(workflowText('gerar-projeto'), /GERADOR\.md/);
});

test('/implementar-spec, /implementar-tarefa e /validar-e2e usam $ARGUMENTS', () => {
  for (const n of ['implementar-spec', 'implementar-tarefa', 'validar-e2e']) {
    assert.match(workflowText(n), /\$ARGUMENTS/, n);
  }
});

test('/sdd-status é somente leitura', () => {
  assert.match(workflowText('sdd-status'), /[Ss]omente leitura|read-only|não edite/);
});

test('/gerar-skills aciona o agente gerador de skills', () => {
  assert.match(workflowText('gerar-skills'), /agente-gerador-skills/);
});

test('os 12 agentes v2 continuam existindo', () => {
  const expected = [
    'agente-acessibilidade', 'agente-arquiteto-contratos', 'agente-arquiteto-guardian',
    'agente-backend', 'agente-devops', 'agente-e2e', 'agente-frontend', 'agente-gerador-skills',
    'agente-mock-data', 'agente-qa-testes', 'agente-revisor-ux', 'agente-spec-guardian',
  ];
  for (const a of expected) {
    assert.ok(existsSync(join(KIT_ROOT, '.claude', 'agents', `${a}.md`)), a);
  }
});

function templateFrontmatter(name) {
  const text = readFileSync(join(KIT_ROOT, 'specs', '_templates', name), 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, `${name} sem frontmatter`);
  return m[1];
}

test('template de spec declara spec-id, titulo, status, cas e depende-de', () => {
  const fm = templateFrontmatter('template-spec.md');
  for (const k of ['spec-id', 'titulo', 'status', 'cas', 'depende-de']) {
    assert.match(fm, new RegExp(`^${k}:`, 'm'), k);
  }
});

test('relacionamentos spec → plano → tarefas pelos campos de frontmatter', () => {
  assert.match(templateFrontmatter('template-plano.md'), /^spec-relacionada:/m);
  const t = templateFrontmatter('template-tarefas.md');
  assert.match(t, /^tarefas-de:/m);
  assert.match(t, /^plano-relacionado:/m);
  assert.match(templateFrontmatter('template-adr.md'), /^adr-id:/m);
});

// Gramática v2 de uma linha de tarefa. O parser do grafo de tarefas (Fase 2) precisa aceitá-la.
export const TASK_LINE =
  /^\s*- \[( |~|!|x|-)\] \[(T-\d{3,})\] (.+?) \((@agente-[a-z0-9-]+)\)(?:\s*🔒\s*(T-\d{3,}(?:\s*,\s*T-\d{3,})*))?\s*$/u;

test('toda linha de tarefa do template segue a gramática v2', () => {
  const text = readFileSync(join(KIT_ROOT, 'specs', '_templates', 'template-tarefas.md'), 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => /^\s*- \[.\] \[T-/.test(l));
  assert.ok(lines.length >= 7, 'template deveria ter ao menos 7 tarefas');
  for (const l of lines) assert.match(l, TASK_LINE, l);
});

test('templates de discovery usam doc-id', () => {
  for (const f of ['visao', 'requisitos', 'fluxos', 'modelo-dados', 'arquitetura', 'api', 'rbac', 'backlog', 'infra']) {
    assert.match(templateFrontmatter(`template-${f}.md`), /^doc-id:/m, f);
  }
});

test('config de exemplo mantém as 12 seções numeradas', () => {
  const text = readFileSync(join(KIT_ROOT, 'sdd.config.example.md'), 'utf8');
  for (let n = 1; n <= 12; n++) assert.match(text, new RegExp(`^## ${n}\\. `, 'm'), `seção ${n}`);
});
