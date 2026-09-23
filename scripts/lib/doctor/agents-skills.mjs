// Checagens de skills (spec Agent Skills, referências, evals, atribuição) e de agentes
// (ferramentas válidas, mínimo privilégio, auditores sem escrita).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listSkillDirs, validateSkill } from '../skills.mjs';
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
    const v = validateSkill(d.dir, { owned: ownedPredicate(d), root: p.root });
    const where = d.pack ? `_packs/${d.pack}/${d.name}` : d.name;
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
