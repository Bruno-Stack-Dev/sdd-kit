#!/usr/bin/env node
/**
 * Hooks determinísticos do SDD Kit para o Claude Code.
 *
 *   node scripts/hooks/sdd-hook.mjs <evento>     (JSON do Claude Code em stdin)
 *
 * Eventos: pre-tool-use · post-tool-use · session-start · session-end · stop · subagent-start · subagent-stop
 *
 * Trace local (fail-open) em .sdd/trace/<sessão>.jsonl: policy.decision, tool.completed, file.modified,
 * session.started/finished, agent.spawned/stopped — sem conteúdo, com segredos redigidos.
 *
 * Princípios:
 *  - PreToolUse aplica policies/sdd-policy.json (+ endurecimento da config). Só responde deny/ask;
 *    nunca concede permissão além das regras do usuário.
 *  - Fail-closed só para o que é destrutivo: erro interno diante de comando destrutivo → deny.
 *    Qualquer outro erro interno não bloqueia (observabilidade/feedback são fail-open).
 *  - Stop/SubagentStop bloqueiam no máximo uma vez (respeitam stop_hook_active).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadPolicy, effectivePolicy, evaluateToolCall, coarseDestructive, relToRoot } from '../lib/policy.mjs';
import { loadConfig } from '../lib/config.mjs';
import { ENGINE_ROOT, ENGINE_VERSION } from '../lib/engine.mjs';
import { toPosix } from '../lib/files.mjs';

const event = process.argv[2];

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
}

export function isSddProject(root) {
  return ['sdd.config.yaml', 'sdd.config.md', '.sdd', 'specs/_gerador'].some((p) => existsSync(join(root, p)));
}

function cliCommand(root) {
  const same = toPosix(root).replace(/\/+$/, '').toLowerCase() === toPosix(ENGINE_ROOT).replace(/\/+$/, '').toLowerCase();
  return same ? 'node scripts/sdd.mjs' : `node "${toPosix(join(ENGINE_ROOT, 'scripts', 'sdd.mjs'))}"`;
}

async function lazy(mod) {
  return import(new URL(mod, import.meta.url).href);
}

/** Trace local ligado? Só em projeto SDD e se a config não desligou (observability.trace: false). */
function tracing(root, config) {
  return isSddProject(root) && config?.observability?.trace !== false;
}

/** Grava um evento de trace; fail-open (nunca lança). */
async function trace(root, config, input, name, attrs = {}, status = 'ok') {
  try {
    if (!tracing(root, config)) return;
    const { traceEvent } = await lazy('../lib/trace.mjs');
    traceEvent(root, { session: input.session_id, name, attrs: { 'sdd.agent': input.agent_type, ...attrs }, status });
  } catch { /* observabilidade é fail-open */ }
}

/** Tarefa em andamento correlacionada à chamada: a do agente, ou a única em andamento. */
async function currentTask(root, agent) {
  try {
    if (!existsSync(join(root, '.sdd', 'events.jsonl'))) return {};
    const { computeState } = await lazy('../lib/events.mjs');
    const { state } = computeState(root);
    const open = Object.entries(state.tasks).filter(([, t]) => t.status === 'in_progress' && (!agent || t.agent === agent));
    return open.length === 1 ? { 'sdd.task': open[0][0], 'sdd.spec': open[0][1].spec } : {};
  } catch { return {}; }
}

// ------------------------------------------------------------------------------------------------

async function preToolUse(input) {
  // Costura de teste: simula falha interna do policy engine para provar o fail-closed.
  if (process.env.SDD_HOOK_TEST_THROW === '1') throw new Error('falha simulada');
  const root = projectRoot(input);
  let config = null;
  try { config = loadConfig(root).config; } catch { /* config inválida não desliga a política núcleo */ }
  const eff = effectivePolicy(loadPolicy(), config);
  const r = evaluateToolCall(input, { root, eff });
  if (r.decision === 'allow') return;
  const { summarizeToolInput } = await lazy('../lib/trace.mjs');
  await trace(root, config, input, 'policy.decision', { 'tool.name': input.tool_name, 'policy.decision': r.decision, 'policy.rule': r.rule, ...summarizeToolInput(input.tool_name, input.tool_input) }, r.decision === 'deny' ? 'error' : 'ok');
  out({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: r.decision,
      permissionDecisionReason: `SDD policy (${r.decision}): ${r.reason}`,
    },
  });
}

