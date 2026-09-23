// `sdd tasks <list|ready|show|graph|sync>` · `sdd spec <next-id|new>` · `sdd template <list|show|path>`
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON, today } from '../lib/cli.mjs';
import { loadProject } from '../lib/project.mjs';
import { readyTasks, parallelBatches, topoOrder } from '../lib/graph.mjs';
import { resolveTaskId, STATUS_CHECKBOX, nextSpecId } from '../lib/specs.mjs';
import { appendEvent, EventRejected } from '../lib/events.mjs';
import { resolveTask } from '../lib/models.mjs';
import { listTemplates, readTemplate, templatePath, choosePipeline, renderSpec, renderPlan, renderTasks } from '../lib/scaffold.mjs';

export async function tasksCommand(args) {
  const [sub] = args.positional;
  switch (sub) {
    case 'list': return list(args);
    case 'ready': return ready(args);
    case 'show': return show(args);
    case 'graph': return graph(args);
    case 'sync': return sync(args);
    default: throw new UsageError(`uso: tasks <list|ready|show|graph|sync> (recebido: ${sub ?? 'nada'})`);
  }
}

function printGraphErrors(p) {
  for (const e of p.taskGraph.errors) console.log(`${ICON.error} ${e.path}: ${e.message}`);
  return p.taskGraph.errors.length;
}

function list({ root, flags }) {
  const p = loadProject(root);
  const rows = [...p.taskGraph.tasks.values()].map((t) => ({ id: t.id, spec: t.spec, agent: t.agent, status: p.statusOf(t.id), deps: t.dependsOn, title: t.title }));
  if (flags.json) { console.log(JSON.stringify({ tasks: rows, errors: p.taskGraph.errors }, null, 2)); return p.taskGraph.errors.length ? 1 : 0; }
  for (const r of rows) console.log(`${r.status.padEnd(12)} ${r.id.padEnd(28)} @${r.agent.padEnd(28)} ${r.title}`);
  return printGraphErrors(p) ? 1 : 0;
}

function ready({ root, flags }) {
  const p = loadProject(root);
  const r = readyTasks(p.taskGraph, p.statusOf);
  const batch = parallelBatches(r);
  const routing = Object.fromEntries(r.map((t) => [t.id, routingSummary(p, t)]));
  if (flags.json) { console.log(JSON.stringify({ ready: r.map((t) => t.id), parallel_safe: batch.map((t) => t.id), routing, errors: p.taskGraph.errors })); return p.taskGraph.errors.length ? 1 : 0; }
  if (p.taskGraph.errors.length) { printGraphErrors(p); console.log(`${ICON.error} grafo inválido: corrija antes de escolher tarefas`); return 1; }
  if (!r.length) console.log('nenhuma tarefa pronta');
  for (const t of r) console.log(`${t.id.padEnd(28)} @${t.agent.padEnd(28)} ${`[${routing[t.id].model}]`.padEnd(9)} ${t.title}`);
  if (batch.length > 1) console.log(`\nparalelizáveis sem conflito aparente (agentes/specs distintos): ${batch.map((t) => t.id).join(', ')}`);
  return 0;
}

/** Modelo da tarefa pela política de roteamento (`sdd models resolve --task` dá o detalhe). */
function routingSummary(p, t) {
  const r = resolveTask(p, t);
  return { model: r.model, effort: r.effort, tier: r.tier, role: r.role, source: r.source.model, signals: r.signals };
}

function show({ root, positional, flags }) {
  const id = positional[1];
  if (!id) throw new UsageError('uso: tasks show <T-NNN | SPEC/T-NNN>');
  const p = loadProject(root);
  const matches = resolveTaskId(id, [...p.taskGraph.tasks.values()]);
  if (!matches.length) { console.log(`${ICON.error} tarefa '${id}' não encontrada`); return 1; }
  if (matches.length > 1) { console.log(`${ICON.warn} '${id}' é ambígua: ${matches.map((t) => t.id).join(', ')}`); return 1; }
  const t = matches[0];
  const info = { ...t, status: p.statusOf(t.id), state: p.state.tasks[t.id] ?? null, deps_status: Object.fromEntries(t.dependsOn.map((d) => [d, p.statusOf(d)])), routing: routingSummary(p, t) };
  if (flags.json) console.log(JSON.stringify(info, null, 2));
  else {
    const m = info.routing;
    console.log(`${t.id} — ${t.title}\n  agente: @${t.agent}\n  status: ${info.status}\n  arquivo: ${t.file}:${t.line}`);
    console.log(`  modelo: ${m.model}${m.effort ? ` · ${m.effort}` : ''} (papel ${m.role}, fonte ${m.source}${m.signals.length ? `, sinais: ${m.signals.join(', ')}` : ''})`);
    for (const [d, s] of Object.entries(info.deps_status)) console.log(`  depende de ${d}: ${s}`);
    if (info.state?.blocked_reason) console.log(`  bloqueio: ${info.state.blocked_reason}`);
  }
  return 0;
}

