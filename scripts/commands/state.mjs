// `sdd event <TIPO>` · `sdd state <show|resume|rebuild|verify|repair|ledger|import-ledger>`
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON, timestampSlug } from '../lib/cli.mjs';
import { appendEvent, EventRejected, computeState, writeState, verifyState, repairEvents, sddPath } from '../lib/events.mjs';
import { loadProject, resumeSummary, renderLedger, parseLegacyLedger, LEDGER_MARKER } from '../lib/project.mjs';
import { resolveTaskId } from '../lib/specs.mjs';
import { slugId } from '../lib/config-md.mjs';
import { isModelValue, MODEL_ALIASES, EFFORT_LEVELS } from '../lib/models.mjs';

/** Monta o input de um evento a partir das flags da CLI. */
export function eventInputFromFlags(type, flags, project) {
  let meta = {};
  if (flags.meta) {
    try { meta = JSON.parse(flags.meta); } catch { throw new UsageError('--meta precisa ser JSON válido'); }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new UsageError('--meta precisa ser um objeto JSON');
  }
  if (flags.reason) meta.reason = String(flags.reason);
  if (flags.evidence) {
    const parts = String(flags.evidence).split(',').map((s) => s.trim()).filter(Boolean);
    meta.evidence = parts.length > 1 ? parts : parts[0];
  }
  if (flags.command) meta.command = String(flags.command);
  if (flags.mode) meta.mode = String(flags.mode);
  if (flags.pack) meta.pack = String(flags.pack);
  if (flags.model) {
    if (!isModelValue(String(flags.model))) throw new UsageError(`--model inválido '${flags.model}' (${MODEL_ALIASES.join(' | ')} | claude-...)`);
    meta.model = String(flags.model);
  }
  if (flags.effort) {
    if (!EFFORT_LEVELS.includes(String(flags.effort))) throw new UsageError(`--effort inválido '${flags.effort}' (${EFFORT_LEVELS.join(' | ')})`);
    meta.effort = String(flags.effort);
  }
  if (flags.wave) {
    if (!/^wave-\d+$/.test(String(flags.wave))) throw new UsageError(`--wave inválido '${flags.wave}' (use o id de \`sdd tasks wave\`, ex.: wave-1)`);
    meta.wave = String(flags.wave);
  }
  if (flags.force) meta.force = true;
  // Resultado de teste com contagens (lidas pelo dashboard; o reducer usa só o tipo do evento).
  if (flags.suite !== undefined) meta.suite = String(flags.suite);
  for (const k of ['passed', 'failed', 'skipped', 'total', 'coverage']) {
    if (flags[k] === undefined) continue;
    const n = Number(flags[k]);
    if (!Number.isFinite(n) || n < 0 || (k !== 'coverage' && !Number.isInteger(n)) || (k === 'coverage' && n > 100)) throw new UsageError(`--${k} inválido '${flags[k]}' (${k === 'coverage' ? '0–100' : 'inteiro ≥ 0'})`);
    meta[k] = n;
  }

  let task = flags.task;
  if (task && project) {
    const all = [...project.taskGraph.tasks.values()];
    const matches = resolveTaskId(String(task), all);
    if (matches.length > 1) throw new UsageError(`tarefa '${task}' é ambígua: ${matches.map((t) => t.id).join(', ')} — use SPEC/T-NNN`);
    if (matches.length === 1) task = matches[0].id;
  }
  const spec = flags.spec ?? (task && task.includes('/') ? task.split('/')[0] : undefined);
  return {
    type, spec, task, plan: flags.plan, agent: flags.agent, gate: flags.gate, result: flags.result,
    session: flags.session, trace: flags.trace, key: flags.key, meta,
  };
}

