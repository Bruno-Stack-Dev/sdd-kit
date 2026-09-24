// `sdd radar inventory|check` — o que o projeto já usa, decidiu ou planejou, para a skill
// radar-ferramentas não sugerir de novo o que já está no roadmap. Só leitura; nenhuma rede.
import { UsageError, ICON } from '../lib/cli.mjs';
import { radarInventory, radarCheck } from '../lib/radar.mjs';

const USAGE = 'uso: radar inventory [--json] | radar check <nome> [<nome>...] [--json]';

export async function radarCommand({ positional, flags, root }) {
  const [sub, ...rest] = positional;
  if (sub === 'inventory') return inventory(root, flags);
  if (sub === 'check') {
    const names = rest.flatMap((n) => String(n).split(',')).map((n) => n.trim()).filter(Boolean);
    if (!names.length) throw new UsageError(USAGE);
    return check(root, names, flags);
  }
  throw new UsageError(USAGE);
}

function inventory(root, flags) {
  const r = radarInventory(root);
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  const c = r.config;
  console.log(`${ICON.info} config: ${c.source}${c.project ? ` · ${[c.project.type, c.project.domain, c.project.stage].filter(Boolean).join(' · ')}` : ''}`);
  if (c.stack && typeof c.stack === 'object' && !Array.isArray(c.stack)) {
    for (const [k, v] of Object.entries(c.stack)) console.log(`  stack.${k.padEnd(14)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  } else if (c.stack) console.log(`  stack          ${typeof c.stack === 'object' ? JSON.stringify(c.stack) : c.stack}`);
  if (c.packs.length) console.log(`  packs          ${c.packs.join(', ')}`);
  if (c.ai) console.log(`  ai             ${c.ai.join(', ')}`);
  console.log(`\n${ICON.info} dependências (${r.dependencies.reduce((n, m) => n + m.deps.length, 0)} em ${r.dependencies.length} manifesto(s))`);
  for (const m of r.dependencies) console.log(`  ${m.file}: ${m.deps.join(', ') || '—'}`);
  if (r.ai.uses_ai) console.log(`  IA no produto: ${Object.keys(r.ai.signals).join(', ')} (pack ai: ai-architecture-evaluator, ai-model-strategy)`);
  console.log(`\n${ICON.info} ADRs (${r.adrs.length})`);
  for (const a of r.adrs) console.log(`  ${(a.id ?? '—').padEnd(10)} ${(a.status ?? '—').padEnd(10)} ${a.title ?? a.file}`);
  console.log(`\n${ICON.info} discovery (${r.discovery.length}) · backlog: ${r.backlog ? r.backlog.file : 'ausente'}`);
  for (const d of r.discovery) console.log(`  ${d.file} (${d.status ?? '—'})`);
  console.log(`\n${ICON.info} radares anteriores (${r.radars.length}) · novos radares em ${r.paths.discovery}/`);
  for (const x of r.radars) console.log(`  ${x.date}  ${x.file} (${x.status ?? '—'})`);
  return 0;
}

function check(root, names, flags) {
  const r = radarCheck(root, names);
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  for (const c of r) {
    console.log(`${c.status === 'novo' ? ICON.ok : ICON.warn} ${c.name.padEnd(20)} ${c.status}`);
    for (const w of c.where) {
      console.log(`    ${w.kind.padEnd(11)} ${w.file}${w.detail ? ` (${w.detail})` : ''}`);
      for (const m of w.matches) console.log(`      ${m}`);
    }
  }
  console.log('\nOcorrência não é decisão: leia o contexto (ADR descartado, item "Won\'t" do backlog) antes de descartar ou sugerir.');
  return 0;
}