function graph({ root, flags }) {
  const p = loadProject(root);
  const order = topoOrder(p.taskGraph.adjacency);
  if (flags.json) { console.log(JSON.stringify({ order, adjacency: p.taskGraph.adjacency, errors: p.taskGraph.errors }, null, 2)); return p.taskGraph.errors.length ? 1 : 0; }
  console.log('graph TD');
  for (const [id, deps] of Object.entries(p.taskGraph.adjacency)) {
    const node = id.replace(/[^A-Za-z0-9]/g, '_');
    if (!deps.length) console.log(`  ${node}["${id}"]`);
    for (const d of deps) console.log(`  ${d.replace(/[^A-Za-z0-9]/g, '_')} --> ${node}["${id}"]`);
  }
  return printGraphErrors(p) ? 1 : 0;
}

/**
 * Sincroniza definições (Markdown) e estado (eventos):
 *  1. specs/planos/tarefas que ainda não estão no estado ganham eventos de criação (idempotentes);
 *     numa primeira sincronização, o status dos checkboxes entra como importado;
 *  2. daí em diante o estado é a autoridade: os checkboxes são reescritos a partir dele.
 */
function sync({ root, flags }) {
  let p = loadProject(root);
  if (p.taskGraph.errors.length || p.specGraph.errors.length) {
    for (const e of [...p.specGraph.errors, ...p.taskGraph.errors]) console.log(`${ICON.error} ${e.path}: ${e.message}`);
    console.log(`${ICON.error} corrija o grafo antes de sincronizar`);
    return 1;
  }
  const created = { specs: 0, plans: 0, tasks: 0 };
  const rejected = [];
  const append = (input) => {
    try {
      const r = appendEvent(root, input, { ctx: { graph: p.taskGraph } });
      return r.status === 'appended';
    } catch (e) {
      if (!(e instanceof EventRejected)) throw e;
      rejected.push(`${input.type} ${input.spec ?? input.task ?? ''}: ${e.message}`);
      return false;
    }
  };
  for (const id of topoOrder(p.specGraph.adjacency)) {
    if (p.state.specs[id]) continue;
    const s = p.specGraph.specs.get(id);
    if (s.status === 'implementada') {
      if (append({ type: 'LEDGER_IMPORTED', key: `spec-import:${id}`, meta: { specs: [{ spec: id, state: 'feita' }], source: s.file } })) created.specs++;
    } else if (append({ type: 'SPEC_CREATED', spec: id, key: `spec-created:${id}`, meta: { file: s.file } })) created.specs++;
  }
  for (const plan of p.plans) {
    if (plan.spec && append({ type: 'PLAN_CREATED', spec: plan.spec, plan: plan.id ?? plan.spec, key: `plan-created:${plan.spec}` })) created.plans++;
  }
  p = loadProject(root);
  for (const t of p.taskGraph.tasks.values()) {
    if (p.state.tasks[t.id]) continue;
    const meta = t.checkbox && t.checkbox !== 'pending' ? { imported_status: t.checkbox } : {};
    if (append({ type: 'TASK_CREATED', task: t.id, spec: t.spec, agent: t.agent, key: `task-created:${t.id}`, meta })) created.tasks++;
  }
  // Estado → checkboxes
  p = loadProject(root);
  let rewritten = 0;
  for (const f of p.taskFiles) {
    const abs = join(root, f.file);
    const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
    let changed = false;
    for (const t of f.tasks) {
      const st = p.state.tasks[t.id]?.status;
      if (!st || st === t.checkbox) continue;
      const box = STATUS_CHECKBOX[st];
      lines[t.line - 1] = lines[t.line - 1].replace(/- \[.\]/, `- [${box}]`);
      changed = true;
      rewritten++;
    }
    if (changed && !flags.dryRun) writeFileSync(abs, lines.join('\n'));
  }
  const summary = { created, checkboxes_rewritten: rewritten, rejected };
  if (flags.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`${ICON.ok} sync: ${created.specs} spec(s), ${created.plans} plano(s), ${created.tasks} tarefa(s) registradas · ${rewritten} checkbox(es) reescrito(s) a partir do estado`);
    for (const r of rejected) console.log(`${ICON.warn} ${r}`);
  }
  return rejected.length ? 1 : 0;
}

