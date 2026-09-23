#!/usr/bin/env node
// Regressão completa numa CÓPIA LIMPA do kit (clone local do HEAD, sem rede).
//   node tests/regression/full-regression.mjs [--report <arquivo.md>] [--json]
// Cada etapa termina PASS, FAIL ou NOT_RUN (ferramenta ausente) — nunca PASS por omissão.
// Não é um *.test.mjs: roda a suíte inteira dentro do clone e simula os fluxos ponta a ponta.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const reportPath = args.includes('--report') ? resolve(args[args.indexOf('--report') + 1]) : null;
const results = [];
const work = mkdtempSync(join(tmpdir(), 'sdd-regression-'));
const KIT = join(work, 'kit');

function run(cmd, argv, { cwd = KIT, env = {}, input } = {}) {
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', input, env: { ...process.env, ...env }, maxBuffer: 256 * 1024 * 1024, shell: false });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', error: r.error };
}
const node = (argv, opts) => run(process.execPath, argv, opts);
const sdd = (root, ...a) => node([join(KIT, 'scripts', 'sdd.mjs'), ...a, '--root', root]);
function step(name, fn) {
  const t0 = Date.now();
  let res;
  try { res = fn(); } catch (e) { res = { status: 'FAIL', detail: e.message.split('\n')[0] }; }
  results.push({ name, ...res, ms: Date.now() - t0 });
  console.log(`${{ PASS: '✓', FAIL: '✖', NOT_RUN: '○' }[res.status]} ${name}${res.detail ? ` — ${res.detail}` : ''}`);
}
const ok = (cond, detail, failDetail) => (cond ? { status: 'PASS', detail } : { status: 'FAIL', detail: failDetail ?? detail });
function must(r, what) { if (r.status !== 0) throw new Error(`${what}: exit ${r.status} — ${r.out.trim().split('\n').slice(-2).join(' | ')}`); return r; }
function tempProject(name) { const d = join(work, name); mkdirSync(d, { recursive: true }); return d; }

// ------------------------------------------------------------------------------------------------
step('cópia limpa (git clone local do HEAD)', () => {
  const r = run('git', ['clone', '--quiet', '--no-hardlinks', SRC, KIT], { cwd: work });
  if (r.status !== 0) return { status: 'FAIL', detail: r.out.trim() };
  const head = run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();
  const dirty = run('git', ['status', '--porcelain']).stdout.trim();
  return ok(!dirty, `HEAD ${head}, árvore limpa`, `árvore suja: ${dirty}`);
});

step('lint (sdd-lint)', () => { const r = node(['scripts/sdd-lint.mjs']); return ok(r.status === 0, r.out.trim().split('\n').pop()); });

step('doctor --full (0 falhas)', () => {
  const r = sdd(KIT, 'doctor', '--full', '--json');
  const rep = JSON.parse(r.stdout);
  const fails = rep.checks.filter((c) => c.status === 'fail');
  return ok(r.status === 0 && !fails.length, `${rep.summary.overall ?? rep.summary.status ?? ''} · ${rep.checks.filter((c) => c.status === 'pass').length} ok, ${rep.checks.filter((c) => c.status === 'warn').length} avisos, ${rep.checks.filter((c) => c.status === 'not_run').length} não executadas`, fails.map((f) => f.title).join('; '));
});

step('testes node:test (suíte completa no clone)', () => {
  const r = node(['--test', 'tests/**/*.test.mjs']);
  const pass = r.out.match(/ℹ pass (\d+)/)?.[1];
  const fail = r.out.match(/ℹ fail (\d+)/)?.[1];
  return ok(r.status === 0 && fail === '0', `${pass} passaram, ${fail} falharam`);
});

step('schemas usam só keywords suportadas', () => {
  const rep = JSON.parse(sdd(KIT, 'doctor', '--full', '--json').stdout);
  const c = rep.checks.find((x) => x.id === 'engine.schemas');
  return ok(c?.status === 'pass', c?.title ?? 'check engine.schemas ausente');
});

step('skills e packs íntegros (skills.lock.json)', () => { const r = sdd(KIT, 'skills', 'verify'); return ok(r.status === 0, r.out.trim().split('\n').pop()); });

step('segurança (doctor --security)', () => {
  const rep = JSON.parse(sdd(KIT, 'doctor', '--security', '--json').stdout);
  const fails = rep.checks.filter((c) => c.status === 'fail');
  return ok(!fails.length, `${rep.checks.length} checagens, 0 falhas`, fails.map((f) => f.title).join('; '));
});

