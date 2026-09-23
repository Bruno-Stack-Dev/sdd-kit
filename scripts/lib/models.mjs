// Roteamento de modelos: qual modelo (e esforço) cada agente usa em cada tarefa.
//
// Determinístico, na mesma ordem para CLI, doctor e skills:
//   1. etapa da pipeline (`model`/`effort` na config)        → explícito, vence
//   2. `agents.models.overrides.<agente>` da config          → explícito
//   3. política (policies/model-routing.json): papel do agente → nível, ajustado pelo perfil
//      (`agents.models.profile`) e pelos sinais do contexto (reprovação no guardião, reabertura,
//      spec grande ou crítica), limitado pelo piso do papel; etapa de guardião roda no topo.
// Modelo e esforço resolvem cada um pela primeira fonte que os declara.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_ROOT } from './engine.mjs';
import { parseYaml } from './yaml.mjs';

export const MODEL_ALIASES = ['inherit', 'opus', 'sonnet', 'haiku', 'fable'];
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]*$/;
const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

let policyCache;
export function routingPolicy() {
  policyCache ??= JSON.parse(readFileSync(join(ENGINE_ROOT, 'policies', 'model-routing.json'), 'utf8'));
  return policyCache;
}

export function isModelValue(v) {
  return typeof v === 'string' && (MODEL_ALIASES.includes(v) || MODEL_ID.test(v));
}

/** `light|standard|deep`, alias ou ID → { tier?, model, effort? }. Devolve null se inválido. */
export function parseChoice(v, policy = routingPolicy()) {
  if (typeof v !== 'string') return null;
  if (policy.tiers[v]) return { tier: v, model: policy.tiers[v].model, effort: policy.tiers[v].effort };
  if (isModelValue(v)) return { tier: tierOfModel(v, policy), model: v };
  return null;
}

/** Nível correspondente a um alias de modelo (null para inherit, fable ou ID completo). */
export function tierOfModel(model, policy = routingPolicy()) {
  return Object.entries(policy.tiers).find(([, t]) => t.model === model)?.[0] ?? null;
}

const idx = (policy, tier) => policy.order.indexOf(tier);
const clampTier = (policy, i) => policy.order[Math.max(0, Math.min(policy.order.length - 1, i))];

/** Frontmatter de um agente: projeto primeiro, depois o motor (modo plugin). */
export function agentFrontmatter(root, name) {
  for (const dir of [join(root, '.claude', 'agents'), join(ENGINE_ROOT, '.claude', 'agents')]) {
    const f = join(dir, `${name}.md`);
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    try { return parseYaml(m[1]) ?? {}; } catch { return {}; }
  }
  return null;
}

function toolList(v) {
  if (v === undefined || v === null) return null;
  return (Array.isArray(v) ? v.map(String) : String(v).split(',')).map((s) => s.trim().replace(/\(.*\)$/, '')).filter(Boolean);
}

/** Papel do agente: config (`agents.models.roles`) > política > inferência pelo nome/ferramentas. */
export function roleOf(agent, { config, fm, policy = routingPolicy() } = {}) {
  const fromConfig = config?.agents?.models?.roles?.[agent];
  if (fromConfig && policy.roles[fromConfig]) return { role: fromConfig, source: 'config' };
  if (policy.agents[agent]) return { role: policy.agents[agent], source: 'policy' };
  const tools = toolList(fm?.tools);
  const denied = toolList(fm?.disallowedTools) ?? [];
  const readOnly = tools !== null && !tools.filter((t) => !denied.includes(t)).some((t) => WRITE_TOOLS.includes(t));
  for (const r of policy.inference.rules) {
    if (r.if === 'name-suffix' && agent.endsWith(r.value)) return { role: r.role, source: 'inferred', why: `nome termina em '${r.value}'` };
    if (r.if === 'read-only' && readOnly) return { role: r.role, source: 'inferred', why: 'sem ferramentas de escrita' };
  }
  return { role: policy.inference.fallback, source: 'inferred', why: 'padrão para agente que escreve código' };
}

