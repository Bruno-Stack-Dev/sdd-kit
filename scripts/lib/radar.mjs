// Radar de ferramentas: o que o projeto JÁ usa, decidiu ou planejou — para a skill radar-ferramentas
// não sugerir de novo o que está no roadmap. Só leitura de arquivos locais; nenhuma rede.
// Inventário e busca são determinísticos; julgar o contexto de cada ocorrência é do humano/modelo.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';
import { specsDirOf } from './project.mjs';
import { loadAdrs, readFrontmatter } from './specs.mjs';
import { manifestDependencies, detectAi } from './ai-detect.mjs';

export const RADAR_FILE_RE = /^RADAR-(\d{4}-\d{2}-\d{2})(?:-[a-z0-9-]+)?\.md$/;

// Ordem = precedência do status de um candidato (o primeiro que casar vence).
export const RADAR_STATUS = ['em-uso', 'em-adr', 'no-backlog', 'avaliado', 'mencionado', 'novo'];
const SNIPPETS_PER_SOURCE = 3;
const SNIPPET_MAX = 160;

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

function discoveryDir(root, specsDir) {
  return join(root, specsDir, 'discovery');
}

function mdFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort() : [];
}

/** ADRs do projeto: `<specs>/decisions` e, se existir, `docs/adr` (a mesma regra do doctor). */
function adrDirs(root, specsDir) {
  const dirs = [`${specsDir}/decisions`];
  if (existsSync(join(root, 'docs', 'adr'))) dirs.push('docs/adr');
  return dirs;
}

function adrTitle(text) {
  const fm = readFrontmatter(text);
  if (fm?.titulo) return String(fm.titulo);
  return text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

/** Inventário do que o projeto já tem: config, dependências, ADRs, discovery, backlog, radares anteriores. */
export function radarInventory(root) {
  const cfg = loadConfig(root);
  const c = cfg.config ?? {};
  const specsDir = specsDirOf(c);
  const disc = discoveryDir(root, specsDir);
  const files = mdFiles(disc);
  const docOf = (f) => {
    const fm = readFrontmatter(read(join(disc, f)));
    return { file: `${specsDir}/discovery/${f}`, doc_id: fm?.['doc-id'] ? String(fm['doc-id']) : null, status: fm?.status ? String(fm.status) : null };
  };
  const adrs = adrDirs(root, specsDir).flatMap((d) => loadAdrs(root, d)).map((a) => ({
    file: a.file, id: a.id, title: adrTitle(read(join(root, a.file))), status: a.status,
  }));
  const ai = detectAi(root);
  return {
    config: {
      source: cfg.source,
      project: c.project ? { type: c.project.type ?? null, domain: c.project.domain ?? null, stage: c.project.stage ?? null } : null,
      stack: c.stack ?? null,
      packs: c.integrations?.packs ?? [],
      ai: c.ai ? Object.keys(c.ai) : null,
    },
    dependencies: manifestDependencies(root),
    ai: { uses_ai: ai.uses_ai, signals: ai.signals },
    adrs,
    discovery: files.filter((f) => !RADAR_FILE_RE.test(f)).map(docOf),
    backlog: files.includes('BACKLOG.md') ? docOf('BACKLOG.md') : null,
    radars: files.filter((f) => RADAR_FILE_RE.test(f)).map((f) => ({ ...docOf(f), date: f.match(RADAR_FILE_RE)[1] })),
  };
}

/** Regex de um nome de ferramenta: sem caixa, separadores (-_. espaço) opcionais, com fronteira. */
export function nameRegex(name) {
  const parts = String(name).trim().toLowerCase().split(/[-_. ]+/).filter(Boolean);
  if (!parts.length) return null;
  const esc = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  return new RegExp(`(?<![a-z0-9])${esc.join('[-_. ]?')}(?![a-z0-9])`, 'i');
}

/** `stack` da config como linhas `chave.sub: valor` (chaves livres pelo schema). */
function flatten(v, prefix = 'stack') {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.flatMap((x) => flatten(x, prefix));
  if (typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => flatten(x, `${prefix}.${k}`));
  return [`${prefix}: ${v}`];
}

function snippets(text, re) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!re.test(line)) continue;
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
    const re = nameRegex(name);
    if (!re) return { name, status: 'novo', where: [] };
    const where = [];
    for (const m of inv.dependencies) {
      const hits = m.deps.filter((d) => re.test(d));
      if (hits.length) where.push({ kind: 'em-uso', file: m.file, detail: 'dependência', matches: hits });
    }
    if (stackText && re.test(stackText)) where.push({ kind: 'em-uso', file: 'sdd.config.yaml', detail: 'stack', matches: snippets(stackText, re) });
    for (const s of textSources) {
      if (re.test(s.text)) where.push({ kind: s.kind, file: s.file, detail: s.detail, matches: snippets(s.text, re) });
    }
    const status = RADAR_STATUS.find((st) => where.some((w) => w.kind === st)) ?? 'novo';
    return { name, status, where };
  });
}