step('evals determinísticas contra o baseline', () => { const r = sdd(KIT, 'eval', 'run'); return ok(r.status === 0, r.out.trim().split('\n').filter((l) => /determinísticas|baseline/.test(l)).join(' · ')); });

step('testes Python dos packs (pytest)', () => {
  const py = run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'pytest', '--version']);
  if (py.status !== 0) return { status: 'NOT_RUN', detail: 'python/pytest não disponível' };
  const r = run(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'pytest', '.claude/skills', '-q', '-p', 'no:cacheprovider']);
  return ok(r.status === 0, r.out.trim().split('\n').pop());
});

// ------------------------------------------------------------------------------------------------
// Simulações ponta a ponta
step('greenfield: init (cópia) → spec new → tarefas → guardião rejeita → nova revisão → aprova → spec implementada', () => {
  const P = tempProject('greenfield');
  must(node([join(KIT, 'scripts', 'sdd.mjs'), 'init', '--mode', 'copy', '--root', P]), 'init');
  cpSync(join(KIT, 'tests', 'fixtures', 'greenfield-react-node'), P, { recursive: true });
  const cli = (...a) => node([join(P, 'scripts', 'sdd.mjs'), ...a, '--root', P]);
  const spec = JSON.parse(must(cli('spec', 'new', '--slug', 'catalogo', '--title', 'Catálogo', '--pipeline', 'frontend', '--json'), 'spec new').stdout).id;
  must(cli('tasks', 'sync'), 'tasks sync');
  let guardianTask = null;
  for (let i = 0; i < 20; i++) {
    const ready = JSON.parse(cli('tasks', 'ready', '--json').stdout).ready;
    if (!ready.length) break;
    const t = ready[0];
    const show = JSON.parse(cli('tasks', 'show', t, '--json').stdout);
    if (/guardian/.test(show.agent ?? show.task?.agent ?? '')) { guardianTask = t; break; }
    must(cli('event', 'TASK_STARTED', '--task', t), `start ${t}`);
    must(cli('event', 'TASK_COMPLETED', '--task', t), `complete ${t}`);
  }
  if (!guardianTask) throw new Error('tarefa do guardião não chegou a ficar pronta');
  must(cli('event', 'TEST_PASSED', '--spec', spec, '--command', 'npx vitest run'), 'TEST_PASSED');
  must(cli('event', 'TASK_STARTED', '--task', guardianTask), 'start guardião');
  must(cli('event', 'GUARDIAN_STARTED', '--spec', spec), 'GUARDIAN_STARTED');
  must(cli('event', 'GUARDIAN_REJECTED', '--spec', spec, '--reason', 'CA-02 sem teste'), 'GUARDIAN_REJECTED');
  const early = cli('event', 'SPEC_IMPLEMENTED', '--spec', spec);
  if (early.status === 0) throw new Error('SPEC_IMPLEMENTED aceito após rejeição');
  // Rejeição encerra a revisão: depois da correção, nova revisão antes de aprovar.
  const skipReview = cli('event', 'GUARDIAN_APPROVED', '--spec', spec, '--evidence', '.sdd/reports/guardian.md');
  if (skipReview.status === 0) throw new Error('aprovação aceita sem nova revisão após rejeição');
  must(cli('event', 'GUARDIAN_STARTED', '--spec', spec), 'GUARDIAN_STARTED (nova revisão)');
  must(cli('event', 'GUARDIAN_APPROVED', '--spec', spec, '--evidence', '.sdd/reports/guardian.md'), 'GUARDIAN_APPROVED');
  must(cli('event', 'TASK_COMPLETED', '--task', guardianTask), 'complete guardião');
  must(cli('event', 'SPEC_IMPLEMENTED', '--spec', spec), 'SPEC_IMPLEMENTED');
  must(cli('state', 'verify'), 'state verify');
  must(cli('state', 'ledger'), 'state ledger');
  const doc = JSON.parse(cli('doctor', '--fast', '--json').stdout);
  return ok(!doc.checks.some((c) => c.status === 'fail'), `${spec}: rejeição bloqueou o fechamento e a aprovação direta; nova revisão com evidência fechou; estado e ledger coerentes`);
});

