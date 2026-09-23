// `sdd adapters build <codex|opencode|cline|generic> [--install] [--out DIR] [--packs a,b] [--force]`
// `sdd adapters status [--json]`
import { resolve } from 'node:path';
import { UsageError, ICON } from '../lib/cli.mjs';
import { buildAdapter, adapterStatus, TARGETS } from '../lib/adapters.mjs';

export async function adaptersCommand({ positional, flags, root }) {
  const [sub, target] = positional;
  if (sub === 'status') {
    const st = adapterStatus(root);
    const code = st.some((s) => s.stale.length) ? 1 : 0;
    if (flags.json) { console.log(JSON.stringify(st, null, 2)); return code; }
    if (!st.length) { console.log(`${ICON.info} nenhum adapter instalado neste projeto`); return 0; }
    for (const s of st) console.log(`${s.stale.length ? ICON.warn : ICON.ok} ${s.target}: ${s.skills} skill(s)${s.stale.length ? ` — desatualizadas: ${s.stale.join(', ')}` : ' em dia'}`);
    return code;
  }
  if (sub !== 'build' || !target) throw new UsageError(`uso: adapters build <${Object.keys(TARGETS).join('|')}> [--install] [--out DIR] [--packs a,b] [--force] · adapters status [--json]`);
  const packs = flags.packs ? String(flags.packs).split(',').map((s) => s.trim()).filter(Boolean) : [];
  const r = buildAdapter(root, target, { install: Boolean(flags.install), out: flags.out ? resolve(root, flags.out) : null, packs, force: Boolean(flags.force) });
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`${ICON.ok} adapter ${target}: ${r.count} skill(s) em ${r.skills_dir}; instruções em ${r.instructions}`);
  for (const w of r.warnings) console.log(`${ICON.warn} ${w}`);
  if (!flags.install) console.log(`${ICON.info} revisão: nada foi escrito nos caminhos do cliente. Para instalar no projeto: \`sdd adapters build ${target} --install\``);
  return 0;
}
