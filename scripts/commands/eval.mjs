// `sdd eval run [--suite deterministic|model] [--filter x] [--update-baseline] [--json]`
// `sdd eval export-promptfoo`
//
// deterministic: fixtures + CLI, sem modelo — roda em todo CI.
// model: Promptfoo + provider do Claude Agent SDK — só manual/noturno/release, exige
//        ANTHROPIC_API_KEY; ausente = NOT_RUN (o workflow informa, não finge que passou).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UsageError, ICON } from '../lib/cli.mjs';
import { ENGINE_ROOT, ENGINE_VERSION } from '../lib/engine.mjs';
import { runDeterministic, compareWithBaseline, saveResults, BASELINE, DETERMINISTIC_CASES } from '../lib/evals.mjs';
import { stringifyYaml } from '../lib/yaml.mjs';
import { findOnPath } from '../lib/files.mjs';

export const PROMPTFOO = 'promptfoo@0.123.1';
const PROMPTFOO_DIR = join(ENGINE_ROOT, 'evals', 'promptfoo');

export async function evalCommand(args) {
  const [sub] = args.positional;
  if (sub === 'run') return run(args);
  if (sub === 'export-promptfoo') return exportPromptfoo(args);
  throw new UsageError('uso: eval <run|export-promptfoo> [--suite deterministic|model]');
}

function run({ flags }) {
  if (!existsSync(DETERMINISTIC_CASES)) {
    console.log(`${ICON.notRun} NOT_RUN — a suíte de evals vive no repositório do kit (evals/); não está disponível neste modo de instalação`);
    return 0;
  }
  const suite = flags.suite ?? 'deterministic';
  if (suite === 'model') return runModel({ flags });
  if (suite !== 'deterministic') throw new UsageError(`suite desconhecida '${suite}'`);
  const res = runDeterministic({ filter: flags.filter });
  const cmp = compareWithBaseline(res);
  const out = { version: ENGINE_VERSION, date: new Date().toISOString(), ...res, comparison: cmp };
  saveResults('deterministic-latest', out);
  if (flags.updateBaseline) {
    mkdirSync(join(BASELINE, '..'), { recursive: true });
    writeFileSync(BASELINE, JSON.stringify({ version: ENGINE_VERSION, date: out.date.slice(0, 10), total: res.total, passed: res.passed, categories: res.categories, results: res.results.map((r) => ({ id: r.id, category: r.category, passed: r.passed })) }, null, 2) + '\n');
  }
  if (flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`evals determinísticas: ${res.passed}/${res.total} (${Math.round(res.pass_rate * 100)}%)`);
    for (const [cat, c] of Object.entries(res.categories)) console.log(`  ${c.passed === c.total ? ICON.ok : ICON.error} ${cat.padEnd(28)} ${c.passed}/${c.total}`);
    for (const r of res.results.filter((x) => !x.passed)) {
      console.log(`  ${ICON.error} ${r.id}: ${r.error ?? r.results.map((f) => `${f.path ?? 'saída'} = ${JSON.stringify(f.actual)?.slice(0, 160)} (esperado ${JSON.stringify(f.expected)})`).join('; ')}`);
    }
    if (cmp.baseline) console.log(`baseline ${cmp.baseline}: ${cmp.regressions.length} regressão(ões)${cmp.regressions.length ? ` — ${cmp.regressions.join(', ')}` : ''} · ${cmp.improvements.length} melhoria(s) · ${cmp.new_cases?.length ?? 0} caso(s) novo(s)`);
    if (flags.updateBaseline) console.log(`${ICON.ok} baseline atualizado (evals/baseline/deterministic.json)`);
  }
  return cmp.regressions.length || res.passed < res.total ? 1 : 0;
}

/** Gera os testes do Promptfoo a partir das evals das skills (evals/evals.json) e dos agentes. */
export function buildPromptfooTests() {
  const tests = [];
  const skillsDir = join(ENGINE_ROOT, '.claude', 'skills');
  for (const s of readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'evals', 'evals.json')))) {
    const ev = JSON.parse(readFileSync(join(skillsDir, s, 'evals', 'evals.json'), 'utf8'));
    for (const c of ev.evals) {
      tests.push({
        description: `skill ${s} · ${c.id}`,
        vars: { prompt: c.prompt, skill: s },
        assert: [{ type: 'llm-rubric', value: [c.expected_output, ...(c.expectations ?? []).map((e) => `- ${e}`)].join('\n') }],
        metadata: { kind: 'skill', skill: s, case: c.id },
      });
    }
  }
  const agents = JSON.parse(readFileSync(join(ENGINE_ROOT, 'evals', 'agents', 'agents.json'), 'utf8'));
  for (const [agent, cases] of Object.entries(agents.agents)) {
    for (const c of cases) {
      tests.push({
        description: `agente ${agent} · ${c.id}`,
        vars: { prompt: `Atue como @${agent} (definição em .claude/agents/${agent}.md). ${c.prompt}`, agent },
        assert: [{ type: 'llm-rubric', value: c.expected_output }],
        metadata: { kind: 'agent', agent, case: c.id },
      });
    }
  }
  return tests;
}

function exportPromptfoo({ flags }) {
  const tests = buildPromptfooTests();
  mkdirSync(PROMPTFOO_DIR, { recursive: true });
  const file = join(PROMPTFOO_DIR, 'generated-tests.yaml');
  writeFileSync(file, stringifyYaml(tests, { header: 'AUTO-GENERATED — DO NOT EDIT DIRECTLY. Fonte: .claude/skills/*/evals/evals.json e evals/agents/agents.json.\nRegenerar: node scripts/sdd.mjs eval export-promptfoo' }));
  if (flags.json) console.log(JSON.stringify({ file, tests: tests.length }));
  else console.log(`${ICON.ok} ${tests.length} teste(s) exportado(s) para ${file}`);
  return 0;
}

function runModel({ flags }) {
  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!findOnPath('npx')) missing.push('npx');
  if (missing.length) {
    const r = { suite: 'model', status: 'not_run', reason: `pré-requisitos ausentes: ${missing.join(', ')} (evals com modelo rodam no workflow manual/noturno)` };
    if (flags.json) console.log(JSON.stringify(r)); else console.log(`${ICON.notRun} NOT_RUN — ${r.reason}`);
    return 0;
  }
  exportPromptfoo({ flags: {} });
  const out = join(ENGINE_ROOT, 'evals', 'results', 'model-latest.json');
  mkdirSync(join(out, '..'), { recursive: true });
  const r = spawnSync('npx', ['--yes', PROMPTFOO, 'eval', '-c', join(PROMPTFOO_DIR, 'promptfooconfig.yaml'), '--no-cache', '--no-share', '--no-progress-bar', '-o', out], {
    cwd: ENGINE_ROOT, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1' },
  });
  return r.status === 0 ? 0 : 1;
}