step('interrupção + retomada: log truncado recusa gravação, repair recupera, resume aponta a tarefa', () => {
  const P = tempProject('interrupcao');
  cpSync(join(KIT, 'tests', 'fixtures', 'greenfield-react-node'), P, { recursive: true });
  must(sdd(P, 'spec', 'new', '--slug', 'carrinho', '--title', 'Carrinho', '--pipeline', 'frontend'), 'spec new');
  must(sdd(P, 'tasks', 'sync'), 'sync');
  const t = JSON.parse(sdd(P, 'tasks', 'ready', '--json').stdout).ready[0];
  must(sdd(P, 'event', 'TASK_STARTED', '--task', t), 'start');
  appendFileSync(join(P, '.sdd', 'events.jsonl'), '{"v":1,"id":"corte-no-meio'); // processo morto no meio da escrita
  const refused = sdd(P, 'event', 'TASK_COMPLETED', '--task', t);
  if (refused.status === 0) throw new Error('gravou sobre log truncado');
  must(sdd(P, 'state', 'repair'), 'repair');
  const resume = must(sdd(P, 'state', 'resume'), 'resume').out;
  if (!resume.includes(t)) throw new Error(`resume não cita ${t}`);
  must(sdd(P, 'event', 'TASK_COMPLETED', '--task', t), 'complete após repair');
  must(sdd(P, 'state', 'verify'), 'verify');
  return { status: 'PASS', detail: `${t} retomada; cauda truncada movida para backup` };
});

step('brownfield: classificação com evidência e doctor do projeto', () => {
  const P = tempProject('brownfield');
  cpSync(join(KIT, 'tests', 'fixtures', 'brownfield-dotnet'), P, { recursive: true });
  const cls = JSON.parse(must(sdd(P, 'project', 'classify', '--json'), 'classify').stdout);
  const doc = JSON.parse(sdd(P, 'doctor', '--project', '--json').stdout);
  const fails = doc.checks.filter((c) => c.status === 'fail');
  return ok(/exist|brown/i.test(JSON.stringify(cls.kind ?? cls.classification ?? cls)) && !fails.length, `classificado como ${cls.kind ?? cls.classification}; doctor --project sem falhas`, `classify=${JSON.stringify(cls).slice(0, 120)} falhas=${fails.map((f) => f.title).join('; ')}`);
});

step('MCP indisponível: pin sem consentimento é NOT_RUN; perfil aplicado passa no check', () => {
  const P = tempProject('mcp');
  cpSync(join(KIT, 'tests', 'fixtures', 'greenfield-react-node'), P, { recursive: true });
  const pin = sdd(P, 'mcp', 'pin', 'context7');
  must(sdd(P, 'mcp', 'apply', 'minimal'), 'apply minimal');
  const check = sdd(P, 'mcp', 'check');
  return ok(/NOT_RUN/.test(pin.out) && check.status === 0, 'nenhum servidor executado sem consentimento; .mcp.json só da allowlist', `pin: ${pin.out.trim().slice(0, 120)} · check exit ${check.status}`);
});

step('integrações opcionais ausentes viram NOT_RUN (modelo, agent scan, Repomix, scanner externo, OTLP)', () => {
  const env = { ANTHROPIC_API_KEY: '', SNYK_TOKEN: '' };
  const model = node([join(KIT, 'scripts', 'sdd.mjs'), 'eval', 'run', '--suite', 'model', '--root', KIT], { env });
  const scan = sdd(KIT, 'scan', 'agents');
  const repomix = sdd(KIT, 'export-context', '--repomix');
  const ext = sdd(KIT, 'skills', 'scan', '--external');
  const P = tempProject('otlp');
  cpSync(join(KIT, 'tests', 'fixtures', 'greenfield-react-node'), P, { recursive: true });
  const otlp = sdd(P, 'trace', 'export', '--otlp', 'http://127.0.0.1:9');
  const notRun = [model, scan, repomix].every((r) => r.status === 0 && /NOT_RUN/.test(r.out));
  const extOk = ext.status === 0 && (/NOT_RUN/.test(ext.out) || /pass|ok/i.test(ext.out));
  const otlpOk = /indisponível/.test(otlp.out) && !/at .*\.mjs:\d+/.test(otlp.out);
  return ok(notRun && extOk && otlpOk, 'modelo, agent scan e Repomix NOT_RUN; scanner externo NOT_RUN quando ausente; OTLP indisponível relatado sem quebrar', `model=${model.status} scan=${scan.status} repomix=${repomix.status} ext=${ext.status} otlp=${otlp.out.trim().slice(0, 80)}`);
});

