// Contrato JSON de `sdd status --json` (schemas/status.schema.json, schemaVersion 1). Mapeamento
// explícito do snapshot para um formato estável: mudanças internas do snapshot não quebram quem
// consome o JSON (CI, scripts, a futura UI web). Campo novo = aditivo; renomear/remover = major.

export const STATUS_SCHEMA_VERSION = 1;

const dim = (m) => ({ percent: m.percent, done: m.done, total: m.total, available: m.available, source: m.source, ...(m.note ? { note: m.note } : {}) });

/** @param {import('../types.mjs').DashboardSnapshot} s */
export function toStatusJson(s) {
  const tb = s.counts.tasksByStatus;
  const active = s.agents.filter((a) => ['working', 'assigned'].includes(a.status));
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAt: s.generatedAt,
    demo: s.demo,
    project: { name: s.project.name, root: s.project.root, configSource: s.project.configSource, isSddProject: s.project.isSddProject },
    git: s.git.available
      ? { available: true, branch: s.git.branch, head: s.git.head, dirty: s.git.dirty, changedFiles: s.git.changed, ahead: s.git.ahead, behind: s.git.behind }
      : { available: false, reason: s.git.reason ?? null },
    session: s.session ? { id: s.session.id, status: s.session.status, startedAt: s.session.started, durationMs: s.session.durationMs, agentsSpawned: s.session.agentsSpawned, tasksTouched: s.session.tasksTouched, filesChanged: s.session.filesChanged, events: s.session.events } : null,
    health: { status: s.health.status, reasons: s.health.reasons.map((r) => ({ level: r.level, message: r.message, source: r.source })) },
    progress: {
      overall: { percent: s.progress.overall.percent, formula: s.progress.overall.formula, weights: s.progress.overall.weights, used: s.progress.overall.used },
      implementation: dim(s.progress.dimensions.implementation),
      requirements: dim(s.progress.dimensions.requirements),
      tests: dim(s.progress.dimensions.tests),
      security: dim(s.progress.dimensions.security),
      documentation: dim(s.progress.dimensions.documentation),
      byPipeline: s.progress.byPipeline.map((p) => ({ name: p.name, percent: p.percent, done: p.done, total: p.total })),
    },
    requirements: { total: s.counts.requirements, verified: s.counts.requirementsVerified, withTestReferences: s.counts.requirementsWithTests },
    specs: s.specs.map((x) => ({ id: x.id, title: x.title, state: x.state, currentGate: x.currentGate, requirements: x.requirements.length, verified: x.coverage.done, tasks: x.tasks })),
    tasks: {
      total: s.counts.tasks,
      completed: tb.completed ?? 0,
      inProgress: tb.in_progress ?? 0,
      blocked: tb.blocked ?? 0,
      pending: tb.pending ?? 0,
      cancelled: tb.cancelled ?? 0,
      ready: s.counts.tasksReady,
    },
    agents: {
      total: s.agents.length,
      active: active.length,
      items: s.agents.map((a) => ({ name: a.name, status: a.status, health: a.health.status, role: a.role, model: a.model, currentTask: a.currentTask?.id ?? null, context: a.context.available ? { percent: a.context.percent } : null })),
    },
    quality: {
      specsWithTests: s.quality.specsWithTests,
      specsPassing: s.quality.specsPassing,
      specsFailing: s.quality.specsFailing,
      totals: s.quality.totals,
      partialSuites: s.quality.partialSuites,
      suites: s.quality.suites,
      evals: s.quality.evals.map((e) => ({ suite: e.suite, total: e.total, passed: e.passed })),
      failedChecks: s.quality.failedChecks,
    },
    security: {
      sandbox: s.security.guards.sandbox.status,
      hooks: s.security.guards.hooks.status,
      policyEngine: s.security.guards.policy.status,
      trace: s.security.guards.trace.status,
      findings: { critical: s.security.findings.critical, high: s.security.findings.high, medium: s.security.findings.medium, low: s.security.findings.low },
      policyBlocks: s.security.policy.deny,
      policyAsks: s.security.policy.ask,
      scans: s.security.scans.map((x) => ({ id: x.id, name: x.name, status: x.status })),
    },
    gates: { current: s.gates.current, pipeline: s.gates.pipeline.map((p) => ({ name: p.name, status: p.status })) },
    delivery: { status: s.delivery.status, reasons: s.delivery.reasons, checks: s.delivery.checks },
    autonomy: { actions: s.autonomy.actions, autoApproved: s.autonomy.autoApproved, humanApprovals: s.autonomy.humanApprovals, policyBlocked: s.autonomy.policyBlocked, percent: s.autonomy.percent, formula: s.autonomy.formula, source: s.autonomy.source },
    state: { events: s.state.events, anomalies: s.state.anomalies, truncatedTail: s.state.truncatedTail, invalidLines: s.state.invalidDomainLines + s.state.invalidTraceLines, observedEvents: s.events.total },
    warnings: s.warnings,
  };
}
