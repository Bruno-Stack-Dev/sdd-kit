// Radar de ferramentas: o que o projeto JÁ usa, decidiu ou planejou — para a skill radar-ferramentas
// não sugerir de novo o que está no roadmap. Só leitura de arquivos locais; nenhuma rede.
// Inventário e busca são determinísticos; julgar o contexto de cada ocorrência é do humano/modelo.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';
import { specsDirOf, adrDirsOf } from './project.mjs';
import { loadAdrs, readFrontmatter } from './specs.mjs';
import { detectAi } from './ai-detect.mjs';
import { manifestDependencies } from './manifests.mjs';

// Sufixo opcional `-<foco>`: letras (inclusive acentuadas), dígitos, `-` e `_`.
export const RADAR_FILE_RE = /^RADAR-(\d{4}-\d{2}-\d{2})(?:-[\p{L}\p{N}_-]+)?\.md$/u;

// Ordem = precedência do status de um candidato (o primeiro que casar vence).
export const RADAR_STATUS = ['em-uso', 'em-adr', 'no-backlog', 'avaliado', 'mencionado', 'novo'];
const SNIPPETS_PER_SOURCE = 3;
const SNIPPET_MAX = 160;

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asList = (v) => (Array.isArray(v) ? v.map(String) : v === null || v === undefined || v === '' ? [] : [String(v)]);

function mdFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort() : [];
}

function adrTitle(root, adr) {
  if (adr.fm?.titulo) return String(adr.fm.titulo);
  return read(join(root, adr.file)).match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

/** Inventário do que o projeto já tem: config, dependências, ADRs, discovery, backlog, radares anteriores. */
export function radarInventory(root) {
  const cfg = loadConfig(root);
  const c = cfg.config ?? {};
  const specsDir = specsDirOf(c);
  const paths = { specs: specsDir, discovery: `${specsDir}/discovery`, decisions: `${specsDir}/decisions` };
  const disc = join(root, paths.discovery);
  const files = mdFiles(disc);
  const docOf = (f) => {
    const fm = readFrontmatter(read(join(disc, f)));
    return { file: `${paths.discovery}/${f}`, doc_id: fm?.['doc-id'] ? String(fm['doc-id']) : null, status: fm?.status ? String(fm.status) : null };
  };
  const adrs = adrDirsOf(root, specsDir).flatMap((d) => loadAdrs(root, d)).map((a) => ({
    file: a.file, id: a.id, title: adrTitle(root, a), status: a.status,
  }));
  const ai = detectAi(root);
  return {
    config: {
      source: cfg.source,
      project: isObject(c.project) ? { type: c.project.type ?? null, domain: c.project.domain ?? null, stage: c.project.stage ?? null } : null,
      stack: c.stack ?? null,
      packs: asList(c.integrations?.packs),
      ai: c.ai === null || c.ai === undefined ? null : isObject(c.ai) ? Object.keys(c.ai) : asList(c.ai),
    },
    paths,
    dependencies: manifestDependencies(root),
    ai: { uses_ai: ai.uses_ai, signals: ai.signals },
    adrs,
    discovery: files.filter((f) => !RADAR_FILE_RE.test(f)).map(docOf),
    backlog: files.includes('BACKLOG.md') ? docOf('BACKLOG.md') : null,
    radars: files.filter((f) => RADAR_FILE_RE.test(f)).map((f) => ({ ...docOf(f), date: f.match(RADAR_FILE_RE)[1] })),
  };
}

// Entre dois pedaços de um mesmo nome: `llama.cpp`, `llama-cpp`, `NeMo Guardrails`, `@langchain/langgraph`.
const JOINER = /^[-_. /]$/;

/**
 * Casador de um nome de ferramenta: sem caixa, com fronteira de palavra, e com os separadores
 * (-_. espaço /) opcionais nos DOIS lados — `nemoguardrails` acha `NeMo Guardrails` e vice-versa.
 * Nome com outros símbolos (`c++`, `f#`) casa literalmente.
 */
export function nameMatcher(name) {
  const raw = String(name).trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]+/g, '');
  if (!compact) return null;
  if (/[^a-z0-9\-_. /@]/.test(raw)) {
    const re = new RegExp(`(?<![a-z0-9])${raw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![a-z0-9])`, 'i');
    return (text) => re.test(text);
  }
  return (text) => {
    const lower = String(text).toLowerCase();
    const tokens = [...lower.matchAll(/[a-z0-9]+/g)].map((m) => ({ t: m[0], start: m.index, end: m.index + m[0].length }));
    for (let i = 0; i < tokens.length; i++) {
      if (!compact.startsWith(tokens[i].t)) continue;
      let acc = '';
      for (let j = i; j < tokens.length; j++) {
        if (j > i && !JOINER.test(lower.slice(tokens[j - 1].end, tokens[j].start))) break;
        acc += tokens[j].t;
        if (acc === compact) return true;
        if (!compact.startsWith(acc)) break;
      }
    }
    return false;
  };
}