/** Sinais do contexto que sobem o nível (só para a parte resolvida pela política). */
function contextSignals({ role, specState, taskState, spec }, policy) {
  const S = policy.signals;
  const hits = [];
  if (role !== 'audit' && (specState?.rejections ?? 0) > 0) {
    hits.push({ signal: 'rework', shift: S.rework.shift, reason: `spec reprovada ${specState.rejections}× pelo guardião — refazer com modelo mais forte` });
  }
  if ((taskState?.reopened ?? 0) > 0) {
    hits.push({ signal: 'reopened', shift: S.reopened.shift, reason: `tarefa reaberta ${taskState.reopened}×` });
  }
  if (spec && S.large_spec.roles.includes(role) && (spec.caCount ?? 0) >= S.large_spec.min_cas) {
    hits.push({ signal: 'large_spec', shift: S.large_spec.shift, reason: `spec com ${spec.caCount} Critérios de Aceitação (≥ ${S.large_spec.min_cas})` });
  }
  const tags = asList(spec?.fm?.tags).map((t) => t.toLowerCase());
  const critical = tags.filter((t) => S.critical_tags.tags.includes(t));
  if (critical.length) hits.push({ signal: 'critical_tags', shift: S.critical_tags.shift, reason: `spec marcada ${critical.map((t) => `'${t}'`).join(', ')}` });
  return hits;
}

function asList(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.map(String);
  const s = String(v).trim();
  return (s.startsWith('[') ? s.slice(1, -1).split(',') : [s]).map((x) => x.trim()).filter(Boolean);
}

/**
 * Resolve modelo e esforço de um agente, opcionalmente numa etapa e numa tarefa.
 * @returns { agent, role, role_source, tier, model, effort, source: {model, effort}, profile,
 *            reasons: [], warnings: [], notes: [], signals: [] }
 */
export function resolveModel({ agent, step = null, config = null, fm = null, context = {}, profile: profileFlag, policy = routingPolicy() }) {
  const reasons = [];
  const warnings = [];
  const { role, source: roleSource, why } = roleOf(agent, { config, fm, policy });
  const roleDef = policy.roles[role];
  reasons.push(`papel '${role}' (${roleSource === 'policy' ? 'política' : roleSource === 'config' ? 'config agents.models.roles' : `inferido: ${why}`}) → nível ${roleDef.tier}`);
  const profile = profileFlag ?? config?.agents?.models?.profile ?? policy.default_profile;
  if (!policy.profiles[profile]) throw new Error(`perfil '${profile}' não existe (há: ${Object.keys(policy.profiles).join(', ')})`);

  // Política: nível do papel + perfil + sinais, limitado pelo piso.
  let i = idx(policy, roleDef.tier);
  const shift = policy.profiles[profile].shift;
  if (shift) { i += shift; reasons.push(`perfil ${profile} (${shift > 0 ? '+' : ''}${shift})`); }
  const signals = contextSignals({ role, ...context }, policy);
  if (signals.length) {
    const total = Math.min(policy.signals.max_escalation, signals.reduce((a, s) => a + s.shift, 0));
    i += total;
    for (const s of signals) reasons.push(s.reason);
    if (total < signals.reduce((a, s) => a + s.shift, 0)) reasons.push(`escalonamento limitado a +${policy.signals.max_escalation}`);
  }
  let floor = idx(policy, roleDef.floor);
  if (step?.guardian) {
    floor = Math.max(floor, idx(policy, policy.signals.guardian_step.floor));
    reasons.push(`etapa de guardião: piso ${policy.signals.guardian_step.floor}`);
  }
  if (i < floor) reasons.push(`piso do papel: ${policy.order[floor]}`);
  const policyTier = clampTier(policy, Math.max(i, floor));
  const fromPolicy = { tier: policyTier, model: policy.tiers[policyTier].model, effort: policy.tiers[policyTier].effort };

  // Fontes explícitas: etapa > override por agente.
  const ov = config?.agents?.models?.overrides?.[agent];
  const ovModel = parseChoice(typeof ov === 'string' ? ov : ov?.model, policy);
  const ovEffort = typeof ov === 'object' && ov?.effort ? ov.effort : (typeof ov === 'string' ? ovModel?.effort : undefined);
  const stepModel = parseChoice(step?.model, policy);
  const stepEffort = step?.effort ?? stepModel?.effort;

  let model, tier, modelSource;
  if (stepModel) { ({ model, tier } = stepModel); modelSource = 'pipeline'; reasons.push(`modelo fixado na etapa: ${step.model}`); }
  else if (ovModel) { ({ model, tier } = ovModel); modelSource = 'config'; reasons.push(`modelo fixado em agents.models.overrides: ${typeof ov === 'string' ? ov : ov.model}`); }
  else { ({ model, tier } = fromPolicy); modelSource = 'policy'; }

  let effort, effortSource;
  if (stepEffort) { effort = stepEffort; effortSource = 'pipeline'; }
  else if (ovEffort) { effort = ovEffort; effortSource = 'config'; }
  else if (modelSource === 'policy' || tier) { effort = (modelSource === 'policy' ? fromPolicy : policy.tiers[tier]).effort; effortSource = modelSource === 'policy' ? 'policy' : modelSource; }
  else { effort = null; effortSource = null; }

  if (modelSource !== 'policy' && tier && idx(policy, tier) < floor) {
    warnings.push(`${agent}: ${model} (${tier}) está abaixo do piso '${policy.order[floor]}' do papel '${role}'${step?.guardian ? ' numa etapa de guardião' : ''}`);
  }
  const notes = [];
  if (fm && effort && fm.effort && fm.effort !== effort) {
    notes.push(`${agent}: esforço resolvido '${effort}' difere do frontmatter ('${fm.effort}') — o Agent tool não recebe esforço por chamada; vale o do frontmatter`);
  }
  return {
    agent, role, role_source: roleSource, tier: tier ?? null, model, effort,
    source: { model: modelSource, effort: effortSource }, profile, signals: signals.map((s) => s.signal), reasons, warnings, notes,
  };
}

