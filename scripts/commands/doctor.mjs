// `sdd doctor [--fast|--project|--security|--skills|--mcp|--full] [--json] [--strict] [--verbose]`
// e `sdd check forbidden [--json]`.
import { UsageError, ICON } from '../lib/cli.mjs';
import { runDoctor, MODES } from '../lib/doctor/index.mjs';
import { loadConfig } from '../lib/config.mjs';
import { checkForbidden } from '../lib/forbidden.mjs';
import { ENGINE_ROOT } from '../lib/engine.mjs';
import { toPosix } from '../lib/files.mjs';

// Skills do próprio kit (não vendorizadas, não geradas pelo projeto) seguem a spec estritamente.
export function kitOwnedPredicate(root) {
  const isEngine = toPosix(root).replace(/\/+$/, '') === toPosix(ENGINE_ROOT).replace(/\/+$/, '');
  return (d) => isEngine && !d.pack;
}

export async function doctorCommand({ flags, root }) {
  const chosen = MODES.filter((m) => flags[m]);
  if (chosen.length > 1) throw new UsageError(`escolha um modo só (recebido: ${chosen.join(', ')})`);
  const mode = chosen[0] ?? 'full';
  const report = await runDoctor(root, { mode, ownedPredicate: kitOwnedPredicate(root) });
  const strict = !!flags.strict;
  if (flags.json) console.log(JSON.stringify(report.toJSON(strict), null, 2));
  else console.log(report.format({ verbose: !!flags.verbose, strict }));
  return report.summary(strict).overall === 'NOT_READY' ? 1 : 0;
}

export async function checkCommand({ positional, flags, root }) {
  const [what] = positional;
  if (what !== 'forbidden') throw new UsageError('uso: check forbidden [--json]');
  const cfg = loadConfig(root);
  if (!cfg.config) { console.log(`${ICON.error} sem config válida — rode \`sdd config validate\``); return 1; }
  const results = checkForbidden(root, cfg.config.forbidden_patterns ?? []);
  if (flags.json) console.log(JSON.stringify({ results }, null, 2));
  else {
    if (!results.length) console.log(`${ICON.ok} nenhum padrão proibido declarado`);
    for (const r of results) {
      const icon = r.status === 'fail' ? ICON.error : r.status === 'not_run' ? ICON.notRun : r.status === 'improved' ? ICON.warn : ICON.ok;
      console.log(`${icon} /${r.pattern}/  escopo ${r.scope}  →  ${r.message}`);
      for (const m of r.matches) console.log(`    ${m}`);
    }
  }
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}
