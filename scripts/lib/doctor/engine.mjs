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
import { ENGINE_VERSION } from '../engine.mjs';

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
  checkPluginManifest(report, p.root);
}

/** Manifesto do plugin, marketplace e hooks do plugin coerentes com o motor. */
export function checkPluginManifest(report, root) {
  const G = 'Motor (repositório do kit)';
  const read = (f) => { try { return JSON.parse(readFileSync(join(root, f), 'utf8')); } catch { return null; } };
  const plugin = read('.claude-plugin/plugin.json');
  const market = read('.claude-plugin/marketplace.json');
  const hooks = read('hooks/hooks.json');
  const issues = [];
  if (!plugin) issues.push('.claude-plugin/plugin.json ausente ou inválido');
  else {
    if (plugin.version !== ENGINE_VERSION) issues.push(`plugin.json version ${plugin.version} ≠ ENGINE_VERSION ${ENGINE_VERSION}`);
    for (const k of ['commands', 'agents', 'skills', 'hooks']) {
      if (plugin[k] && !existsSync(join(root, plugin[k]))) issues.push(`plugin.json ${k}: '${plugin[k]}' não existe`);
      if (plugin[k] && !String(plugin[k]).startsWith('./')) issues.push(`plugin.json ${k} deve começar com './'`);
    }
  }
  if (!market) issues.push('.claude-plugin/marketplace.json ausente ou inválido');
  else for (const pl of market.plugins ?? []) {
    if (typeof pl.source === 'string' && !existsSync(join(root, pl.source))) issues.push(`marketplace: source '${pl.source}' de ${pl.name} não existe`);
    if (pl.name === 'sdd-kit' && pl.version && pl.version !== ENGINE_VERSION) issues.push(`marketplace: versão do sdd-kit ${pl.version} ≠ ${ENGINE_VERSION}`);
  }
  if (!hooks?.hooks?.PreToolUse) issues.push('hooks/hooks.json sem PreToolUse');
  else if (!JSON.stringify(hooks).includes('${CLAUDE_PLUGIN_ROOT}/scripts/hooks/sdd-hook.mjs')) issues.push('hooks/hooks.json deve chamar ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/sdd-hook.mjs');
  report.fromIssues(G, 'engine.plugin', `plugin, marketplace e hooks do plugin coerentes (v${ENGINE_VERSION})`, issues);
}