export async function eventCommand({ positional, flags, root }) {
  const [type] = positional;
  if (!type) throw new UsageError('uso: event <TIPO> [--spec X] [--task T] [--agent A] [--reason ...] [--evidence ...]');
  const project = loadProject(root);
  const input = eventInputFromFlags(String(type).toUpperCase(), flags, project);
  try {
    const r = appendEvent(root, input, { ctx: { graph: project.taskGraph } });
    if (flags.json) console.log(JSON.stringify(r.status === 'duplicate' ? r : { status: r.status, event: r.event }));
    else if (r.status === 'duplicate') console.log(`${ICON.info} já registrado (chave ${r.key}) — nada gravado`);
    else console.log(`${ICON.ok} ${r.event.type}${r.event.spec ? ` ${r.event.spec}` : ''}${r.event.task ? ` ${r.event.task}` : ''} registrado`);
    return 0;
  } catch (e) {
    if (!(e instanceof EventRejected)) throw e;
    if (flags.json) console.log(JSON.stringify({ status: 'rejected', error: e.message }));
    else console.error(`${ICON.error} evento recusado: ${e.message}`);
    return 1;
  }
}

export async function stateCommand(args) {
  const [sub] = args.positional;
  switch (sub) {
    case 'show': return show(args);
    case 'resume': return resume(args);
    case 'rebuild': return rebuild(args);
    case 'verify': return verify(args);
    case 'repair': return repair(args);
    case 'ledger': return ledger(args);
    case 'import-ledger': return importLedger(args);
    default: throw new UsageError(`uso: state <show|resume|rebuild|verify|repair|ledger|import-ledger> (recebido: ${sub ?? 'nada'})`);
  }
}

function show({ root, flags }) {
  const { state } = computeState(root);
  if (flags.json) { console.log(JSON.stringify(state, null, 2)); return 0; }
  console.log(`eventos: ${state.events} · anomalias: ${state.anomalies.length} · duplicados ignorados: ${state.duplicates}`);
  const specs = Object.entries(state.specs);
  console.log(`\nspecs (${specs.length}):`);
  for (const [id, s] of specs) console.log(`  ${id.padEnd(22)} ${s.status}${s.imported ? ' (importada)' : ''}`);
  const tasks = Object.entries(state.tasks);
  console.log(`\ntarefas (${tasks.length}):`);
  for (const [id, t] of tasks) console.log(`  ${id.padEnd(30)} ${t.status.padEnd(12)} @${t.agent ?? '?'}${t.blocked_reason ? ` — ${t.blocked_reason}` : ''}`);
  return 0;
}

export function formatResume(s) {
  const L = [];
  L.push(`SDD — estado para retomada (${s.events} eventos${s.anomalies ? `, ${s.anomalies} anomalia(s)` : ''})`);
  if (s.open_sessions.length) L.push(`• sessões sem SESSION_FINISHED (interrompidas?): ${s.open_sessions.map((x) => x.id).join(', ')}`);
  L.push(s.active_specs.length ? `• specs ativas: ${s.active_specs.map((x) => `${x.id} [${x.status}]${x.last_rejection ? ` (última reprovação: ${x.last_rejection})` : ''}`).join('; ')}` : '• nenhuma spec ativa');
  if (s.tasks_in_progress.length) L.push(`• em andamento: ${s.tasks_in_progress.map((t) => `${t.id} (@${t.agent})`).join(', ')}`);
  if (s.tasks_blocked.length) L.push(`• bloqueadas: ${s.tasks_blocked.map((t) => `${t.id} — ${t.reason ?? 'sem motivo'}`).join('; ')}`);
  L.push(s.tasks_ready.length ? `• prontas para começar: ${s.tasks_ready.slice(0, 8).map((t) => `${t.id} (@${t.agent})`).join(', ')}${s.tasks_ready.length > 8 ? ` +${s.tasks_ready.length - 8}` : ''}` : '• nenhuma tarefa pronta');
  if (s.failing_tests.length) L.push(`• testes falhando: ${s.failing_tests.map((t) => t.spec).join(', ')}`);
  if (s.blocked_gates.length) L.push(`• gates bloqueados: ${s.blocked_gates.map((g) => `${g.gate}${g.spec ? `@${g.spec}` : ''}`).join(', ')}`);
  if (s.checkbox_drift.length) L.push(`• checkboxes divergentes do estado: ${s.checkbox_drift.length} (rode \`sdd tasks sync\`)`);
  return L.join('\n');
}

