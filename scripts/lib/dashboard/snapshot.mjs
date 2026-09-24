// State Aggregator: definições (config, specs, tarefas, agentes) + estado (reducer) + atividade
// (índice do trace/eventos) → DashboardSnapshot. Função pura sobre as entradas: a mesma entrada dá o
// mesmo snapshot. Nenhum formatador calcula métrica — todos consomem este objeto.
import { basename } from 'node:path';
import { SPEC_STATUS } from '../specs.mjs';
import { readyTasks, topoOrder } from '../graph.mjs';
import { roleOf, resolveTask } from '../models.mjs';
import {
  taskWeights, implementationProgress, requirementsProgress, testsProgress, securityProgress, documentationProgress,
  overallProgress, progressByPipeline, metric,
} from './metrics/progress.mjs';
import { specGates, currentStage, projectPipeline, deliveryReadiness, requiredGates } from './metrics/gates.mjs';
import { agentHealth, projectHealth } from './metrics/health.mjs';
import { autonomyMetrics } from './metrics/autonomy.mjs';
import { qualitySummary } from './metrics/quality.mjs';
import { securitySummary } from './metrics/security.mjs';
import { parseRequirements, requirementMentions, requirementStatus, adrMentions, adrKey } from './traceability.mjs';

export const SNAPSHOT_VERSION = 1;
const ms = (a, b) => { const x = Date.parse(a), y = typeof b === 'number' ? b : Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) ? Math.max(0, y - x) : null; };
const avg = (sum, n) => (n ? Math.round(sum / n) : null);

/**
 * @param input {
 *   project: visão de bindState (defs + state + statusOf), index: ActivityIndex, registry: agentRegistry(),
 *   git, guards, mcpCfg, evals, adrs, testRefs, secretChecks, agentScan, settings, settingsWarnings,
 *   specTexts: Map(file → texto), logInfo: { invalidDomain, invalidTrace, truncatedTail },
 *   now: epoch ms, demo, scope: { session }, currentSessionId, engine, isSddProject
 * }
 * @returns {import('./types.mjs').DashboardSnapshot}
 */
