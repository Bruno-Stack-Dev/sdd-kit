// Estado estruturado ponta a ponta pela CLI: registro, recusa, retomada, interrupção, sync, ledger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, readFile, writeFile, runSdd, SDD_CLI } from '../../helpers.mjs';
import { greenfieldProject } from '../../fixtures/project.mjs';

const sdd = (dir, ...args) => runSdd([...args, '--root', dir]);
const events = (dir) => readFileSync(join(dir, '.sdd', 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('fluxo completo: sync → tarefas → guardião aprova → spec implementada → ledger', () => {
  const dir = greenfieldProject();
  try {
    assert.equal(sdd(dir, 'tasks', 'sync').status, 0);
    assert.equal(sdd(dir, 'tasks', 'ready', '--json').stdout.includes('BIB-100/T-001'), true);
    for (const t of ['T-001', 'T-002', 'T-003']) {
      assert.equal(sdd(dir, 'event', 'TASK_STARTED', '--task', `BIB-100/${t}`).status, 0);
      assert.equal(sdd(dir, 'event', 'TASK_COMPLETED', '--task', `BIB-100/${t}`).status, 0);
    }
    assert.equal(sdd(dir, 'event', 'TEST_PASSED', '--spec', 'BIB-100', '--command', 'npm test').status, 0);
    assert.equal(sdd(dir, 'event', 'TASK_STARTED', '--task', 'BIB-100/T-004').status, 0);
    // guardião não conclui antes da aprovação
    const early = sdd(dir, 'event', 'TASK_COMPLETED', '--task', 'BIB-100/T-004');
    assert.equal(early.status, 1);
    assert.match(early.out, /GUARDIAN_APPROVED/);
    assert.equal(sdd(dir, 'event', 'GUARDIAN_STARTED', '--spec', 'BIB-100').status, 0);
    assert.equal(sdd(dir, 'event', 'GUARDIAN_APPROVED', '--spec', 'BIB-100', '--evidence', '.sdd/reports/guardian-BIB-100.md').status, 0);
    assert.equal(sdd(dir, 'event', 'TASK_COMPLETED', '--task', 'BIB-100/T-004').status, 0);
    assert.equal(sdd(dir, 'event', 'SPEC_IMPLEMENTED', '--spec', 'BIB-100').status, 0);
    // checkboxes reescritos a partir do estado
    assert.equal(sdd(dir, 'tasks', 'sync').status, 0);
    assert.match(readFile(dir, 'specs/tasks/BIB-100-acervo.md'), /- \[x\] \[T-004\]/);
    // ledger derivado
    assert.equal(sdd(dir, 'state', 'ledger').status, 0);
    const ledger = readFile(dir, 'specs/_gerador/LEDGER-biblioteca-escolar.md');
    assert.match(ledger, /AUTO-GENERATED/);
    assert.match(ledger, /\| 1 \| `BIB-100` \| Acervo \| — \| feita \| 4\/4 \| aprovada \|/);
    assert.match(ledger, /\| 2 \| `BIB-110` \| Empréstimo \| BIB-100 \| pendente \| 0\/4 \|/);
    assert.equal(sdd(dir, 'state', 'ledger', '--check').status, 0);
    assert.equal(sdd(dir, 'state', 'verify').status, 0);
  } finally { cleanup(dir); }
});

test('ID de tarefa local ambíguo é recusado com sugestão', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    const r = sdd(dir, 'event', 'TASK_STARTED', '--task', 'T-001');
    assert.equal(r.status, 2);
    assert.match(r.out, /ambígua: BIB-100\/T-001, BIB-110\/T-001/);
  } finally { cleanup(dir); }
});

test('dependência pendente bloqueia TASK_STARTED (gate de ordem)', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    const r = sdd(dir, 'event', 'TASK_STARTED', '--task', 'BIB-100/T-002');
    assert.equal(r.status, 1);
    assert.match(r.out, /dependências não concluídas: BIB-100\/T-001/);
  } finally { cleanup(dir); }
});

test('sync é idempotente (segunda execução não grava eventos)', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    const before = events(dir).length;
    sdd(dir, 'tasks', 'sync');
    assert.equal(events(dir).length, before);
  } finally { cleanup(dir); }
});

test('retomada após interrupção: sessão aberta, tarefa em andamento e próximas prontas', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'event', 'SESSION_STARTED', '--session', 'sessao-1');
    sdd(dir, 'tasks', 'sync');
    sdd(dir, 'event', 'TASK_STARTED', '--task', 'BIB-100/T-001');
    sdd(dir, 'event', 'TASK_BLOCKED', '--task', 'BIB-110/T-001', '--reason', 'aguardando contrato de BIB-100');
    // "crash": sem SESSION_FINISHED. Uma nova sessão pede o resumo.
    const r = JSON.parse(sdd(dir, 'state', 'resume', '--json').stdout);
    assert.deepEqual(r.open_sessions.map((s) => s.id), ['sessao-1']);
    assert.deepEqual(r.tasks_in_progress.map((t) => t.id), ['BIB-100/T-001']);
    assert.equal(r.tasks_blocked[0].reason, 'aguardando contrato de BIB-100');
    assert.ok(r.active_specs.some((s) => s.id === 'BIB-100' && s.status === 'in_progress'));
    const text = sdd(dir, 'state', 'resume').stdout;
    assert.match(text, /sessões sem SESSION_FINISHED/);
    assert.match(text, /em andamento: BIB-100\/T-001/);
  } finally { cleanup(dir); }
});

