// Checagens de skills (spec Agent Skills, referências, evals, atribuição) e de agentes
// (ferramentas válidas, mínimo privilégio, auditores sem escrita).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listSkillDirs, validateSkill, hasEvals, strictYamlIssues, frontmatterOf } from '../skills.mjs';
import { parseYaml } from '../yaml.mjs';
import { findOnPath } from '../files.mjs';

// Ferramentas conhecidas do Claude Code (nomes aceitos em tools/disallowedTools de subagentes).
export const KNOWN_TOOLS = new Set([
  'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep', 'Bash', 'PowerShell',
  'WebFetch', 'WebSearch', 'Agent', 'Task', 'TodoWrite', 'Skill', 'LSP', 'BashOutput', 'KillShell',
  'KillBash', 'ExitPlanMode', 'AskUserQuestion', 'ToolSearch', 'Monitor',
]);
export const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
export const PERMISSION_MODES = new Set(['default', 'manual', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan']);
export const MEMORY_SCOPES = new Set(['user', 'project', 'local']);
// Auditores: relatam e bloqueiam, não alteram o que auditam.
export const AUDITOR_AGENTS = new Set(['agente-spec-guardian', 'agente-arquiteto-guardian', 'agente-revisor-ux']);

function toolList(v) {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function toolBase(t) {
  return t.replace(/\(.*\)$/, '');
}

export function readAgents(root) {
  const dir = join(root, '.claude', 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort().map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let fm = null, parseError = null;
    if (m) { try { fm = parseYaml(m[1]); } catch (e) { parseError = e.message; } }
    return { file: `.claude/agents/${f}`, base: f.slice(0, -3), fm, parseError, body: text };
  });
}

export function validateAgent(a, { skillNames }) {
  const errors = [];
  const warnings = [];
  if (a.parseError) return { errors: [`frontmatter inválido: ${a.parseError}`], warnings };
  if (!a.fm) return { errors: ['sem frontmatter'], warnings };
  for (const k of strictYamlIssues(frontmatterOf(a.body))) errors.push(`'${k}' com ': ' sem aspas — YAML inválido para parsers padrão`);
  if (a.fm.name !== a.base) errors.push(`'name' (${a.fm.name}) difere do arquivo`);
  if (!a.fm.description) errors.push("falta 'description'");
  const tools = toolList(a.fm.tools);
  const denied = toolList(a.fm.disallowedTools) ?? [];
  for (const t of [...(tools ?? []), ...denied]) {
    const b = toolBase(t);
    if (!KNOWN_TOOLS.has(b) && !b.startsWith('mcp__')) warnings.push(`ferramenta desconhecida '${t}'`);
  }
  if (a.fm.permissionMode !== undefined && !PERMISSION_MODES.has(a.fm.permissionMode)) errors.push(`permissionMode inválido '${a.fm.permissionMode}'`);
  if (a.fm.permissionMode === 'bypassPermissions') errors.push('permissionMode bypassPermissions não é permitido em agentes do kit');
  if (a.fm.memory !== undefined && !MEMORY_SCOPES.has(a.fm.memory)) errors.push(`memory inválido '${a.fm.memory}' (user|project|local)`);
  for (const s of toolList(a.fm.skills) ?? []) {
    if (!skillNames.active.has(s)) {
      if (skillNames.packs.has(s)) warnings.push(`skill pré-carregada '${s}' está num pack inativo (ative o pack)`);
      else errors.push(`skill pré-carregada '${s}' não existe`);
    }
  }
  const effective = tools === null ? null : tools.map(toolBase).filter((t) => !denied.map(toolBase).includes(t));
  if (AUDITOR_AGENTS.has(a.base) || /-guardian$/.test(a.base)) {
    if (effective === null && !WRITE_TOOLS.every((w) => denied.map(toolBase).includes(w))) {
      errors.push('auditor sem `tools` herda todas as ferramentas, inclusive Edit/Write — declare ferramentas somente leitura');
    } else if (effective && effective.some((t) => WRITE_TOOLS.includes(t))) {
      errors.push(`auditor com ferramenta de escrita: ${effective.filter((t) => WRITE_TOOLS.includes(t)).join(', ')}`);
    }
  } else if (tools === null) {
    warnings.push('sem `tools`: herda todas as ferramentas (declare o mínimo necessário)');
  }
  return { errors, warnings, tools: effective };
}

export function checkAgents(report, p) {
  const G = 'Agentes';
  const agents = readAgents(p.root);
  if (!agents.length) { report.skip(G, 'agents', 'sem .claude/agents/ neste projeto (modo plugin?)'); return; }
  const skills = listSkillDirs(p.root);
  const skillNames = { active: new Set(skills.filter((s) => s.active).map((s) => s.name)), packs: new Set(skills.filter((s) => !s.active).map((s) => s.name)) };
  const errors = [];
  const warnings = [];
  const auditorErrors = [];
  for (const a of agents) {
    const v = validateAgent(a, { skillNames });
    for (const e of v.errors) (/auditor/.test(e) ? auditorErrors : errors).push({ path: a.file, message: e });
    for (const w of v.warnings) warnings.push({ path: a.file, message: w });
  }
  report.fromIssues(G, 'agents.valid', `${agents.length} definição(ões) válidas (ferramentas, permissionMode, skills, memory)`, errors, warnings);
  report.fromIssues(G, 'agents.auditors-read-only', 'auditores (guardiões, revisor) somente leitura', auditorErrors);
}

export function checkSkills(report, p, { ownedPredicate = () => false } = {}) {
  const G = 'Skills';
  const dirs = listSkillDirs(p.root);
  const errors = [];
  const warnings = [];
  let ext = 0;
  for (const d of dirs) {
    const owned = ownedPredicate(d) || isCoreSkill(d.dir);
    const v = validateSkill(d.dir, { owned, root: p.root });
    const where = d.pack ? `_packs/${d.pack}/${d.name}` : d.name;
    if (owned && !hasEvals(d.dir)) errors.push({ path: where, message: 'skill núcleo sem evals/evals.json' });
    for (const e of v.errors) errors.push({ path: where, message: e });
    for (const w of v.warnings) warnings.push({ path: where, message: w });
    if (v.info.length) ext++;
  }
  const active = dirs.filter((d) => d.active).length;
  report.fromIssues(G, 'skills.spec', `${dirs.length} skill(s) (${active} ativas, ${dirs.length - active} em packs inativos) conformes à spec Agent Skills`, errors, warnings);
  if (ext) report.pass(G, 'skills.claude-ext', `${ext} skill(s) usam extensões do Claude Code (documentadas; não portáveis)`);
  // Atribuição dos packs vendorizados
  const packsDir = join(p.root, '.claude', 'skills', '_packs');
  if (existsSync(packsDir)) {
    const missing = [];
    for (const pack of readdirSync(packsDir)) {
      const files = [];
      const walk = (dir, depth) => {
        if (depth > 2) return;
        for (const f of readdirSync(dir, { withFileTypes: true })) {
          if (f.isDirectory()) walk(join(dir, f.name), depth + 1);
          else files.push(f.name);
        }
      };
      walk(join(packsDir, pack), 0);
      const hasAttr = files.some((f) => /^ATTRIBUTION/i.test(f));
      const hasLic = files.some((f) => /^LICENSE/i.test(f));
      if (!hasAttr || !hasLic) missing.push(`${pack}: ${!hasAttr ? 'sem ATTRIBUTION ' : ''}${!hasLic ? 'sem LICENSE' : ''}`.trim());
    }
    report.fromIssues(G, 'skills.attribution', 'packs vendorizados com ATTRIBUTION e LICENSE', missing);
  }
}

/** Skill núcleo do kit: `metadata.sdd-core: "true"` no SKILL.md. */
export function isCoreSkill(dir) {
  try {
    const block = frontmatterOf(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    return /^\s+sdd-core:\s*["']?true["']?\s*$/m.test(block ?? '');
  } catch { return false; }
}

/** Comandos (.claude/commands): description presente e YAML válido para parsers padrão. */
export function checkCommands(report, p) {
  const G = 'Comandos';
  const dir = join(p.root, '.claude', 'commands');
  if (!existsSync(dir)) { report.skip(G, 'commands', 'sem .claude/commands/'); return; }
  const errors = [];
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
    n++;
    const block = frontmatterOf(readFileSync(join(dir, f), 'utf8'));
    if (!block || !/^description:/m.test(block)) errors.push({ path: `.claude/commands/${f}`, message: "sem 'description' no frontmatter" });
    for (const k of strictYamlIssues(block)) errors.push({ path: `.claude/commands/${f}`, message: `'${k}' com ': ' sem aspas — YAML inválido para parsers padrão` });
  }
  report.fromIssues(G, 'commands.valid', `${n} comando(s) com frontmatter válido`, errors);
}

/** Scanner externo de skills (Cisco skill-scanner): opcional; ausente = NOT_RUN, nunca PASS. */
export function checkSkillScanner(report) {
  const G = 'Scanners';
  const bin = findOnPath('skill-scanner');
  if (!bin) {
    report.notRun(G, 'scanner.skill-scanner', 'Cisco skill-scanner não instalado — scan externo de skills NÃO executado', ['instale com `uv pip install cisco-ai-skill-scanner` e rode `node scripts/sdd.mjs skills scan`']);
    return;
  }
  report.notRun(G, 'scanner.skill-scanner', `skill-scanner encontrado (${bin}) — rode \`node scripts/sdd.mjs skills scan\` para executar`);
}

/** Supply chain: skills.lock.json do motor (hashes, licença, confiança), packs ativos e externas. */
export async function checkSupplyChain(report, p) {
  const G = 'Supply chain de skills';
  const { verifyEngineLock, activePacks, readLock, projectLockPath, hashDir } = await import('../supply.mjs');
  const r = verifyEngineLock();
  report.fromIssues(G, 'supply.lock', 'packs e skills núcleo batem com o skills.lock.json (hash, licença, confiança)', r.errors, r.warnings);
  const active = activePacks(p.root);
  const modified = active.flatMap((a) => a.modified.map((s) => `${a.pack}/${s}`));
  if (active.length) report.add(G, 'supply.active', modified.length ? 'warn' : 'pass', modified.length ? `cópias ativas alteradas localmente: ${modified.join(', ')}` : `packs ativos íntegros: ${active.map((a) => `${a.pack} (${a.skills}/${a.total})`).join(', ')}`);
  // Packs habilitados como plugins do marketplace do kit (modo plugin): versionados pelo próprio plugin.
  const PLUGIN_OF = { arch: 'sdd-architecture', ds: 'sdd-design-system', uiux: 'sdd-uiux', ai: 'sdd-ai' };
  let packPlugins = [];
  try {
    const settings = JSON.parse(readFileSync(join(p.root, '.claude', 'settings.json'), 'utf8'));
    packPlugins = Object.entries(settings.enabledPlugins ?? {}).filter(([k, v]) => v && /^sdd-(architecture|design-system|uiux|ai)@/.test(k)).map(([k]) => k);
    if (packPlugins.length) report.pass(G, 'supply.pack-plugins', `packs habilitados como plugin: ${packPlugins.join(', ')}`);
    const both = packPlugins.filter((k) => active.some((a) => k.startsWith(`${PLUGIN_OF[a.pack]}@`)));
    if (both.length) report.warn(G, 'supply.pack-duplicate', `pack ativo por cópia E como plugin (skills em dobro): ${both.join(', ')}`);
  } catch { /* sem settings.json: nada a relatar */ }
  // Packs declarados na config (integrations.packs) × ativos (cópia ou plugin).
  const declared = p.cfg?.config?.integrations?.packs ?? [];
  const isOn = (pack) => active.some((a) => a.pack === pack) || packPlugins.some((k) => k.startsWith(`${PLUGIN_OF[pack]}@`));
  if (declared.length) {
    const off = declared.filter((pk) => !isOn(pk));
    report.add(G, 'supply.packs-declared', off.length ? 'warn' : 'pass', off.length
      ? `packs declarados em integrations.packs mas não ativos: ${off.join(', ')} — \`sdd pack activate <pack>\` ou /plugin install ${off.map((o) => `${PLUGIN_OF[o]}@sdd-kit`).join(' ')}`
      : `packs declarados ativos: ${declared.join(', ')}`);
  }
  // Produto usa IA (dependências) sem o pack ai declarado: sugestão, nunca falha.
  if (p.cfg?.config) {
    const { detectAi } = await import('../ai-detect.mjs');
    const ai = detectAi(p.root);
    if (ai.uses_ai && !declared.includes('ai') && !isOn('ai')) report.warn(G, 'supply.ai-pack', `o produto usa IA (${Object.keys(ai.signals).join(', ')}) e o pack ai não está declarado — avalie \`sdd ai detect\` e o pack ai (discovery de IA, evals, segurança)`);
  }
  let lock = null;
  try { lock = readLock(projectLockPath(p.root)); } catch (e) { report.fail(G, 'supply.project', e.message); return; }
  const ext = Object.entries(lock?.external ?? {});
  if (!ext.length) return;
  const errors = [];
  const warnings = [];
  for (const [name, e] of ext) {
    const dir = `${p.root}/${e.location}`;
    try { if (hashDir(dir) !== e.hash) errors.push(`${name}: conteúdo difere do hash ingerido`); } catch { errors.push(`${name}: ${e.location} não existe`); }
    if (e.trust === 'quarantine') warnings.push(`${name}: em quarentena (sem revisão humana)`);
    if (e.trust === 'rejected') warnings.push(`${name}: rejeitada — não ative`);
  }
  report.fromIssues(G, 'supply.project', `${ext.length} skill(s) externa(s) do projeto com proveniência registrada`, errors, warnings);
}

/** Snyk Agent Scan: opcional, com consentimento. Mostra o último resultado salvo ou NOT_RUN. */
export async function checkAgentScan(report, p) {
  const G = 'Scanners';
  const { lastAgentScan } = await import('../../commands/scan.mjs');
  const last = lastAgentScan(p.root);
  if (!last) {
    report.notRun(G, 'scanner.agent-scan', 'Snyk Agent Scan nunca executado neste projeto (opcional; exige consentimento e SNYK_TOKEN)', ['`sdd scan agents --consent` num container descartável — ver docs/security/agent-scan.md']);
    return;
  }
  report.add(G, 'scanner.agent-scan', last.status === 'pass' ? 'pass' : 'fail', `Snyk Agent Scan ${last.status.toUpperCase()} em ${last.ran_at} (${last.file})`);
}