export function buildSnapshot(input) {
  const { project: p, index, registry, settings, now } = input;
  const th = settings.health;
  const state = p.state;
  const hasState = state.events > 0;
  const config = p.cfg.config;
  const warnings = [...(input.settingsWarnings ?? [])];

  // ---------------------------------------------------------------- tarefas
  const { weights, warnings: wWarn } = taskWeights(p.taskFiles);
  warnings.push(...wWarn);
  const pipelineOfFile = new Map(p.taskFiles.map((f) => [f.file, f.fm?.pipeline ? String(f.fm.pipeline) : null]));
  const defs = [...p.taskGraph.tasks.values()];
  const dependents = new Map();
  for (const d of defs) for (const dep of d.dependsOn) { if (!dependents.has(dep)) dependents.set(dep, []); dependents.get(dep).push(d.id); }
  const depthMemo = new Map();
  const depth = (id, path = new Set()) => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    if (path.has(id)) return 0;
    path.add(id);
    const d = p.taskGraph.tasks.get(id);
    const v = d && d.dependsOn.length ? 1 + Math.max(...d.dependsOn.map((x) => (p.taskGraph.tasks.has(x) ? depth(x, path) : 0))) : 0;
    path.delete(id);
    depthMemo.set(id, v);
    return v;
  };
  const ready = new Set(p.taskGraph.errors.length ? [] : readyTasks(p.taskGraph, p.statusOf).map((t) => t.id));
  const regByName = new Map(registry.map((r) => [r.name, r]));
  const roleFor = (agent) => regByName.get(agent)?.role ?? (() => { try { return roleOf(agent, { config }).role; } catch { return 'build'; } })();
  const specOrder = topoOrder(p.specGraph.adjacency);
  const specRank = new Map(specOrder.map((id, i) => [id, i]));
  const tasks = defs.map((d) => {
    const st = state.tasks[d.id] ?? {};
    const status = p.statusOf(d.id);
    const idx = index.tasks.get(d.id);
    const starts = idx?.starts ?? (st.started ? 1 : 0);
    let model = st.model ?? null, modelSource = st.model ? 'TASK_STARTED' : null, effort = st.effort ?? null;
    if (!model && status === 'in_progress') {
      try { const r = resolveTask(p, d); model = r.model; effort = effort ?? r.effort; modelSource = `política (${r.source.model})`; } catch { /* sem roteamento */ }
    }
    if (!model) { model = regByName.get(d.agent)?.model ?? null; modelSource = model ? 'política (papel)' : null; }
    return {
      id: d.id,
      localId: d.localId,
      spec: d.spec,
      title: d.title,
      agent: d.agent,
      role: roleFor(d.agent),
      status,
      weight: weights.get(d.id) ?? 1,
      deps: d.dependsOn,
      dependents: dependents.get(d.id) ?? [],
      depth: depth(d.id),
      ready: ready.has(d.id),
      pipeline: pipelineOfFile.get(d.file) ?? null,
      file: `${d.file}:${d.line}`,
      requirements: requirementMentions(d.title),
      startedAt: st.started ?? null,
      completedAt: st.completed ?? null,
      durationMs: st.started ? ms(st.started, st.completed ?? (['in_progress', 'blocked'].includes(status) ? now : null)) : null,
      starts,
      retries: Math.max(0, starts - 1),
      reopened: st.reopened ?? 0,
      model,
      modelSource,
      effort,
      wave: st.wave ?? null,
      blockedReason: st.blocked_reason ?? null,
      cancelledReason: st.cancelled_reason ?? null,
      evidence: st.evidence ?? null,
      imported: !!st.imported,
      lastEvent: idx?.lastEvent ?? null,
      files: idx ? [...idx.files] : [],
      toolCalls: idx?.toolCalls ?? 0,
    };
  }).sort((a, b) => ((specRank.get(a.spec) ?? 1e9) - (specRank.get(b.spec) ?? 1e9)) || a.depth - b.depth || a.id.localeCompare(b.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // ---------------------------------------------------------------- specs, requisitos, ADRs, gates
  const adrByKey = new Map((input.adrs ?? []).filter((a) => a.id).map((a) => [adrKey(a.id), a]));
  const required = requiredGates(config);
  const gatesList = Object.values(state.gates ?? {});
  const specs = p.specs.filter((s) => s.id).sort((a, b) => (specRank.get(a.id) ?? 1e9) - (specRank.get(b.id) ?? 1e9)).map((s) => {
    const st = state.specs[s.id] ?? null;
    const text = input.specTexts?.get(s.file) ?? '';
    const specTasks = tasks.filter((t) => t.spec === s.id);
    const reqStatus = requirementStatus(st, hasState);
    const requirements = parseRequirements(text).map((r) => {
      const linked = specTasks.filter((t) => t.requirements.includes(r.id)).map((t) => t.id);
      return {
        ...r,
        spec: s.id,
        file: s.file,
        status: reqStatus.status,
        statusSource: reqStatus.source,
        tasks: linked,
        testRefs: input.testRefs?.refs?.get(`${s.id}::${r.id}`) ?? [],
        implementation: [...new Set(linked.flatMap((id) => taskById.get(id)?.files ?? []))],
      };
    });
    const adrs = adrMentions(text).map((id) => {
      const a = adrByKey.get(adrKey(id));
      return { id, exists: !!a, file: a?.file ?? null, title: a?.title ?? null, status: a?.status ?? null };
    });
    const hasPlan = p.plans.some((pl) => pl.spec === s.id);
    const tasksFile = p.taskFiles.some((f) => f.spec === s.id);
    const fmOk = !!s.fm && SPEC_STATUS.includes(s.status) && Number(s.cas) === s.caCount;
    const gates = specGates({
      spec: s, st, tasks: specTasks, lastTest: state.tests?.by_spec?.[s.id] ?? null, suites: index.tests.get(s.id), gates: gatesList, required, hasPlan,
    });
    const verified = requirements.filter((r) => r.status === 'verified').length;
    return {
      id: s.id,
      title: s.fm?.titulo ? String(s.fm.titulo) : null,
      file: s.file,
      kind: s.kind,
      state: st?.status ?? null,
      fmStatus: s.status,
      imported: !!st?.imported,
      dependsOn: s.dependsOn,
      pipeline: p.taskFiles.find((f) => f.spec === s.id)?.fm?.pipeline ?? null,
      requirements,
      coverage: metric(verified, requirements.length, reqStatus.source),
      adrs,
      hasPlan,
      tasksFile,
      docScore: (Number(fmOk) + Number(hasPlan) + Number(tasksFile)) / 3,
      taskIds: specTasks.map((t) => t.id),
      tasks: { total: specTasks.filter((t) => t.status !== 'cancelled').length, done: specTasks.filter((t) => t.status === 'completed').length },
      gates,
      currentGate: currentStage(gates),
      rejections: st?.rejections ?? 0,
      lastRejection: st?.last_rejection ?? null,
      approvalEvidence: st?.approval_evidence ?? null,
    };
  });
  const activeSpecs = specs.filter((s) => s.state !== 'archived');

  // ---------------------------------------------------------------- qualidade, segurança, progresso
  const quality = qualitySummary({ specs, state, testsIndex: index.tests, evals: input.evals ?? [] });
  const security = securitySummary({ guards: input.guards, secretChecks: input.secretChecks, agentScan: input.agentScan, config, gates: state.gates, policy: index.policy, tracked: input.git?.available !== false });
  const dimensions = {
    implementation: implementationProgress(tasks),
    requirements: requirementsProgress(specs, hasState),
    tests: testsProgress(quality, activeSpecs.length),
    security: securityProgress(security),
    documentation: documentationProgress(specs),
  };
  const progress = { overall: overallProgress(dimensions, settings.progress), dimensions, byPipeline: progressByPipeline(tasks) };
  const pipeline = projectPipeline(specs);
  const delivery = deliveryReadiness({ specs, tasks, state, hasState, truncated: input.logInfo?.truncatedTail, criticalSecurity: security.findings.critical, pipeline });

  // ---------------------------------------------------------------- sessões
  const sessionFinished = (id) => state.sessions?.[id]?.finished ?? index.sessions.get(id)?.finished ?? null;
  const sessionIds = new Set([...Object.keys(state.sessions ?? {}), ...index.sessions.keys()]);
  const sessions = [...sessionIds].map((id) => {
    const a = index.sessions.get(id);
    const started = state.sessions?.[id]?.started ?? a?.started ?? a?.first ?? null;
    const finished = sessionFinished(id);
    return {
      id,
      status: finished ? 'finished' : started ? 'active' : 'unknown',
      started,
      finished,
      durationMs: started ? ms(started, finished ?? now) : null,
      lastActivity: a?.last ?? null,
      events: a?.events ?? 0,
      agentsSpawned: a ? a.agents.size : 0,
      tasksTouched: a ? a.tasks.size : 0,
      filesChanged: a ? a.files.size : 0,
    };
  }).sort((x, y) => String(y.started ?? '').localeCompare(String(x.started ?? '')));
  const currentId = input.scope?.session ?? (input.currentSessionId && sessionIds.has(input.currentSessionId) ? input.currentSessionId : sessions[0]?.id ?? null);
  const session = sessions.find((s) => s.id === currentId) ?? null;

  // ---------------------------------------------------------------- agentes
  const names = new Set(registry.map((r) => r.name));
  const extra = [...new Set([...index.agents.keys(), ...tasks.map((t) => t.agent)])].filter((n) => n && !names.has(n));
  const allAgents = [...registry, ...extra.map((name) => ({ name, origin: 'observado', description: '(sem definição em .claude/agents/)', tools: [], role: roleFor(name), roleSource: 'inferred', model: null, effort: null, modelSource: '—', permissions: [] }))];
  const openSession = (sid) => sid !== '-' && !sessionFinished(sid);
  const agents = allAgents.map((reg) => {
    const x = index.agents.get(reg.name);
    const mine = tasks.filter((t) => t.agent === reg.name);
    const inProg = mine.filter((t) => t.status === 'in_progress');
    const blocked = mine.filter((t) => t.status === 'blocked');
    const readyMine = mine.filter((t) => t.ready);
    const waiting = mine.filter((t) => t.status === 'pending' && !t.ready);
    const liveSpawn = x ? [...x.live.entries()].filter(([sid]) => openSession(sid)).map(([, v]) => v.since).sort()[0] ?? null : null;
    const idleMin = x?.lastTs ? (ms(x.lastTs, now) ?? 0) / 60000 : null;
    const stale = !!liveSpawn && idleMin !== null && idleMin >= th.stale_minutes;
    const live = !!liveSpawn && !stale;
    let status, statusReason;
    if (live && !inProg.length && blocked.length) { status = 'blocked'; statusReason = `subagente ativo, mas a tarefa está bloqueada: ${blocked.map((t) => t.id).join(', ')}`; }
    else if (live) { status = 'working'; statusReason = inProg.length ? `subagente ativo em ${inProg[0].id}` : 'subagente ativo sem tarefa registrada'; }
    else if (inProg.length) { status = 'assigned'; statusReason = `${inProg.length} tarefa(s) in_progress${stale ? ' (subagente sem atividade recente)' : ' — nenhum subagente ativo observado'}`; }
    else if (blocked.length) { status = 'blocked'; statusReason = `bloqueada: ${blocked.map((t) => t.id).join(', ')}`; }
    else if (readyMine.length) { status = 'ready'; statusReason = `${readyMine.length} tarefa(s) pronta(s) para começar`; }
    else if (waiting.length) { status = 'waiting'; statusReason = `${waiting.length} tarefa(s) aguardando dependências`; }
    else { status = 'idle'; statusReason = mine.length ? 'todas as tarefas concluídas' : 'sem tarefas atribuídas'; }
    const cur = inProg[0] ?? null;
    const curSpec = cur ? specs.find((s) => s.id === cur.spec) : null;
    const context = x?.context ? { available: true, used: x.context.used, limit: x.context.limit, percent: Math.round((x.context.used / x.context.limit) * 1000) / 10, source: 'trace (atributos context.*)' } : { available: false };
    const metrics = {
      toolCalls: x ? (x.called > 0 ? x.called : x.completed) : 0,
      toolFailures: x?.failures ?? 0,
      filesTouched: x?.files.size ?? 0,
      retries: mine.reduce((s, t) => s + t.retries, 0),
      policyBlocks: x?.deny ?? 0,
      policyAsks: x?.ask ?? 0,
      maxRepeat: x?.maxRepeat ?? 0,
    };
    const curTest = cur && state.tests?.by_spec?.[cur.spec]?.result === 'failed' ? cur.spec : null;
    const health = agentHealth({
      observed: !!x || mine.length > 0,
      metrics,
      context,
      blockedTasks: blocked.map((t) => t.id),
      failingTest: curTest,
      rejections: curSpec?.rejections ?? 0,
      taskMinutes: cur?.startedAt ? (ms(cur.startedAt, now) ?? 0) / 60000 : null,
      staleMinutes: stale ? idleMin : null,
    }, th);
    return {
      name: reg.name,
      origin: reg.origin,
      file: reg.file ?? null,
      description: reg.description,
      role: reg.role,
      roleSource: reg.roleSource,
      tools: reg.tools,
      model: cur?.model ?? reg.model,
      modelSource: cur?.model ? cur.modelSource : reg.modelSource,
      effort: cur?.effort ?? reg.effort,
      status,
      statusReason,
      live,
      health,
      currentTask: cur ? { id: cur.id, title: cur.title, spec: cur.spec, specTitle: curSpec?.title ?? null, wave: cur.wave } : null,
      instruction: cur ? `${cur.title} — ${cur.spec}${curSpec?.title ? ` (${curSpec.title})` : ''}` : null,
      runtimeMs: live ? ms(liveSpawn, now) : cur?.startedAt ? ms(cur.startedAt, now) : null,
      context,
      metrics,
      tasks: { total: mine.length, completed: mine.filter((t) => t.status === 'completed').length, inProgress: inProg.length, blocked: blocked.length, ready: readyMine.length },
      permissions: reg.permissions,
      timeline: x ? x.timeline.toArray() : [],
      lastActivity: x?.lastTs ?? null,
      spawned: x?.spawned ?? 0,
    };
  }).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name));

  // ---------------------------------------------------------------- ferramentas, MCP, LSP, arquivos
  const tools = [...index.tools.entries()].map(([name, t]) => ({ name, calls: t.called > 0 ? t.called : t.completed, completed: t.completed, failures: t.failures, avgMs: avg(t.durSum, t.durCount), lastTs: t.lastTs, agents: [...t.agents].sort() })).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const mcpCfg = input.mcpCfg ?? { servers: [], errors: [], warnings: [] };
  const mcpNames = new Set([...mcpCfg.servers.map((s) => s.name), ...index.mcp.keys()]);
  const mcpServers = [...mcpNames].sort().map((name) => {
    const c = mcpCfg.servers.find((s) => s.name === name);
    const m = index.mcp.get(name);
    const calls = m ? Math.max(m.called, m.completed) : 0;
    return {
      name,
      configured: !!c,
      allowlisted: c ? c.allowlisted : null,
      status: !c ? 'observed' : calls ? 'active' : 'unused',
      calls,
      errors: m?.failures ?? 0,
      avgMs: m ? avg(m.durSum, m.durCount) : null,
      lastTs: m?.lastTs ?? null,
      agents: m ? [...m.agents].sort() : [],
      tools: m ? [...m.tools].sort() : [],
    };
  });
  const lspOps = [...index.lsp.entries()].map(([op, l]) => ({ operation: op, calls: Math.max(l.called, l.completed), failures: l.failures, avgMs: avg(l.durSum, l.durCount) })).sort((a, b) => b.calls - a.calls);
  const files = [...index.files.entries()].map(([path, f]) => ({ path, modifications: f.modified, reads: f.read, tasks: [...f.tasks].sort(), agents: [...f.agents].sort(), lastTs: f.lastTs })).sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs))).slice(0, 500);

  // ---------------------------------------------------------------- saúde do projeto
  const blockedGateNames = gatesList.filter((g) => g.status === 'blocked').map((g) => `${g.gate}${g.spec ? `@${g.spec}` : ''}`);
  const drift = defs.filter((t) => state.tasks[t.id] && t.checkbox !== state.tasks[t.id].status).length;
  const health = projectHealth({
    isSddProject: input.isSddProject,
    truncated: !!input.logInfo?.truncatedTail,
    blockedGates: blockedGateNames,
    criticalSecurity: security.findings.critical,
    configErrors: p.cfg.errors.length,
    graphErrors: p.taskGraph.errors.length + p.specGraph.errors.length,
    anomalies: state.anomalies.length,
    failingTests: activeSpecs.filter((s) => state.tests?.by_spec?.[s.id]?.result === 'failed').map((s) => s.id),
    blockedTasks: tasks.filter((t) => t.status === 'blocked').length,
    agents,
    policyDeny: index.policy.deny,
    rejected: activeSpecs.filter((s) => s.state === 'in_progress' && s.rejections > 0).map((s) => s.id),
    drift,
    invalidLines: (input.logInfo?.invalidDomain ?? 0) + (input.logInfo?.invalidTrace ?? 0),
    configWarnings: (input.settingsWarnings ?? []).length,
    noState: !hasState && specs.length > 0,
  }, th);

  const tasksByStatus = {};
  for (const t of tasks) tasksByStatus[t.status] = (tasksByStatus[t.status] ?? 0) + 1;
  const specsByStatus = {};
  for (const s of specs) { const k = s.state ?? 'sem estado'; specsByStatus[k] = (specsByStatus[k] ?? 0) + 1; }
  const name = config?.project?.name && !/^<.*>$/.test(String(config.project.name)) ? String(config.project.name) : basename(p.root);

  return {
    v: SNAPSHOT_VERSION,
    generatedAt: new Date(now).toISOString(),
    demo: !!input.demo,
    scope: { session: input.scope?.session ?? null },
    project: {
      name,
      root: p.root,
      configSource: p.cfg.source,
      configErrors: p.cfg.errors.length,
      specsDir: p.specsDir,
      engine: !!input.engine,
      isSddProject: !!input.isSddProject,
    },
    git: input.git ?? { available: false, reason: 'não coletado' },
    session,
    sessions,
    counts: {
      specs: specs.length,
      specsByStatus,
      adrs: (input.adrs ?? []).length,
      plans: p.plans.length,
      tasks: tasks.length,
      tasksByStatus,
      tasksReady: ready.size,
      requirements: activeSpecs.reduce((n, s) => n + s.requirements.length, 0),
      requirementsVerified: activeSpecs.reduce((n, s) => n + s.requirements.filter((r) => r.status === 'verified').length, 0),
      requirementsWithTests: activeSpecs.reduce((n, s) => n + s.requirements.filter((r) => r.testRefs.length).length, 0),
    },
    specs,
    tasks,
    adrs: input.adrs ?? [],
    progress,
    agents,
    gates: pipeline,
    delivery,
    health,
    quality,
    security,
    autonomy: autonomyMetrics(index.autonomy),
    tools,
    mcp: { servers: mcpServers, profile: mcpCfg.profile ?? null, errors: mcpCfg.errors ?? [], warnings: mcpCfg.warnings ?? [], available: mcpCfg.available !== false },
    lsp: { enabled: !!config?.integrations?.lsp?.enabled, operations: lspOps, calls: lspOps.reduce((n, o) => n + o.calls, 0), failures: lspOps.reduce((n, o) => n + o.failures, 0) },
    files,
    events: { recent: index.recent.toArray(), total: index.total, bySource: { ...index.bySource }, invalid: (input.logInfo?.invalidDomain ?? 0) + (input.logInfo?.invalidTrace ?? 0), lastTs: index.lastTs },
    state: {
      events: state.events,
      anomalies: state.anomalies.length,
      duplicates: state.duplicates,
      truncatedTail: !!input.logInfo?.truncatedTail,
      invalidDomainLines: input.logInfo?.invalidDomain ?? 0,
      invalidTraceLines: input.logInfo?.invalidTrace ?? 0,
      checkboxDrift: drift,
      graphErrors: [...p.taskGraph.errors, ...p.specGraph.errors].slice(0, 20),
    },
    testReferences: { scanned: input.testRefs?.scanned ?? 0, basis: input.testRefs?.basis ?? 'não executado', truncated: !!input.testRefs?.truncated },
    warnings,
  };
}

const STATUS_RANK = { working: 0, assigned: 1, blocked: 2, ready: 3, waiting: 4, idle: 5 };