/** Etapa da pipeline que gerou a tarefa: pela pipeline do arquivo de tarefas, nome e agente. */
export function stepOfTask(p, t) {
  const pipelines = p.cfg.config?.pipelines ?? {};
  const file = p.taskFiles.find((f) => f.file === t.file);
  const declared = file?.fm?.pipeline ? String(file.fm.pipeline) : null;
  const candidates = declared && pipelines[declared] ? [[declared, pipelines[declared]]] : Object.entries(pipelines);
  for (const [name, steps] of candidates) {
    if (!Array.isArray(steps)) continue;
    const s = steps.find((x) => x?.agent === t.agent && (t.title === x.name || t.title.startsWith(`${x.name} — `)));
    if (s) return { pipeline: name, step: s };
  }
  if (declared && Array.isArray(pipelines[declared])) {
    const n = Number(t.localId.replace(/^T-/, ''));
    const s = pipelines[declared][n - 1];
    if (s?.agent === t.agent) return { pipeline: declared, step: s };
  }
  return { pipeline: declared, step: null };
}

/** Resolução para uma tarefa do grafo (com etapa, estado e spec como contexto). */
export function resolveTask(p, t, { profile } = {}) {
  const { pipeline, step } = stepOfTask(p, t);
  const r = resolveModel({
    agent: t.agent,
    step,
    config: p.cfg.config,
    fm: agentFrontmatter(p.root, t.agent),
    profile,
    context: { specState: p.state.specs[t.spec], taskState: p.state.tasks[t.id], spec: p.specGraph.specs.get(t.spec) },
  });
  return { task: t.id, spec: t.spec, pipeline, step: step?.id ?? null, ...r };
}

/** Problemas de roteamento na config: overrides/papéis de agentes inexistentes e escolhas abaixo do piso. */
export function validateRouting(cfg, agents) {
  const errors = [];
  const warnings = [];
  const models = cfg?.agents?.models;
  for (const k of ['overrides', 'roles']) {
    for (const a of Object.keys(models?.[k] ?? {})) {
      if (agents.size && !agents.has(a)) errors.push({ path: `/agents/models/${k}/${a}`, message: `agente '${a}' não existe em .claude/agents/` });
    }
  }
  for (const a of Object.keys(models?.overrides ?? {})) {
    const r = resolveModel({ agent: a, config: cfg });
    for (const w of r.warnings) warnings.push({ path: `/agents/models/overrides/${a}`, message: w });
  }
  for (const [name, steps] of Object.entries(cfg?.pipelines ?? {})) {
    if (!Array.isArray(steps)) continue;
    steps.forEach((s, i) => {
      if (!s?.model || typeof s.agent !== 'string') return;
      const r = resolveModel({ agent: s.agent, step: s, config: cfg });
      for (const w of r.warnings) warnings.push({ path: `/pipelines/${name}/${i}/model`, message: w });
    });
  }
  return { errors, warnings };
}