function resume({ root, flags }) {
  const s = resumeSummary(loadProject(root));
  if (flags.json) console.log(JSON.stringify(s, null, 2));
  else console.log(formatResume(s));
  return 0;
}

function rebuild({ root, flags }) {
  const { state, log } = computeState(root);
  writeState(root, state);
  if (!flags.json) console.log(`${ICON.ok} .sdd/state.json recalculado de ${log.events.length} evento(s)${state.anomalies.length ? ` · ${ICON.warn} ${state.anomalies.length} anomalia(s)` : ''}`);
  else console.log(JSON.stringify({ events: log.events.length, anomalies: state.anomalies }));
  return state.anomalies.length || log.problems.length ? 1 : 0;
}

function verify({ root, flags }) {
  const r = verifyState(root);
  if (flags.json) console.log(JSON.stringify({ ok: r.ok, issues: r.issues }, null, 2));
  else {
    for (const i of r.issues) console.log(`${i.severity === 'error' ? ICON.error : ICON.warn} ${i.path}: ${i.message}`);
    console.log(r.ok ? `${ICON.ok} estado coerente com o log (${r.log.events.length} eventos)` : `${ICON.error} estado inconsistente`);
  }
  return r.ok ? 0 : 1;
}

function repair({ root }) {
  const r = repairEvents(root);
  if (!r.repaired) { console.log(`${ICON.ok} nada a reparar`); return 0; }
  console.log(`${ICON.ok} cauda truncada movida para ${r.backup}`);
  const { state } = computeState(root);
  writeState(root, state);
  return 0;
}

function ledgerPath(project, flags) {
  const slug = flags.slug ?? slugId(project.cfg.config?.project?.name ?? 'projeto');
  return { slug, file: join(project.root, project.specsDir, '_gerador', `LEDGER-${slug}.md`) };
}

function ledger({ root, flags }) {
  const project = loadProject(root);
  const { slug, file } = ledgerPath(project, flags);
  const md = renderLedger(project, { slug });
  const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
  if (flags.check) {
    const ok = current === md;
    console.log(ok ? `${ICON.ok} LEDGER-${slug}.md em dia` : `${ICON.error} LEDGER-${slug}.md diverge do estado — rode \`sdd state ledger\``);
    return ok ? 0 : 1;
  }
  if (current !== null && !current.includes(LEDGER_MARKER)) {
    mkdirSync(sddPath(root, 'backup'), { recursive: true });
    const b = sddPath(root, 'backup', `LEDGER-${slug}.${timestampSlug()}.md`);
    copyFileSync(file, b);
    console.log(`${ICON.info} LEDGER escrito à mão preservado em ${b}`);
  }
  mkdirSync(join(root, project.specsDir, '_gerador'), { recursive: true });
  writeFileSync(file, md);
  console.log(`${ICON.ok} ${file.slice(root.length + 1)} gerado a partir do estado`);
  return 0;
}

function importLedger({ root, positional, flags }) {
  const file = positional[1];
  if (!file) throw new UsageError('uso: state import-ledger <LEDGER-x.md>');
  const rows = parseLegacyLedger(readFileSync(join(root, file), 'utf8'));
  if (!rows.length) { console.log(`${ICON.warn} nenhuma linha de spec reconhecida em ${file}`); return 1; }
  const chunkSize = 30;
  let imported = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => ({ spec: r.spec, state: r.state }));
    const r = appendEvent(root, { type: 'LEDGER_IMPORTED', key: `ledger-import:${file}:${i}`, meta: { specs: chunk, source: file } });
    if (r.status === 'appended') imported += chunk.length;
  }
  if (flags.json) console.log(JSON.stringify({ rows: rows.length, imported }));
  else console.log(`${ICON.ok} ${imported} spec(s) importada(s) de ${file} (marcadas como importadas do v2)`);
  return 0;
}
