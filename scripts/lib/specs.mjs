// Leitura determinística dos artefatos de spec: specs, planos, tarefas e ADRs.
// Substitui o "varra specs/** e descubra" que antes ficava a cargo do LLM.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseYaml } from './yaml.mjs';

export const SPEC_DIRS = ['features', 'architecture', 'apis'];
export const SPEC_STATUS = ['rascunho', 'aprovada', 'implementada', 'arquivada'];
export const ADR_STATUS_RE = /^(proposto|aceito|descartado|obsoleto|superado por ADR-[\w-]+)$/;

// Gramática v2 de uma linha de tarefa (compatível com template-tarefas.md):
//   - [ ] [T-001] descrição (@agente-x) 🔒 T-002, SPEC-2026-100/T-004
export const TASK_LINE =
  /^(\s*)- \[( |~|!|x|-)\] \[((?:[A-Z][A-Z0-9-]*\/)?T-\d{3,})\] (.+?) \((@agente-[a-z0-9-]+)\)(?:\s*🔒\s*(.+?))?\s*$/u;
const CHECKBOX_STATUS = { ' ': 'pending', '~': 'in_progress', '!': 'blocked', x: 'completed', '-': 'cancelled' };
export const STATUS_CHECKBOX = Object.fromEntries(Object.entries(CHECKBOX_STATUS).map(([k, v]) => [v, k]));

function walkMd(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkMd(p));
    else if (name.endsWith('.md') && !name.startsWith('_') && name !== 'README.md') out.push(p);
  }
  return out.sort();
}

/** Frontmatter como objeto. YAML de subconjunto; cai para chave: valor linha a linha se falhar. */
export function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    const v = parseYaml(m[1]);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* formato livre: cai no parser tolerante abaixo */ }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z0-9-]+):\s*(.*)$/i);
    if (kv) fm[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim();
  }
  return fm;
}

function rel(root, p) {
  return relative(root, p).replace(/\\/g, '/');
}

function asList(v) {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.map(String);
  const s = String(v).trim();
  if (s.startsWith('[')) return s.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
  return [s];
}

/** CAs numerados no corpo: `CA-01`, `**CA-1**`... (IDs únicos). */
export function countAcceptanceCriteria(body) {
  const ids = new Set();
  for (const m of body.matchAll(/^\s*[-*]\s*\*{0,2}(CA-\d+)\*{0,2}\s*[:—-]/gm)) ids.add(m[1]);
  return ids.size;
}

export function loadSpecs(root, specsDir = 'specs') {
  const specs = [];
  for (const d of SPEC_DIRS) {
    for (const file of walkMd(join(root, specsDir, d))) {
      const text = readFileSync(file, 'utf8');
      const fm = readFrontmatter(text);
      const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
      specs.push({
        file: rel(root, file),
        kind: d,
        fm,
        id: fm?.['spec-id'] ? String(fm['spec-id']) : null,
        status: fm?.status ? String(fm.status) : null,
        cas: fm?.cas,
        dependsOn: asList(fm?.['depende-de']),
        caCount: countAcceptanceCriteria(body),
      });
    }
  }
  return specs;
}

export function loadPlans(root, specsDir = 'specs') {
  return walkMd(join(root, specsDir, 'plans')).map((file) => {
    const fm = readFrontmatter(readFileSync(file, 'utf8'));
    return { file: rel(root, file), fm, id: fm?.['plano-id'] ? String(fm['plano-id']) : null, spec: fm?.['spec-relacionada'] ? String(fm['spec-relacionada']) : null };
  });
}

export function loadAdrs(root, dir) {
  return walkMd(join(root, dir)).map((file) => {
    const fm = readFrontmatter(readFileSync(file, 'utf8'));
    return { file: rel(root, file), fm, id: fm?.['adr-id'] ? String(fm['adr-id']) : null, status: fm?.status ? String(fm.status) : null };
  });
}

/**
 * Tarefas de specs/tasks/*.md. IDs `T-NNN` são locais ao arquivo; o ID global é `<tarefas-de>/T-NNN`.
 * Dependências `🔒 T-002` resolvem no mesmo arquivo; `🔒 SPEC-X/T-004` apontam para outra spec.
 */
export function loadTasks(root, specsDir = 'specs') {
  const files = [];
  for (const file of walkMd(join(root, specsDir, 'tasks'))) {
    const text = readFileSync(file, 'utf8');
    const fm = readFrontmatter(text);
    const spec = fm?.['tarefas-de'] ? String(fm['tarefas-de']) : null;
    const tasks = [];
    const malformed = [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (!/^\s*- \[.\] \[/.test(line)) return;
      const m = line.match(TASK_LINE);
      if (!m) { malformed.push({ line: i + 1, text: line.trim() }); return; }
      const [, , box, rawId, title, agent, depsRaw] = m;
      const qualify = (id) => (id.includes('/') ? id : `${spec ?? rel(root, file)}/${id}`);
      tasks.push({
        id: qualify(rawId),
        localId: rawId.includes('/') ? rawId.split('/').pop() : rawId,
        spec,
        file: rel(root, file),
        line: i + 1,
        title: title.trim(),
        agent: agent.slice(1),
        checkbox: CHECKBOX_STATUS[box],
        dependsOn: depsRaw ? depsRaw.split(',').map((d) => qualify(d.trim())).filter(Boolean) : [],
      });
    });
    files.push({ file: rel(root, file), fm, spec, plan: fm?.['plano-relacionado'] ? String(fm['plano-relacionado']) : null, tasks, malformed });
  }
  return files;
}

/** Resolve um ID de tarefa informado pelo usuário (T-003 ou SPEC/T-003). */
export function resolveTaskId(input, allTasks) {
  if (input.includes('/')) return allTasks.filter((t) => t.id === input);
  return allTasks.filter((t) => t.localId === input);
}

// ------------------------------------------------------------------------------------------------
// Numeração (config `numbering`)
// ------------------------------------------------------------------------------------------------

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Números já usados com o prefixo, em specs, planos e tarefas. */
export function usedNumbers(root, prefix, specsDir = 'specs') {
  const re = new RegExp(`^${escapeRe(prefix)}(\\d+)$`);
  const nums = new Set();
  const take = (id) => { const m = id && String(id).match(re); if (m) nums.add(Number(m[1])); };
  for (const s of loadSpecs(root, specsDir)) take(s.id);
  for (const p of loadPlans(root, specsDir)) take(p.id);
  for (const f of loadTasks(root, specsDir)) take(f.spec);
  return [...nums].sort((a, b) => a - b);
}

/**
 * Próximo ID. `newBlock`: primeiro número do próximo bloco de centena livre (novo projeto/módulo);
 * senão: maior número usado + incremento (próximo submódulo). Formato com 3+ dígitos.
 */
export function nextSpecId(root, numbering, { newBlock = false, specsDir = 'specs' } = {}) {
  const { prefix, increment = 10, start = 'auto' } = numbering;
  const used = usedNumbers(root, prefix, specsDir);
  const max = used.length ? used[used.length - 1] : null;
  let n;
  if (max === null) n = start === 'auto' ? 100 : Number(start);
  else if (newBlock) n = (Math.floor(max / 100) + 1) * 100;
  else n = max + increment;
  return `${prefix}${String(n).padStart(3, '0')}`;
}