async function postToolUse(input) {
  const root = projectRoot(input);
  if (isSddProject(root)) {
    let config = null;
    try { config = loadConfig(root).config; } catch { /* trace segue com o default */ }
    if (tracing(root, config)) {
      const { summarizeToolInput } = await lazy('../lib/trace.mjs');
      const failed = input.tool_response && typeof input.tool_response === 'object' && (input.tool_response.is_error || input.tool_response.error);
      const attrs = { 'tool.name': input.tool_name, ...summarizeToolInput(input.tool_name, input.tool_input), ...(await currentTask(root, input.agent_type)) };
      await trace(root, config, input, ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name) ? 'file.modified' : 'tool.completed', attrs, failed ? 'error' : 'ok');
    }
  }
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name ?? 'Write')) return;
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!file || !isSddProject(root)) return;
  const rel = relToRoot(root, file);
  if (!rel) return;
  const problems = [];
  if (rel === 'sdd.config.yaml') {
    const r = loadConfig(root);
    for (const e of r.errors) problems.push(`${e.path}: ${e.message}`);
    if (!r.errors.length && r.warnings.some((w) => w.path === 'sdd.config.md')) {
      out({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `sdd.config.yaml mudou: regenere a visão com \`${cliCommand(root)} config render\`.` } });
      return;
    }
  } else if (/\.md$/.test(rel)) {
    const { loadProject } = await lazy('../lib/project.mjs');
    const p = loadProject(root);
    if (!rel.startsWith(`${p.specsDir}/`)) return;
    const spec = p.specs.find((s) => s.file === rel);
    if (spec) {
      if (!spec.fm) problems.push('sem frontmatter');
      else {
        if (!spec.id) problems.push("falta 'spec-id'");
        if (!['rascunho', 'aprovada', 'implementada', 'arquivada'].includes(spec.status)) problems.push(`status inválido '${spec.status}'`);
        const cas = Number(spec.cas);
        if (Number.isNaN(cas)) problems.push("'cas' não é número");
        else if (cas !== spec.caCount && spec.status !== 'rascunho') problems.push(`'cas: ${cas}' mas o corpo tem ${spec.caCount} CA(s)`);
        const st = p.state.specs[spec.id];
        if (spec.status === 'implementada' && st && st.status !== 'implemented') problems.push(`'implementada' sem SPEC_IMPLEMENTED no estado (status '${st.status}'): o guardião precisa aprovar e o fechamento precisa ser registrado`);
      }
    }
    if (rel.startsWith(`${p.specsDir}/tasks/`)) {
      for (const e of p.taskGraph.errors) if (e.path.startsWith(rel) || e.path === `${p.specsDir}/tasks`) problems.push(`${e.path}: ${e.message}`);
    }
    for (const e of p.specGraph.errors) if (e.path === rel) problems.push(e.message);
  }
  if (problems.length) {
    out({ decision: 'block', reason: `SDD: ${rel} ficou inválido — corrija antes de seguir:\n- ${problems.join('\n- ')}` });
  }
}

async function sessionStart(input) {
  const root = projectRoot(input);
  if (!isSddProject(root)) return;
  const lines = [`SDD Kit ${ENGINE_VERSION} ativo. CLI determinística: \`${cliCommand(root)} <comando>\` (config, event, state, tasks, spec, doctor, check).`];
  try {
    mkdirSync(join(root, '.sdd', 'cache'), { recursive: true });
    if (input.session_id) writeFileSync(join(root, '.sdd', 'cache', 'session.json'), JSON.stringify({ id: input.session_id, source: input.source ?? null, started: new Date().toISOString() }));
  } catch { /* cache é opcional */ }
  const cfg = loadConfig(root);
  await trace(root, cfg.config, input, 'session.started', { 'session.source': input.source ?? 'startup' });
  if (cfg.source === 'none') lines.push('Sem sdd.config.yaml: rode /sdd-init antes de gerar specs ou código.');
  else if (cfg.errors.length) lines.push(`Config INVÁLIDA (${cfg.errors.length} erro[s]): rode \`${cliCommand(root)} config validate\` e corrija antes de implementar.`);
  else if (cfg.source === 'md-legacy') lines.push(`Config ainda no formato v2 (sdd.config.md): sugira \`${cliCommand(root)} config migrate\`.`);
  try {
    const { checkMcpGovernance } = await lazy('../lib/mcp.mjs');
    const m = checkMcpGovernance(root, cfg.config);
    if (m.errors.length) lines.push(`ATENÇÃO — MCP não governado: ${m.errors.join('; ')}. Não use esses servidores até revisar (\`${cliCommand(root)} mcp check\`).`);
  } catch { /* governança de MCP é informativa aqui */ }
  try {
    const { appendEvent } = await lazy('../lib/events.mjs');
    if (input.session_id && existsSync(join(root, '.sdd', 'events.jsonl'))) {
      appendEvent(root, { type: 'SESSION_STARTED', session: input.session_id, key: `session-started:${input.session_id}:${input.source ?? 'startup'}` });
    }
    const { loadProject, resumeSummary } = await lazy('../lib/project.mjs');
    const { formatResume } = await lazy('../commands/state.mjs');
    const p = loadProject(root);
    if (p.state.events > 0) lines.push(formatResume(resumeSummary(p)));
  } catch (e) { lines.push(`(estado indisponível: ${e.message})`); }
  lines.push('Guardrails ativos (hooks): segredos (.env, chaves), estado (.sdd/events.jsonl), arquivos gerados e git destrutivo são bloqueados deterministicamente; spec só fecha com GUARDIAN_APPROVED registrado.');
  out({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } });
}

