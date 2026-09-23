// `sdd models <list|resolve>` — qual modelo cada agente usa, e por quê (policies/model-routing.json).
import { UsageError, ICON } from '../lib/cli.mjs';
import { loadProject } from '../lib/project.mjs';
import { resolveTaskId } from '../lib/specs.mjs';
import { resolveModel, resolveTask, agentFrontmatter, routingPolicy } from '../lib/models.mjs';

export async function modelsCommand(args) {
  const [sub] = args.positional;
  if (sub === 'list' || sub === undefined) return list(args);
  if (sub === 'resolve') return resolve(args);
  throw new UsageError(`uso: models <list|resolve> (recebido: ${sub})`);
}

const SOURCE = { policy: 'política', config: 'config', pipeline: 'etapa' };
const fmt = (r) => `${r.model}${r.effort ? ` · ${r.effort}` : ''}`;

function profileOf(flags) {
  if (flags.profile === undefined) return undefined;
  const p = String(flags.profile);
  if (!routingPolicy().profiles[p]) throw new UsageError(`--profile inválido '${p}' (${Object.keys(routingPolicy().profiles).join(' | ')})`);
  return p;
}

function list({ root, flags }) {
  const p = loadProject(root);
  const profile = profileOf(flags);
  const config = p.cfg.config;
  const agents = [...p.agents].sort().map((agent) => {
    const fm = agentFrontmatter(root, agent) ?? {};
    const r = resolveModel({ agent, config, fm, profile });
    return { ...r, frontmatter: { model: fm.model ?? null, effort: fm.effort ?? null } };
  });
  const steps = [];
  for (const [pipeline, list] of Object.entries(config?.pipelines ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      if (!s?.agent) continue;
      const r = resolveModel({ agent: s.agent, step: s, config, fm: agentFrontmatter(root, s.agent), profile });
      steps.push({ pipeline, step: s.id, ...r });
    }
  }
  const profileName = agents[0]?.profile ?? profile ?? routingPolicy().default_profile;
  if (flags.json) { console.log(JSON.stringify({ profile: profileName, agents, steps }, null, 2)); return 0; }
  console.log(`perfil: ${profileName}  (policies/model-routing.json · agents.models da config)\n`);
  for (const r of agents) {
    const drift = r.frontmatter.model && r.frontmatter.model !== r.model ? `  ${ICON.warn} frontmatter: ${r.frontmatter.model}` : '';
    console.log(`${r.agent.padEnd(28)} ${r.role.padEnd(8)} ${(r.tier ?? '—').padEnd(9)} ${fmt(r).padEnd(18)} ${SOURCE[r.source.model]}${drift}`);
  }
  if (steps.length) {
    console.log('\netapas das pipelines:');
    for (const s of steps) console.log(`  ${`${s.pipeline}/${s.step}`.padEnd(28)} @${s.agent.padEnd(27)} ${fmt(s).padEnd(18)} ${SOURCE[s.source.model]}`);
  }
  for (const w of [...agents, ...steps].flatMap((r) => r.warnings)) console.log(`${ICON.warn} ${w}`);
  return 0;
}

function resolve({ root, flags }) {
  const p = loadProject(root);
  const profile = profileOf(flags);
  let r;
  if (flags.task) {
    const matches = resolveTaskId(String(flags.task), [...p.taskGraph.tasks.values()]);
    if (!matches.length) { console.log(`${ICON.error} tarefa '${flags.task}' não encontrada`); return 1; }
    if (matches.length > 1) { console.log(`${ICON.warn} '${flags.task}' é ambígua: ${matches.map((t) => t.id).join(', ')}`); return 1; }
    r = resolveTask(p, matches[0], { profile });
  } else if (flags.agent) {
    const agent = String(flags.agent).replace(/^@/, '');
    if (p.agents.size && !p.agents.has(agent)) { console.log(`${ICON.error} agente '${agent}' não existe em .claude/agents/`); return 1; }
    let step = null;
    if (flags.step) {
      const steps = p.cfg.config?.pipelines?.[String(flags.pipeline ?? '')];
      if (!Array.isArray(steps)) throw new UsageError('--step exige --pipeline <nome> existente na config');
      step = steps.find((s) => s.id === String(flags.step));
      if (!step) throw new UsageError(`etapa '${flags.step}' não existe na pipeline '${flags.pipeline}'`);
    }
    r = resolveModel({ agent, step, config: p.cfg.config, fm: agentFrontmatter(root, agent), profile });
  } else throw new UsageError('uso: models resolve --task <T-NNN | SPEC/T-NNN> | --agent <agente> [--pipeline p --step s] [--profile p]');
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`${r.task ? `${r.task} → ` : ''}@${r.agent}: ${fmt(r)}${r.tier ? ` (nível ${r.tier})` : ''}`);
  console.log(`  modelo: ${SOURCE[r.source.model]} · esforço: ${r.source.effort ? SOURCE[r.source.effort] : '—'} · perfil ${r.profile}`);
  for (const why of r.reasons) console.log(`  ${ICON.info} ${why}`);
  for (const n of r.notes) console.log(`  ${ICON.info} ${n}`);
  for (const w of r.warnings) console.log(`  ${ICON.warn} ${w}`);
  return 0;
}