export async function specCommand(args) {
  const [sub] = args.positional;
  if (sub === 'next-id') return nextId(args);
  if (sub === 'new') return specNew(args);
  throw new UsageError(`uso: spec <next-id|new> (recebido: ${sub ?? 'nada'})`);
}

function numberingOf(p) {
  const numbering = p.cfg.config?.numbering;
  if (!numbering?.prefix || /^</.test(numbering.prefix)) return null;
  return numbering;
}

function nextId({ flags, root }) {
  const p = loadProject(root);
  const numbering = numberingOf(p);
  if (!numbering) { console.log(`${ICON.error} config sem numbering.prefix válido — rode \`sdd config validate\``); return 1; }
  const id = nextSpecId(root, numbering, { newBlock: !!flags.newBlock, specsDir: p.specsDir });
  if (flags.json) console.log(JSON.stringify({ id }));
  else console.log(id);
  return 0;
}

/** Cria spec + plano + tarefas (uma por etapa da pipeline) e registra os eventos de criação. */
function specNew({ flags, root, positional }) {
  const slug = flags.slug ?? positional[1];
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new UsageError('uso: spec new --slug <kebab-case> --title "<título>" [--pipeline <nome>] [--new-block] [--depends A,B]');
  const p = loadProject(root);
  if (p.cfg.errors.length) { console.log(`${ICON.error} config inválida — rode \`sdd config validate\` antes de criar specs`); return 1; }
  const numbering = numberingOf(p);
  if (!numbering) { console.log(`${ICON.error} config sem numbering.prefix válido`); return 1; }
  let pipeline;
  try { pipeline = choosePipeline(p.cfg.config, flags.pipeline); } catch (e) { throw new UsageError(e.message); }
  const id = nextSpecId(root, numbering, { newBlock: !!flags.newBlock, specsDir: p.specsDir });
  const title = String(flags.title ?? slug.replace(/-/g, ' '));
  const deps = flags.depends ? String(flags.depends).split(',').map((d) => d.trim()).filter(Boolean) : [];
  const unknown = deps.filter((d) => !p.specGraph.specs.has(d));
  if (unknown.length) throw new UsageError(`--depends com spec inexistente: ${unknown.join(', ')}`);
  const date = today();
  const files = {
    [`${p.specsDir}/features/${id}-${slug}.md`]: renderSpec({ id, title, deps, date }),
    [`${p.specsDir}/plans/${id}-${slug}.md`]: renderPlan({ id, title, pipeline, date }),
    [`${p.specsDir}/tasks/${id}-${slug}.md`]: renderTasks({ id, title, pipeline, date }),
  };
  for (const rel of Object.keys(files)) if (existsSync(join(root, rel))) throw new UsageError(`${rel} já existe`);
  if (flags.dryRun) { console.log(JSON.stringify({ id, pipeline: pipeline.name, files: Object.keys(files) }, null, 2)); return 0; }
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  const q = loadProject(root);
  const append = (input) => appendEvent(root, input, { ctx: { graph: q.taskGraph } });
  append({ type: 'SPEC_CREATED', spec: id, key: `spec-created:${id}`, meta: { file: Object.keys(files)[0], pipeline: pipeline.name } });
  append({ type: 'PLAN_CREATED', spec: id, plan: id, key: `plan-created:${id}` });
  for (const t of [...q.taskGraph.tasks.values()].filter((t) => t.spec === id)) {
    append({ type: 'TASK_CREATED', task: t.id, spec: id, agent: t.agent, key: `task-created:${t.id}` });
  }
  if (flags.json) console.log(JSON.stringify({ id, pipeline: pipeline.name, files: Object.keys(files) }, null, 2));
  else {
    console.log(`${ICON.ok} ${id} criada (pipeline ${pipeline.name}, ${pipeline.steps.length} tarefa(s))`);
    for (const f of Object.keys(files)) console.log(`  ${f}`);
    console.log('Preencha a spec (CAs numerados, cas: coerente) e rode `sdd doctor --fast`.');
  }
  return 0;
}

export async function templateCommand({ positional, flags }) {
  const [sub, name] = positional;
  if (sub === 'list') {
    const names = listTemplates();
    if (flags.json) console.log(JSON.stringify(names));
    else console.log(names.join('\n'));
    return 0;
  }
  if (sub === 'show' || sub === 'path') {
    if (!name) throw new UsageError('uso: template show|path <nome> (veja `template list`)');
    const path = templatePath(name);
    if (!path) throw new UsageError(`template '${name}' não existe — veja \`template list\``);
    process.stdout.write(sub === 'path' ? `${path}\n` : readTemplate(name));
    return 0;
  }
  throw new UsageError('uso: template <list|show|path> [nome]');
}
