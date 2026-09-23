// Quando o doctor roda no repositório do próprio motor (não num projeto), valida o motor:
// exemplo de config, visão gerada em dia e schemas usando só keywords suportadas.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_ROOT } from '../engine.mjs';
import { toPosix } from '../files.mjs';
import { parseYaml } from '../yaml.mjs';
import { validateConfig } from '../config.mjs';
import { renderConfigMd } from '../config-md.mjs';
import { assertSupportedSchema } from '../schema.mjs';

export function isEngineRepo(root) {
  return toPosix(root).replace(/\/+$/, '') === toPosix(ENGINE_ROOT).replace(/\/+$/, '');
}

export function checkEngine(report, p) {
  const G = 'Motor (repositório do kit)';
  report.pass(G, 'engine.mode', 'repositório do motor: sem config de projeto (esperado); validando o motor');
  const exYaml = join(p.root, 'sdd.config.example.yaml');
  if (!existsSync(exYaml)) { report.fail(G, 'engine.example', 'sdd.config.example.yaml ausente'); return; }
  const cfg = parseYaml(readFileSync(exYaml, 'utf8'));
  const v = validateConfig(cfg, { root: p.root });
  const real = v.errors.filter((e) => !/placeholder/.test(e.message));
  report.fromIssues(G, 'engine.example', 'sdd.config.example.yaml conforme ao schema (placeholders à parte)', real);
  const md = existsSync(join(p.root, 'sdd.config.example.md')) ? readFileSync(join(p.root, 'sdd.config.example.md'), 'utf8').replace(/\r\n/g, '\n') : null;
  const inSync = md === renderConfigMd(cfg, { source: 'sdd.config.example.yaml' });
  report.add(G, 'engine.example-view', inSync ? 'pass' : 'fail', inSync ? 'sdd.config.example.md em dia com o YAML' : 'sdd.config.example.md desatualizado — rode `sdd config render --from sdd.config.example.yaml --to sdd.config.example.md`');
  const problems = [];
  for (const f of readdirSync(join(p.root, 'schemas')).filter((x) => x.endsWith('.json'))) {
    try { assertSupportedSchema(JSON.parse(readFileSync(join(p.root, 'schemas', f), 'utf8'))); } catch (e) { problems.push(`${f}: ${e.message}`); }
  }
  report.fromIssues(G, 'engine.schemas', 'schemas usam só keywords suportadas pelo validador', problems);
}
