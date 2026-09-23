// Validação de skills contra a especificação aberta Agent Skills (agentskills.io/specification),
// separando o que é da spec, o que é extensão do Claude Code e o que é campo não padronizado.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { parseYaml } from './yaml.mjs';

export const SPEC_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
// Extensões documentadas do Claude Code para SKILL.md (portáveis só para o Claude).
export const CLAUDE_FIELDS = new Set([
  'disable-model-invocation', 'user-invocable', 'argument-hint', 'arguments', 'model', 'effort',
  'context', 'agent', 'paths', 'when_to_use', 'hooks', 'shell',
]);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_BODY_LINES = 500;

function frontmatterBlock(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/**
 * Valores que o parser do kit tolera mas um parser YAML padrão rejeita — escalar simples com ': '
 * ou ' #' no meio (ex.: `description: Faça X: depois Y`). O Claude Code descarta um frontmatter assim
 * e a skill/comando/agente perde nome e descrição. Devolve as chaves problemáticas.
 */
export function strictYamlIssues(block) {
  const issues = [];
  for (const line of String(block ?? '').split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):[ \t]+(.+)$/);
    if (!kv) continue;
    const v = kv[2].trim();
    if (/^["'[{|>]/.test(v)) continue;
    if (v.includes(': ') || / #/.test(v)) issues.push(kv[1]);
  }
  return issues;
}

export function frontmatterOf(text) {
  return frontmatterBlock(text);
}

/** Diretórios de skill: `.claude/skills/<nome>/` (ativas) e `_packs/<pack>/<nome>/` (inativas). */
export function listSkillDirs(root) {
  const base = join(root, '.claude', 'skills');
  const out = [];
  if (!existsSync(base)) return out;
  for (const name of readdirSync(base).sort()) {
    const dir = join(base, name);
    if (name.startsWith('_') || !statSync(dir).isDirectory()) continue;
    out.push({ dir, name, pack: null, active: true });
  }
  const packs = join(base, '_packs');
  if (existsSync(packs)) {
    for (const pack of readdirSync(packs).sort()) {
      const pdir = join(packs, pack);
      if (!statSync(pdir).isDirectory()) continue;
      for (const name of readdirSync(pdir).sort()) {
        const dir = join(pdir, name);
        if (name.startsWith('_') || name.startsWith('.') || !statSync(dir).isDirectory()) continue;
        out.push({ dir, name, pack, active: false });
      }
    }
  }
  return out;
}

/**
 * Valida uma skill. Devolve { name, frontmatter, errors[], warnings[], info[] }.
 * `owned`: skill do próprio kit (campos fora da spec viram erro); vendorizada/gerada → aviso.
 */
export function validateSkill(dir, { owned = false, root = dir } = {}) {
  const res = { dir, name: null, frontmatter: null, errors: [], warnings: [], info: [] };
  const file = join(dir, 'SKILL.md');
  const dirName = dir.split(/[\\/]/).pop();
  if (!existsSync(file)) { res.errors.push('SKILL.md ausente'); return res; }
  const text = readFileSync(file, 'utf8');
  const block = frontmatterBlock(text);
  if (!block) { res.errors.push('sem frontmatter YAML'); return res; }
  for (const k of strictYamlIssues(block)) {
    res.errors.push(`'${k}' tem ': ' ou ' #' sem aspas — YAML inválido para parsers padrão (o Claude Code ignoraria o frontmatter); ponha o valor entre aspas`);
  }
  let fm;
  try { fm = parseYaml(block); } catch (e) { res.errors.push(`frontmatter fora do subconjunto YAML suportado: ${e.message}`); return res; }
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) { res.errors.push('frontmatter não é um mapa'); return res; }
  res.frontmatter = fm;
  res.name = fm.name ?? null;

  const name = fm.name;
  if (typeof name !== 'string' || !name) res.errors.push("falta 'name'");
  else {
    if (name.length > 64) res.errors.push(`'name' com ${name.length} caracteres (máx. 64)`);
    if (!NAME_RE.test(name)) res.errors.push(`'name' fora do padrão Agent Skills (a-z, 0-9, hífens simples, sem hífen nas pontas): '${name}'`);
    if (name.normalize('NFKC') !== dirName.normalize('NFKC')) res.errors.push(`'name' (${name}) difere do diretório '${dirName}'`);
  }
  const desc = fm.description;
  if (typeof desc !== 'string' || !desc.trim()) res.errors.push("falta 'description'");
  else if (desc.length > 1024) res.errors.push(`'description' com ${desc.length} caracteres (máx. 1024 na spec)`);
  if (fm.compatibility !== undefined && (typeof fm.compatibility !== 'string' || fm.compatibility.length > 500)) {
    res.errors.push("'compatibility' deve ser texto de até 500 caracteres");
  }
  if (fm.metadata !== undefined) {
    if (!fm.metadata || typeof fm.metadata !== 'object' || Array.isArray(fm.metadata)) res.errors.push("'metadata' deve ser um mapa");
    else for (const [k, v] of Object.entries(fm.metadata)) if (typeof v !== 'string') res.warnings.push(`metadata.${k} não é texto (a spec pede mapa string→string)`);
  }
  if (fm['allowed-tools'] !== undefined && typeof fm['allowed-tools'] !== 'string') {
    res.warnings.push("'allowed-tools' deveria ser texto separado por espaços (spec)");
  }

  const claude = Object.keys(fm).filter((k) => CLAUDE_FIELDS.has(k));
  const unknown = Object.keys(fm).filter((k) => !SPEC_FIELDS.has(k) && !CLAUDE_FIELDS.has(k));
  if (claude.length) res.info.push(`extensões do Claude Code: ${claude.join(', ')}`);
  if (unknown.length) {
    const msg = `campos fora da spec Agent Skills: ${unknown.join(', ')} (mova para 'metadata')`;
    (owned ? res.errors : res.warnings).push(msg);
  }

  const body = text.slice(text.indexOf('---', 3) + 3);
  const lines = body.split(/\r?\n/).length;
  if (lines > MAX_BODY_LINES) res.warnings.push(`SKILL.md com ${lines} linhas (spec recomenda < ${MAX_BODY_LINES}; mova detalhes para references/)`);

  // references: (campo usado pelos packs) e links relativos para references/, scripts/, assets/.
  const refs = Array.isArray(fm.references) ? fm.references : [];
  for (const r of refs) if (!existsSync(resolve(dir, String(r)))) res.errors.push(`references aponta para '${r}', que não existe`);
  for (const m of body.matchAll(/\]\(((?:\.{1,2}\/|references\/|scripts\/|assets\/|evals\/)[^)\s#]+)\)/g)) {
    if (!existsSync(resolve(dir, m[1]))) (owned ? res.errors : res.warnings).push(`link para '${m[1]}', que não existe`);
  }

  // evals/evals.json (formato do skill-creator)
  const evalsFile = join(dir, 'evals', 'evals.json');
  if (existsSync(evalsFile)) {
    try {
      const ev = JSON.parse(readFileSync(evalsFile, 'utf8'));
      if (ev.skill_name !== name) res.errors.push(`evals/evals.json: skill_name '${ev.skill_name}' ≠ '${name}'`);
      if (!Array.isArray(ev.evals) || !ev.evals.length) res.errors.push('evals/evals.json sem casos');
      else ev.evals.forEach((c, i) => {
        if (c.id === undefined || typeof c.prompt !== 'string' || typeof c.expected_output !== 'string') {
          res.errors.push(`evals/evals.json: caso ${i} precisa de id, prompt e expected_output`);
        }
      });
    } catch (e) { res.errors.push(`evals/evals.json inválido: ${e.message}`); }
  }
  res.relative = relative(root, dir).replace(/\\/g, '/');
  return res;
}

export function hasEvals(dir) {
  return existsSync(join(dir, 'evals', 'evals.json'));
}
