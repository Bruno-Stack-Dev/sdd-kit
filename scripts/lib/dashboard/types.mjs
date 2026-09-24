// Tipos de domínio do dashboard (JSDoc — o kit é JavaScript sem build; os tipos documentam o
// contrato entre coleta → métricas → snapshot → formatadores/TUI). Nenhum código de runtime aqui.
//
// Regra de ouro: todo número tem origem. Quando uma informação não existe nos dados do SDD Kit, o
// campo é `null` e `available: false` — nunca um valor estimado.

/**
 * Evento observado, normalizado a partir do log de domínio (.sdd/events.jsonl) ou do trace
 * operacional (.sdd/trace/*.jsonl). Sempre sanitizado.
 * @typedef {object} ObservedEvent
 * @property {string} id
 * @property {string} ts                 ISO 8601
 * @property {'domain'|'trace'} source
 * @property {string} name               pontuado: task.started, tool.completed, policy.decision...
 * @property {string} label              TASK_STARTED, FILE_MODIFIED, POLICY_DENY...
 * @property {'lifecycle'|'task'|'spec'|'test'|'gate'|'guardian'|'tool'|'file'|'mcp'|'lsp'|'security'|'other'} category
 * @property {'ok'|'warn'|'error'} status
 * @property {string|null} session
 * @property {string|null} agent
 * @property {string|null} task
 * @property {string|null} spec
 * @property {string|null} gate
 * @property {string} summary            texto curto para listas (sanitizado)
 * @property {number|null} durationMs
 * @property {Record<string, unknown>} attrs
 */

/**
 * @typedef {object} Metric
 * @property {number|null} percent       0–100 ou null quando indisponível
 * @property {number} done
 * @property {number} total
 * @property {boolean} available
 * @property {string} source             de onde veio (arquivo/evento/regra)
 * @property {string} [note]
 */

/**
 * @typedef {object} ProgressState
 * @property {{ percent: number|null, weights: Record<string, number>, used: string[], formula: string }} overall
 * @property {Record<'implementation'|'requirements'|'tests'|'security'|'documentation', Metric>} dimensions
 * @property {{ name: string, percent: number|null, done: number, total: number }[]} byPipeline
 */

/**
 * @typedef {'HEALTHY'|'ATTENTION'|'DEGRADED'|'BLOCKED'|'UNKNOWN'} HealthStatus
 * @typedef {{ level: 'attention'|'degraded'|'blocked'|'unknown', message: string, source: string }} HealthReason
 * @typedef {{ status: HealthStatus, reasons: HealthReason[] }} ProjectHealth
 * @typedef {{ status: HealthStatus, reasons: HealthReason[] }} AgentHealth
 */

/**
 * @typedef {object} RequirementView
 * @property {string} id                 RF-01, RNF-02, CA-03
 * @property {'RF'|'RNF'|'CA'} kind
 * @property {string} text
 * @property {string} spec
 * @property {string} file
 * @property {number} line
 * @property {'verified'|'in_progress'|'pending'|'unknown'} status
 * @property {string} statusSource
 * @property {string[]} tasks            tarefas que citam o ID no título (vínculo explícito)
 * @property {string[]} testRefs         arquivos de teste que citam spec + requisito
 * @property {string[]} implementation   arquivos modificados pelas tarefas vinculadas (trace)
 */

/**
 * @typedef {object} TaskRuntimeState
 * @property {string} id
 * @property {string} localId
 * @property {string} spec
 * @property {string} title
 * @property {string} agent
 * @property {string} role
 * @property {'pending'|'in_progress'|'blocked'|'completed'|'cancelled'|'unknown'} status
 * @property {number} weight
 * @property {string[]} deps
 * @property {string[]} dependents
 * @property {number} depth
 * @property {string|null} pipeline
 * @property {string[]} requirements
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {number|null} durationMs
 * @property {number} starts
 * @property {number} retries
 * @property {string|null} model
 * @property {string|null} modelSource
 * @property {string|null} wave
 * @property {string|null} blockedReason
 * @property {{ ts: string, label: string }|null} lastEvent
 * @property {string[]} files
 */

/**
 * @typedef {object} GateState
 * @property {'SPEC'|'CODE'|'TEST'|'GATES'|'GUARDIAN'|'DELIVERY'} name
 * @property {'passed'|'running'|'pending'|'blocked'|'failed'|'skipped'} status
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {{ name: string, status: string, detail?: string }[]} checks
 * @property {string|null} blockingReason
 * @property {string[]} evidence
 */

/**
 * @typedef {{ status: 'READY'|'NOT_READY'|'BLOCKED'|'UNKNOWN', reasons: string[], checks: { name: string, status: string, detail: string }[] }} DeliveryReadiness
 */

/**
 * @typedef {object} AgentRuntimeState
 * @property {string} name
 * @property {string} description        papel declarado no frontmatter do agente
 * @property {string} role               audit|design|build|verify|review|support (policies/model-routing.json)
 * @property {string[]} tools
 * @property {string|null} model
 * @property {string} modelSource
 * @property {string|null} effort
 * @property {'working'|'assigned'|'ready'|'waiting'|'blocked'|'idle'} status
 * @property {string} statusReason
 * @property {boolean} live              subagente iniciado e não encerrado numa sessão aberta
 * @property {AgentHealth} health
 * @property {{ id: string, title: string, spec: string, specTitle: string|null }|null} currentTask
 * @property {string|null} instruction   objetivo atual (tarefa + spec), nunca raciocínio do modelo
 * @property {number|null} runtimeMs
 * @property {{ available: boolean, used?: number, limit?: number, percent?: number, source?: string }} context
 * @property {{ toolCalls: number, toolFailures: number, filesTouched: number, retries: number, policyBlocks: number, policyAsks: number, maxRepeat: number }} metrics
 * @property {{ decision: 'allow'|'ask'|'deny', label: string, source: string }[]} permissions
 * @property {ObservedEvent[]} timeline
 * @property {string|null} lastActivity
 */

/**
 * Snapshot único, consumido por `sdd status` (texto e JSON), `sdd dashboard` (TUI) e, no futuro,
 * por outras superfícies (web, CI). Gerado por `buildSnapshot`; a UI nunca calcula métricas.
 * @typedef {object} DashboardSnapshot
 * @property {1} v
 * @property {string} generatedAt
 * @property {boolean} demo
 * @property {object} project
 * @property {object} git
 * @property {object|null} session
 * @property {object[]} sessions
 * @property {object} counts
 * @property {object[]} specs
 * @property {TaskRuntimeState[]} tasks
 * @property {ProgressState} progress
 * @property {AgentRuntimeState[]} agents
 * @property {{ stages: string[], pipeline: { name: string, status: string }[], current: { stage: string, spec: string }|null }} gates
 * @property {DeliveryReadiness} delivery
 * @property {ProjectHealth} health
 * @property {object} quality
 * @property {object} security
 * @property {object} autonomy
 * @property {object[]} tools
 * @property {object} mcp
 * @property {object} lsp
 * @property {object[]} files
 * @property {{ recent: ObservedEvent[], total: number, invalid: number, bySource: Record<string, number> }} events
 * @property {object} state
 * @property {string[]} warnings
 */

export {};
