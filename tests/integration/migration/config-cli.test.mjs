// Fluxo de migração v2 → v3 pela CLI, num projeto temporário.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, tempProject, cleanup, writeFile, readFile, runSdd, runLint } from '../../helpers.mjs';

const FILLED = readFileSync(join(KIT_ROOT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-filled.md'), 'utf8');

test('config migrate: gera YAML válido, preserva o .md original e o troca pela visão gerada', () => {
  const dir = tempProject({ 'sdd.config.md': FILLED });
  try {
    const r = runSdd(['config', 'migrate', '--root', dir]);
    assert.equal(r.status, 0, r.out);
    assert.ok(existsSync(join(dir, 'sdd.config.yaml')));
    const backups = readdirSync(join(dir, '.sdd', 'backup'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(dir, '.sdd', 'backup', backups[0]), 'utf8'), FILLED);
    assert.match(readFile(dir, 'sdd.config.md'), /AUTO-GENERATED — DO NOT EDIT DIRECTLY/);
    assert.equal(runSdd(['config', 'validate', '--root', dir]).status, 0);
    assert.equal(runSdd(['config', 'render', '--check', '--root', dir]).status, 0);
    // o lint (fast path) também aceita
    assert.equal(runLint(dir).status, 0);
  } finally { cleanup(dir); }
});

test('config migrate recusa sobrescrever YAML existente sem --force', () => {
  const dir = tempProject({ 'sdd.config.md': FILLED, 'sdd.config.yaml': 'version: 3\n' });
  try {
    const r = runSdd(['config', 'migrate', '--root', dir]);
    assert.equal(r.status, 2);
    assert.match(r.out, /já existe/);
  } finally { cleanup(dir); }
});

test('config validate: exit 1 e caminho do erro para config inválida; --json é parseável', () => {
  const dir = tempProject({ 'sdd.config.yaml': 'version: 3\nproject:\n  name: X\n' });
  try {
    const r = runSdd(['config', 'validate', '--root', dir]);
    assert.equal(r.status, 1);
    assert.match(r.out, /\/commands: campo obrigatório ausente/);
    const j = JSON.parse(runSdd(['config', 'validate', '--json', '--root', dir]).stdout);
    assert.equal(j.valid, false);
    assert.ok(j.errors.some((e) => e.path === '/pipelines'));
  } finally { cleanup(dir); }
});

test('sdd-lint reprova sdd.config.yaml inválido (gate do Passo 0)', () => {
  const dir = tempProject({ 'sdd.config.yaml': 'version: 3\n' });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 1);
    assert.match(r.out, /✖ sdd\.config\.yaml: \/project: campo obrigatório ausente/);
  } finally { cleanup(dir); }
});

test('config render --check detecta visão desatualizada', () => {
  const dir = tempProject({ 'sdd.config.md': FILLED });
  try {
    runSdd(['config', 'migrate', '--root', dir]);
    writeFile(dir, 'sdd.config.yaml', readFile(dir, 'sdd.config.yaml').replace('Biblioteca Escolar', 'Outro Nome'));
    assert.equal(runSdd(['config', 'render', '--check', '--root', dir]).status, 1);
    assert.equal(runSdd(['config', 'render', '--root', dir]).status, 0);
    assert.equal(runSdd(['config', 'render', '--check', '--root', dir]).status, 0);
  } finally { cleanup(dir); }
});

test('sem config: validate falha com orientação; comando desconhecido é erro de uso', () => {
  const dir = tempProject();
  try {
    const r = runSdd(['config', 'validate', '--root', dir]);
    assert.equal(r.status, 1);
    assert.match(r.out, /nenhuma config encontrada/);
    assert.equal(runSdd(['nao-existe']).status, 2);
  } finally { cleanup(dir); }
});
