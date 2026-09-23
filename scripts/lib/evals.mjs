// Runner de evals determinísticas: cada caso copia uma fixture para um diretório temporário, aplica
// overlays (inclusive arquivos que não podem ser versionados, como .env), roda passos da CLI e confere
// expectativas sobre a saída JSON. Sem modelo, sem rede — roda em todo CI.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ENGINE_ROOT } from './engine.mjs';

const CLI = join(ENGINE_ROOT, 'scripts', 'sdd.mjs');
export const DETERMINISTIC_CASES = join(ENGINE_ROOT, 'evals', 'deterministic', 'cases.json');
export const BASELINE = join(ENGINE_ROOT, 'evals', 'baseline', 'deterministic.json');
export const RESULTS_DIR = join(ENGINE_ROOT, 'evals', 'results');

/** Caminho tipo `checks[id=specs.valid].status` ou `languages[language=go].binaryFound` ou `a.b.0`. */
export function getPath(obj, path) {
  let cur = obj;
  for (const part of path.split('.').reduce((acc, seg) => {
    // junta segmentos que ficaram dentro de [..] com pontos (ex.: [id=specs.valid])
    if (acc.length && acc[acc.length - 1].includes('[') && !acc[acc.length - 1].includes(']')) acc[acc.length - 1] += `.${seg}`;
    else acc.push(seg);
    return acc;
  }, [])) {
    if (cur === undefined || cur === null) return undefined;
    const m = part.match(/^([^[]*)\[([^=\]]+)=([^\]]*)\]$/);
    if (m) {
      const arr = m[1] ? cur[m[1]] : cur;
      cur = Array.isArray(arr) ? arr.find((x) => String(x?.[m[2]]) === m[3]) : undefined;
    } else cur = cur[part];
  }
  return cur;
}

function check(expect, ctx) {
  const actual = expect.path !== undefined ? getPath(ctx.json, expect.path) : expect.exit !== undefined ? ctx.status : ctx.stdout;
  if (expect.exit !== undefined) return { ok: ctx.status === expect.exit, actual: ctx.status, expected: `exit ${expect.exit}` };
  if ('equals' in expect) return { ok: JSON.stringify(actual) === JSON.stringify(expect.equals), actual, expected: expect.equals };
  if ('includes' in expect) {
    const hay = Array.isArray(actual) ? actual : JSON.stringify(actual ?? '');
    return { ok: Array.isArray(hay) ? hay.includes(expect.includes) : hay.includes(expect.includes), actual, expected: `inclui ${expect.includes}` };
  }
  if ('matches' in expect) return { ok: new RegExp(expect.matches).test(typeof actual === 'string' ? actual : JSON.stringify(actual)), actual, expected: `casa /${expect.matches}/` };
  if ('gte' in expect) return { ok: Number(actual) >= expect.gte, actual, expected: `>= ${expect.gte}` };
  if ('length' in expect) return { ok: Array.isArray(actual) && actual.length === expect.length, actual: actual?.length, expected: `tamanho ${expect.length}` };
  throw new Error(`expectativa sem operador: ${JSON.stringify(expect)}`);
}

function runCli(args, cwd, env) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--root', cwd], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* saída não-JSON */ }
  return { status: r.status, stdout: r.stdout + r.stderr, json };
}

export function runCase(c) {
  const dir = mkdtempSync(join(tmpdir(), `sdd-eval-${c.id}-`));
  try {
    if (c.fixture) {
      const src = join(ENGINE_ROOT, 'tests', 'fixtures', c.fixture);
      if (!existsSync(src)) throw new Error(`fixture '${c.fixture}' não existe`);
      cpSync(src, dir, { recursive: true });
    }
    for (const [rel, content] of Object.entries(c.overlay ?? {})) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      // overlays montam segredos falsos por concatenação ("AKIA" + "...") para não versioná-los
      writeFileSync(join(dir, rel), Array.isArray(content) ? content.join('') : content);
    }
    for (const step of c.setup ?? []) runCli(step, dir, c.env);
    const ctx = runCli(c.run, dir, c.env);
    const results = (c.expect ?? []).map((e) => ({ ...e, ...check(e, ctx) }));
    return { id: c.id, category: c.category, passed: results.every((r) => r.ok), results: results.filter((r) => !r.ok) };
  } catch (e) {
    return { id: c.id, category: c.category, passed: false, error: e.message, results: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runDeterministic({ filter } = {}) {
  const spec = JSON.parse(readFileSync(DETERMINISTIC_CASES, 'utf8'));
  const cases = spec.cases.filter((c) => !filter || c.id.includes(filter) || c.category === filter);
  const results = cases.map(runCase);
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ??= { passed: 0, total: 0 };
    byCategory[r.category].total++;
    if (r.passed) byCategory[r.category].passed++;
  }
  const passed = results.filter((r) => r.passed).length;
  return { suite: 'deterministic', total: results.length, passed, pass_rate: results.length ? passed / results.length : 0, categories: byCategory, results };
}

/** Regressões = casos que passavam no baseline e falham agora. */
export function compareWithBaseline(current) {
  if (!existsSync(BASELINE)) return { baseline: null, regressions: [], improvements: [] };
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const prev = new Map(base.results.map((r) => [r.id, r.passed]));
  return {
    baseline: base.version,
    regressions: current.results.filter((r) => prev.get(r.id) === true && !r.passed).map((r) => r.id),
    improvements: current.results.filter((r) => prev.get(r.id) === false && r.passed).map((r) => r.id),
    new_cases: current.results.filter((r) => !prev.has(r.id)).map((r) => r.id),
  };
}

export function saveResults(name, data) {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}
