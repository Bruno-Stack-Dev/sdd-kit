// sdd spec new / template: artefatos gerados a partir da pipeline da config e registrados no estado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, runSdd, readFile } from '../../helpers.mjs';
import { greenfieldProject } from '../../fixtures/project.mjs';

const sdd = (dir, ...a) => runSdd([...a, '--root', dir]);

test('spec new cria spec/plano/tarefas com ID da config e uma tarefa por etapa', () => {
  const dir = greenfieldProject();
  try {
    const r = sdd(dir, 'spec', 'new', '--slug', 'multas', '--title', 'Multas por atraso', '--depends', 'BIB-110', '--json');
    assert.equal(r.status, 0, r.out);
    const out = JSON.parse(r.stdout);
    assert.equal(out.id, 'BIB-120');
    const specText = readFile(dir, 'specs/features/BIB-120-multas.md');
    assert.match(specText, /^spec-id: BIB-120$/m);
    assert.match(specText, /^titulo: Multas por atraso$/m);
    assert.match(specText, /^depende-de: \[BIB-110\]$/m);
    const tasksText = readFile(dir, 'specs/tasks/BIB-120-multas.md');
    const lines = tasksText.split('\n').filter((l) => l.startsWith('- [ ] [T-'));
    assert.equal(lines.length, 4, 'pipeline frontend da fixture tem 4 etapas');
    assert.match(lines[3], /\(@agente-spec-guardian\) 🔒 T-003$/);
    assert.match(readFile(dir, 'specs/plans/BIB-120-multas.md'), /pipeline: frontend/);
    const st = JSON.parse(sdd(dir, 'state', 'show', '--json').stdout);
    assert.equal(st.specs['BIB-120'].status, 'planned');
    assert.equal(st.tasks['BIB-120/T-001'].status, 'pending');
    assert.equal(st.tasks['BIB-120/T-004'].agent, 'agente-spec-guardian');
    const d = JSON.parse(sdd(dir, 'doctor', '--fast', '--json').stdout);
    assert.equal(d.checks.find((c) => c.id === 'tasks.graph').status, 'pass');
  } finally { cleanup(dir); }
});

test('spec new: pipeline inexistente, dependência inexistente e slug inválido são erros de uso', () => {
  const dir = greenfieldProject();
  try {
    assert.equal(sdd(dir, 'spec', 'new', '--slug', 'x', '--pipeline', 'nao-existe').status, 2);
    assert.equal(sdd(dir, 'spec', 'new', '--slug', 'x', '--depends', 'BIB-999').status, 2);
    assert.equal(sdd(dir, 'spec', 'new', '--slug', 'Com Espaço').status, 2);
    assert.equal(readdirSync(join(dir, 'specs', 'features')).length, 2, 'nada foi criado');
  } finally { cleanup(dir); }
});

test('spec new --new-block abre o próximo bloco de centena', () => {
  const dir = greenfieldProject();
  try {
    assert.equal(JSON.parse(sdd(dir, 'spec', 'new', '--slug', 'modulo-novo', '--new-block', '--json').stdout).id, 'BIB-200');
  } finally { cleanup(dir); }
});

test('template show devolve o template do motor; nome desconhecido é erro', () => {
  const dir = greenfieldProject();
  try {
    assert.match(sdd(dir, 'template', 'show', 'adr').stdout, /^adr-id: ADR-NNN$/m);
    assert.match(sdd(dir, 'template', 'show', 'config').stdout, /^version: 3$/m);
    assert.equal(sdd(dir, 'template', 'show', 'inexistente').status, 2);
  } finally { cleanup(dir); }
});