async function stop(input) {
  if (input.stop_hook_active) return;
  const root = projectRoot(input);
  if (!existsSync(join(root, '.sdd', 'events.jsonl'))) return;
  const { loadProject, resumeSummary } = await lazy('../lib/project.mjs');
  const p = loadProject(root);
  const issues = [];
  if (p.log.truncatedTail) issues.push(`.sdd/events.jsonl terminou numa linha truncada — rode \`${cliCommand(root)} state repair\``);
  for (const s of p.specs) {
    const st = s.id && p.state.specs[s.id];
    if (s.status === 'implementada' && st && st.status !== 'implemented') issues.push(`${s.file}: marcada 'implementada' sem SPEC_IMPLEMENTED (estado '${st.status}') — volte o status ou conclua pelo guardião`);
  }
  try {
    const { formatResume } = await lazy('../commands/state.mjs');
    mkdirSync(join(root, '.sdd', 'reports'), { recursive: true });
    const id = String(input.session_id ?? 'sessao').replace(/[^A-Za-z0-9_-]/g, '');
    writeFileSync(join(root, '.sdd', 'reports', `session-${id}.md`), `# Sessão ${id}\n\n${new Date().toISOString()}\n\n\`\`\`\n${formatResume(resumeSummary(p))}\n\`\`\`\n${issues.length ? `\n## Pendências críticas\n\n- ${issues.join('\n- ')}\n` : ''}`);
  } catch { /* relatório é opcional */ }
  if (issues.length) out({ decision: 'block', reason: `SDD — reconciliação de fim de turno:\n- ${issues.join('\n- ')}` });
}

async function subagentStart(input) {
  const root = projectRoot(input);
  let config = null;
  try { config = loadConfig(root).config; } catch { /* default */ }
  await trace(root, config, input, 'agent.spawned', { ...(await currentTask(root, input.agent_type)) });
}

async function subagentStop(input) {
  const root = projectRoot(input);
  const agent = input.agent_type;
  if (!input.stop_hook_active) {
    let config = null;
    try { config = loadConfig(root).config; } catch { /* default */ }
    await trace(root, config, input, 'agent.stopped', {});
  }
  if (input.stop_hook_active) return;
  if (!agent || !existsSync(join(root, '.sdd', 'events.jsonl'))) return;
  const { computeState } = await lazy('../lib/events.mjs');
  const { state } = computeState(root);
  const cli = cliCommand(root);
  const reasons = [];
  if (agent === 'agente-spec-guardian') {
    for (const [id, s] of Object.entries(state.specs)) {
      if (s.status === 'in_review') reasons.push(`spec ${id} em revisão sem veredito: registre \`${cli} event GUARDIAN_APPROVED --spec ${id} --evidence <relatório>\` ou \`${cli} event GUARDIAN_REJECTED --spec ${id} --reason "<o que falta>"\``);
    }
  }
  for (const [id, t] of Object.entries(state.tasks)) {
    // Tarefa de onda paralela: quem fecha é o orquestrador, depois da suíte única da onda.
    if (t.agent === agent && t.status === 'in_progress' && !t.wave) reasons.push(`tarefa ${id} ainda 'in_progress': registre \`${cli} event TASK_COMPLETED --task ${id}\` (verde) ou \`TASK_BLOCKED --task ${id} --reason "..."\``);
  }
  if (reasons.length) out({ decision: 'block', reason: `SDD — antes de encerrar @${agent}:\n- ${reasons.join('\n- ')}` });
}

async function sessionEnd(input) {
  const root = projectRoot(input);
  let config = null;
  try { config = loadConfig(root).config; } catch { /* default */ }
  await trace(root, config, input, 'session.finished', { 'session.reason': input.reason });
  if (!input.session_id || !existsSync(join(root, '.sdd', 'events.jsonl'))) return;
  const { appendEvent } = await lazy('../lib/events.mjs');
  appendEvent(root, { type: 'SESSION_FINISHED', session: input.session_id, key: `session-finished:${input.session_id}` });
}

// ------------------------------------------------------------------------------------------------

const HANDLERS = {
  'pre-tool-use': preToolUse,
  'post-tool-use': postToolUse,
  'session-start': sessionStart,
  'session-end': sessionEnd,
  stop,
  'subagent-start': subagentStart,
  'subagent-stop': subagentStop,
};

async function main() {
  const input = readStdin();
  const handler = HANDLERS[event];
  if (!handler) { process.stderr.write(`sdd-hook: evento desconhecido '${event}'\n`); return 0; }
  try {
    await handler(input);
  } catch (e) {
    if (event === 'pre-tool-use' && ['Bash', 'PowerShell'].includes(input.tool_name) && coarseDestructive(input.tool_input?.command ?? '')) {
      out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `SDD policy: erro interno do policy engine (${e.message}); comando destrutivo negado por segurança (fail-closed).` } });
      return 0;
    }
    process.stderr.write(`sdd-hook (${event}): erro interno ignorado: ${e.message}\n`);
  }
  return 0;
}

main().then((code) => process.exit(code));
