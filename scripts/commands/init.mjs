// `sdd init [--mode plugin|copy] [--force]` · `sdd upgrade [--dry-run]` · `sdd version`
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON } from '../lib/cli.mjs';
import { initProject, upgradeProject, readEngineInfo } from '../lib/install.mjs';
import { ENGINE_ROOT, ENGINE_VERSION, CONFIG_SCHEMA_VERSION } from '../lib/engine.mjs';
import { STATE_VERSION } from '../lib/state.mjs';

export async function initCommand({ flags, root }) {
  const mode = flags.mode ?? 'plugin';
  let actions;
  try { actions = initProject(root, { mode, force: !!flags.force }); } catch (e) { throw new UsageError(e.message); }
  if (flags.json) { console.log(JSON.stringify({ mode, actions }, null, 2)); return 0; }
  console.log(`${ICON.ok} SDD Kit ${ENGINE_VERSION} instalado em modo ${mode}`);
  for (const a of actions) console.log(`  ${a.kind.padEnd(8)} ${a.path}`);
  const kept = actions.filter((a) => a.kind === 'kept').length;
  if (kept) console.log(`${ICON.warn} ${kept} arquivo(s) do motor já existiam com conteúdo diferente e foram mantidos — use \`sdd upgrade\` (com backup) ou --force`);
  console.log(mode === 'plugin'
    ? `\nPróximo passo: no Claude Code, \`/plugin marketplace add Bruno-Stack-Dev/sdd-kit\` e \`/plugin install sdd-kit@sdd-kit\` (o settings.json do projeto já referencia o plugin para o time). Depois: /sdd-init.`
    : '\nPróximo passo: abra o Claude Code na raiz e rode /sdd-init.');
  return 0;
}

export async function upgradeCommand({ flags, root }) {
  const info = readEngineInfo(root);
  if (info?.mode === 'plugin') {
    console.log(`${ICON.info} projeto em modo plugin: atualize o motor com \`/plugin update sdd-kit\` (ou marketplace update). Nada a copiar.`);
    return 0;
  }
  const v2 = existsSync(join(root, 'scripts', 'sdd-lint.mjs')) || existsSync(join(root, 'specs', '_gerador', 'GERADOR.md'));
  if (!existsSync(join(root, 'scripts', 'sdd.mjs')) && !info && !v2) throw new UsageError('não parece um projeto com o SDD Kit em modo cópia (rode `sdd init --mode copy`)');
  const r = upgradeProject(root, { dryRun: !!flags.dryRun });
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`${flags.dryRun ? '(simulação) ' : ''}${ICON.ok} motor ${r.from} → ${r.to}`);
  const count = (k) => r.actions.filter((a) => a.kind === k);
  for (const k of ['updated', 'added', 'merged']) for (const a of count(k)) console.log(`  ${k.padEnd(8)} ${a.path}`);
  if (count('obsolete').length) {
    console.log(`${ICON.warn} ${count('obsolete').length} arquivo(s) em diretórios do motor não existem na versão nova (não foram apagados):`);
    for (const a of count('obsolete')) console.log(`  obsolete ${a.path}`);
  }
  if (r.backup && !flags.dryRun) console.log(`${ICON.info} versões anteriores preservadas em ${r.backup}`);
  if (!r.actions.length) console.log('  nada a atualizar');
  return 0;
}

export function versionInfo() {
  // No modo cópia o projeto não tem .claude-plugin/ (o manifesto só existe no motor/plugin).
  const manifest = join(ENGINE_ROOT, '.claude-plugin', 'plugin.json');
  const plugin = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null;
  return { engine: ENGINE_VERSION, plugin_manifest: plugin, config_schema: CONFIG_SCHEMA_VERSION, state_schema: STATE_VERSION, event_schema: 1, policy: 1 };
}

export async function versionCommand({ flags, root }) {
  const v = versionInfo();
  const project = readEngineInfo(root);
  if (flags.json) { console.log(JSON.stringify({ ...v, project }, null, 2)); return 0; }
  console.log(`sdd-kit ${v.engine} (config v${v.config_schema}, estado v${v.state_schema}, eventos v${v.event_schema}, política v${v.policy})`);
  if (project) console.log(`projeto: modo ${project.mode}, instalado/atualizado com o motor ${project.engine_version}`);
  return 0;
}