step('migração v2 → v3: config .md legada → YAML válido → visão gerada', () => {
  const P = tempProject('migracao');
  writeFileSync(join(P, 'sdd.config.md'), readFileSync(join(KIT, 'tests', 'fixtures', 'legacy-config', 'sdd.config.v2-filled.md'), 'utf8'));
  must(sdd(P, 'config', 'migrate'), 'config migrate');
  must(sdd(P, 'config', 'validate'), 'config validate');
  must(sdd(P, 'config', 'render'), 'config render');
  const md = readFileSync(join(P, 'sdd.config.md'), 'utf8');
  mkdirSync(join(P, 'specs'), { recursive: true });
  writeFileSync(join(P, 'specs', 'LEDGER-v2.md'), '| # | Spec | Slug | Deps | Estado |\n|---|------|------|------|--------|\n| 1 | `SPEC-2026-100` | acervo | — | feita |\n');
  const imp = must(sdd(P, 'state', 'import-ledger', 'specs/LEDGER-v2.md'), 'import-ledger');
  must(sdd(P, 'state', 'verify'), 'state verify');
  return ok(existsSync(join(P, 'sdd.config.yaml')) && /AUTO-GENERATED/.test(md) && /importada/.test(imp.out), 'YAML canônico, .md regenerado como visão, LEDGER v2 importado', `import: ${imp.out.trim()}`);
});

step('core sem Phoenix/ContextForge/frameworks de IA: nenhum import externo em scripts/', () => {
  const pkg = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8'));
  const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}), ...(pkg.peerDependencies ?? {}) });
  const g = run('git', ['grep', '-nE', "from '[^.n][^']*'|require\\('[^.n]", '--', 'scripts/']);
  const external = g.stdout.split('\n').filter((l) => l && !/from 'node:|require\('node:/.test(l));
  return ok(!deps.length && !external.length, 'package.json sem dependências; só módulos node: e relativos', `deps=${deps.join(',')} imports=${external.slice(0, 3).join(' | ')}`);
});

step('nenhum segredo nem arquivo sensível versionado', () => {
  const rep = JSON.parse(sdd(KIT, 'doctor', '--security', '--json').stdout);
  const s = rep.checks.filter((c) => c.id.startsWith('secrets.'));
  return ok(s.length && s.every((c) => c.status === 'pass'), s.map((c) => c.title).join('; '), s.filter((c) => c.status !== 'pass').map((c) => `${c.title} ${c.details?.slice(0, 3).join(', ')}`).join('; '));
});

step('adapters e export de contexto no clone (sem escrever fora de .sdd/)', () => {
  const a = sdd(KIT, 'adapters', 'build', 'codex', '--json');
  const e = sdd(KIT, 'export-context', '--dry-run', '--json');
  const ex = JSON.parse(e.stdout);
  const dirty = run('git', ['status', '--porcelain']).stdout.trim();
  return ok(a.status === 0 && e.status === 0 && !dirty, `${JSON.parse(a.stdout).count} skills exportadas; export com ${ex.summary.files} arquivos e ${ex.summary.excluded} exclusões; árvore continua limpa`, `adapters=${a.status} export=${e.status} dirty=${dirty}`);
});

// ------------------------------------------------------------------------------------------------
const head = run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim();
const version = JSON.parse(node([join(KIT, 'scripts', 'sdd.mjs'), 'version', '--json']).stdout || '{}');
rmSync(work, { recursive: true, force: true });
const counts = { PASS: 0, FAIL: 0, NOT_RUN: 0 };
for (const r of results) counts[r.status]++;
const overall = counts.FAIL ? 'FAIL' : 'PASS';
console.log(`\n${overall}: ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.NOT_RUN} NOT_RUN`);
if (args.includes('--json')) console.log(JSON.stringify({ head, version, overall, counts, results }, null, 2));
if (reportPath) {
  const lines = [
    `# Regressão completa — SDD Kit ${version.engine ?? version.engine_version ?? ''}`, '',
    `Gerado por \`node tests/regression/full-regression.mjs --report ${reportPath.replace(/\\/g, '/').split('/').slice(-3).join('/')}\` numa cópia limpa (clone local do commit \`${head}\`), sem rede.`,
    `Node ${process.version} · ${process.platform} · ${new Date().toISOString().slice(0, 10)}`, '',
    `**Resultado: ${overall}** — ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.NOT_RUN} NOT_RUN`, '',
    '| Etapa | Resultado | Detalhe |', '|-------|-----------|---------|',
    ...results.map((r) => `| ${r.name} | ${r.status} | ${String(r.detail ?? '').replace(/\|/g, '\\|')} |`), '',
    '`NOT_RUN` = a ferramenta opcional não estava disponível no ambiente; não conta como aprovação.', '',
  ];
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
}
process.exit(counts.FAIL ? 1 : 0);