test('cauda truncada (escrita interrompida): gravação recusada até o repair, que preserva o trecho', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    appendFileSync(join(dir, '.sdd', 'events.jsonl'), '{"v":1,"id":"quebrad');
    assert.equal(sdd(dir, 'state', 'verify').status, 1);
    const r = sdd(dir, 'event', 'TASK_STARTED', '--task', 'BIB-100/T-001');
    assert.equal(r.status, 1);
    assert.match(r.out, /state repair/);
    assert.equal(sdd(dir, 'state', 'repair').status, 0);
    const backups = readdirSync(join(dir, '.sdd', 'backup'));
    assert.ok(backups.some((f) => f.startsWith('events-tail-')));
    assert.equal(sdd(dir, 'state', 'verify').status, 0);
    assert.equal(sdd(dir, 'event', 'TASK_STARTED', '--task', 'BIB-100/T-001').status, 0);
  } finally { cleanup(dir); }
});

test('state.json editado à mão é detectado e reconstruído', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    const f = join(dir, '.sdd', 'state.json');
    const st = JSON.parse(readFileSync(f, 'utf8'));
    st.specs['BIB-100'].status = 'implemented';
    writeFileSync(f, JSON.stringify(st));
    const v = sdd(dir, 'state', 'verify');
    assert.equal(v.status, 1);
    assert.match(v.out, /diverge do events\.jsonl/);
    assert.equal(sdd(dir, 'state', 'rebuild').status, 0);
    assert.equal(sdd(dir, 'state', 'verify').status, 0);
  } finally { cleanup(dir); }
});

test('adoção v2: checkboxes existentes entram como importados; LEDGER v2 é importável', () => {
  const dir = greenfieldProject({
    'specs/tasks/BIB-100-acervo.md': '---\ntarefas-de: BIB-100\n---\n- [x] [T-001] a (@agente-arquiteto-contratos)\n- [~] [T-002] b (@agente-frontend) 🔒 T-001\n',
    'specs/_gerador/LEDGER-antigo.md': '| # | Spec | Slug | Depende de | Estado |\n|---|---|---|---|---|\n| 1 | `BIB-100` | acervo | — | em-andamento |\n| 2 | `BIB-090` | legado | — | feita |\n',
  });
  try {
    assert.equal(sdd(dir, 'state', 'import-ledger', 'specs/_gerador/LEDGER-antigo.md').status, 0);
    assert.equal(sdd(dir, 'tasks', 'sync').status, 0);
    const st = JSON.parse(sdd(dir, 'state', 'show', '--json').stdout);
    assert.equal(st.specs['BIB-090'].status, 'implemented');
    assert.equal(st.specs['BIB-090'].imported, true);
    assert.equal(st.tasks['BIB-100/T-001'].status, 'completed');
    assert.equal(st.tasks['BIB-100/T-002'].status, 'in_progress');
    assert.equal(st.tasks['BIB-100/T-002'].imported, true);
  } finally { cleanup(dir); }
});

test('appends concorrentes (5 processos) não perdem nem corrompem eventos', async () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    const before = events(dir).length;
    const run = (i) => new Promise((res) => {
      const p = spawn(process.execPath, [SDD_CLI, 'event', 'TEST_PASSED', '--spec', 'BIB-100', '--command', `run-${i}`, '--root', dir]);
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('close', (code) => res({ code, err }));
    });
    const results = await Promise.all([0, 1, 2, 3, 4].map(run));
    assert.deepEqual(results.map((r) => r.code), [0, 0, 0, 0, 0], results.map((r) => r.err).join(' | '));
    const after = events(dir);
    assert.equal(after.length, before + 5);
    assert.equal(new Set(after.map((e) => e.id)).size, after.length);
    assert.equal(sdd(dir, 'state', 'verify').status, 0);
    assert.ok(!existsSync(join(dir, '.sdd', 'events.lock')));
  } finally { cleanup(dir); }
});

test('.sdd/ recebe .gitignore (derivados) e .gitattributes (merge=union no log)', () => {
  const dir = greenfieldProject();
  try {
    sdd(dir, 'tasks', 'sync');
    assert.match(readFile(dir, '.sdd/.gitignore'), /^state\.json$/m);
    assert.match(readFile(dir, '.sdd/.gitattributes'), /events\.jsonl merge=union/);
  } finally { cleanup(dir); }
});

test('spec next-id segue a config', () => {
  const dir = greenfieldProject();
  try {
    assert.equal(sdd(dir, 'spec', 'next-id').stdout.trim(), 'BIB-120');
    assert.equal(sdd(dir, 'spec', 'next-id', '--new-block').stdout.trim(), 'BIB-200');
    writeFile(dir, 'sdd.config.yaml', readFile(dir, 'sdd.config.yaml').replace('prefix: BIB-', 'prefix: "<ex.: SPEC->"'));
    assert.equal(sdd(dir, 'spec', 'next-id').status, 1);
  } finally { cleanup(dir); }
});
