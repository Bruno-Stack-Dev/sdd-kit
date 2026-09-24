// Configuração do dashboard/status: defaults documentados + bloco opcional `dashboard:` da config.
// Nada aqui muda o comportamento do workflow: são só pesos de métrica, limiares de saúde e UI.
//
// Por que estes pesos (docs/dashboard.md, "Progresso"):
//   implementation 0.45 — tarefas concluídas por peso: o sinal mais granular e já inclui as etapas
//                         de teste e de guardião das pipelines;
//   requirements   0.25 — requisitos (RF/RNF/CA) de specs aprovadas pelo guardião com evidência;
//   tests          0.15 — specs com a última suíte verde (evita contar duas vezes o que as tarefas
//                         de teste já contam);
//   security       0.10 — só quando há checagens de segurança declaradas/observadas; senão sai do
//                         cálculo e os demais pesos são renormalizados;
//   documentation  0.05 — completude documental das specs (frontmatter coerente, plano, tarefas).

export const DEFAULT_WEIGHTS = Object.freeze({ implementation: 0.45, requirements: 0.25, tests: 0.15, security: 0.10, documentation: 0.05 });

export const DEFAULT_HEALTH = Object.freeze({
  context_warning: 75,
  context_critical: 90,
  retry_warning: 3,
  retry_critical: 6,
  tool_failure_warning: 3,
  tool_failure_critical: 10,
  policy_block_warning: 1,
  policy_block_critical: 5,
  loop_repeat: 5,
  task_minutes_warning: 60,
  stale_minutes: 30,
  blocked_tasks_degraded: 3,
  critical_security: 'blocked',
  gate_failure: 'blocked',
});

export const DEFAULT_DASHBOARD = Object.freeze({
  refresh_ms: 1000,
  progress: DEFAULT_WEIGHTS,
  health: DEFAULT_HEALTH,
  events: Object.freeze({ max_displayed: 500 }),
  ui: Object.freeze({ compact: 'auto' }),
});

export const DIMENSIONS = Object.keys(DEFAULT_WEIGHTS);

/**
 * Mescla `config.dashboard` com os defaults. Nunca lança: valor inválido volta ao default e vira
 * aviso (o schema já recusa tipos errados; isto cobre a semântica, ex.: todos os pesos zero).
 * @returns {{ settings: object, warnings: string[] }}
 */
export function resolveDashboardConfig(config) {
  const user = config?.dashboard ?? {};
  const warnings = [];
  const num = (v, def, { min = 0, max = Infinity } = {}, path) => {
    if (v === undefined || v === null) return def;
    if (typeof v !== 'number' || Number.isNaN(v) || v < min || v > max) { warnings.push(`dashboard.${path}: ${JSON.stringify(v)} inválido — usando ${def}`); return def; }
    return v;
  };
  const progress = {};
  for (const d of DIMENSIONS) progress[d] = num(user.progress?.[d], DEFAULT_WEIGHTS[d], { min: 0, max: 1 }, `progress.${d}`);
  if (!Object.values(progress).some((w) => w > 0)) {
    warnings.push('dashboard.progress: todos os pesos são zero — usando os pesos padrão');
    Object.assign(progress, DEFAULT_WEIGHTS);
  }
  const health = {};
  for (const [k, def] of Object.entries(DEFAULT_HEALTH)) {
    if (typeof def === 'number') health[k] = num(user.health?.[k], def, { min: 0 }, `health.${k}`);
    else {
      const v = user.health?.[k];
      health[k] = v === undefined ? def : ['blocked', 'degraded'].includes(v) ? v : (warnings.push(`dashboard.health.${k}: '${v}' inválido (blocked|degraded) — usando ${def}`), def);
    }
  }
  const compact = user.ui?.compact;
  return {
    settings: {
      refresh_ms: num(user.refresh_ms, DEFAULT_DASHBOARD.refresh_ms, { min: 200, max: 60_000 }, 'refresh_ms'),
      progress,
      health,
      events: { max_displayed: num(user.events?.max_displayed, DEFAULT_DASHBOARD.events.max_displayed, { min: 50, max: 20_000 }, 'events.max_displayed') },
      ui: { compact: compact === true || compact === false ? compact : 'auto' },
    },
    warnings,
  };
}