/** Nome do pacote quando a ferramenta é conhecida com sufixo de ecossistema: `next.js` → `next`. */
function packageAlias(name) {
  const parts = String(name).trim().toLowerCase().split(/[-_. ]+/).filter(Boolean);
  return parts.length > 1 && parts.at(-1) === 'js' ? parts.slice(0, -1).join('-') : null;
}

/** `stack` da config como linhas `chave.sub: valor` (chaves livres pelo schema). */
function flatten(v, prefix = 'stack') {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap((x) => flatten(x, prefix));
  if (typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => flatten(x, `${prefix}.${k}`));
  return [`${prefix}: ${v}`];
}

function snippets(text, matches) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!matches(line)) continue;
    const t = line.trim();
    out.push(t.length > SNIPPET_MAX ? `${t.slice(0, SNIPPET_MAX - 1)}…` : t);
    if (out.length >= SNIPPETS_PER_SOURCE) break;
  }
  return out;
}

/** Onde cada candidato já aparece no projeto e o status resultante (precedência em RADAR_STATUS). */
export function radarCheck(root, names) {
  const inv = radarInventory(root);
  const stackText = flatten(inv.config.stack).join('\n');
  const textSources = [
    ...inv.adrs.map((a) => ({ kind: 'em-adr', file: a.file, detail: [a.id, a.status].filter(Boolean).join(' · ') || null })),
    ...(inv.backlog ? [{ kind: 'no-backlog', file: inv.backlog.file, detail: null }] : []),
    ...inv.radars.map((r) => ({ kind: 'avaliado', file: r.file, detail: r.date })),
    ...inv.discovery.filter((d) => d.file !== inv.backlog?.file).map((d) => ({ kind: 'mencionado', file: d.file, detail: d.doc_id })),
  ].map((s) => ({ ...s, text: read(join(root, s.file)) }));

  return names.map((name) => {
    const matches = nameMatcher(name);
    if (!matches) return { name, status: 'novo', where: [] };
    const alias = packageAlias(name);
    const where = [];
    for (const m of inv.dependencies) {
      const hits = m.deps.filter((d) => matches(d) || d === alias);
      if (hits.length) where.push({ kind: 'em-uso', file: m.file, detail: 'dependência', matches: hits });
    }
    if (stackText && matches(stackText)) where.push({ kind: 'em-uso', file: 'sdd.config.yaml', detail: 'stack', matches: snippets(stackText, matches) });
    for (const s of textSources) {
      if (matches(s.text)) where.push({ kind: s.kind, file: s.file, detail: s.detail, matches: snippets(s.text, matches) });
    }
    const status = RADAR_STATUS.find((st) => where.some((w) => w.kind === st)) ?? 'novo';
    return { name, status, where };
  });
}
