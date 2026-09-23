// Relatório de divergências da auditoria brownfield (specs/discovery/AUDITORIA-DIVERGENCIAS.md):
// parse da tabela e validação das regras OBSERVED × INTENDED × RUNTIME.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CLASSIFICATIONS = ['DOC_DRIFT', 'SPEC_DRIFT', 'SECURITY_DRIFT', 'RUNTIME_DRIFT', 'CONFIG_DRIFT', 'UNKNOWN'];
export const PROVENANCE = ['CODE', 'CONFIG', 'TEST', 'DOC', 'RUNTIME', 'USER_CONFIRMED', 'INFERRED'];
// Tags de proveniência do formato v2 continuam aceitas.
export const LEGACY_PROVENANCE = { código: 'CODE', codigo: 'CODE', inferido: 'INFERRED', usuário: 'USER_CONFIRMED', usuario: 'USER_CONFIRMED' };
const CRITICAL = new Set(['SECURITY_DRIFT', 'RUNTIME_DRIFT']);

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

/** Linhas da tabela de divergências (cabeçalho com "Classificação"). */
export function parseDivergences(md) {
  const lines = md.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*\|/.test(l) && /Classifica/i.test(l));
  if (idx < 0) return { format: 'legacy', rows: [] };
  const header = cells(lines[idx]).map((h) => h.toLowerCase());
  const col = (name) => header.findIndex((h) => h.startsWith(name));
  const c = { id: col('id'), tema: col('tema'), intended: col('intended'), observed: col('observed'), runtime: col('runtime'), cls: col('classifica'), prov: col('proveni'), res: col('resolu') };
  const rows = [];
  for (let i = idx + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const r = cells(lines[i]);
    rows.push({
      line: i + 1,
      id: r[c.id] ?? '', tema: r[c.tema] ?? '', intended: r[c.intended] ?? '', observed: r[c.observed] ?? '',
      runtime: r[c.runtime] ?? '', classification: (r[c.cls] ?? '').replace(/`/g, ''), provenance: (r[c.prov] ?? '').replace(/`/g, ''), resolution: (r[c.res] ?? '').replace(/`/g, ''),
    });
  }
  return { format: 'v3', rows };
}

const isPlaceholder = (s) => /<[^>]*ex\.?:|<TODO>/i.test(s);

export function validateDivergences(md) {
  const errors = [];
  const warnings = [];
  const { format, rows } = parseDivergences(md);
  if (format === 'legacy') {
    warnings.push('relatório no formato v2 ("código prevalece") — reclassifique com OBSERVED/INTENDED/RUNTIME (sdd template show auditoria-divergencias)');
    return { errors, warnings, rows };
  }
  for (const r of rows) {
    if (isPlaceholder(`${r.tema}${r.intended}${r.observed}`)) continue; // linha de exemplo do template
    const where = `${r.id || `linha ${r.line}`}`;
    if (!CLASSIFICATIONS.includes(r.classification)) errors.push(`${where}: classificação '${r.classification}' inválida (${CLASSIFICATIONS.join(' | ')})`);
    const provs = r.provenance.split(/[,;\s]+/).filter(Boolean).map((p) => LEGACY_PROVENANCE[p.toLowerCase()] ?? p.toUpperCase());
    const badProv = provs.filter((p) => !PROVENANCE.includes(p));
    if (!provs.length) errors.push(`${where}: sem proveniência`);
    if (badProv.length) errors.push(`${where}: proveniência inválida '${badProv.join(', ')}' (${PROVENANCE.join(' | ')})`);
    if (!r.observed) errors.push(`${where}: coluna Observed vazia (qual é a evidência no código/config?)`);
    const res = r.resolution.toLowerCase();
    const runtimeVerified = r.runtime && !/n[ãa]o verificad|^—?$|^-$|^n\/a$/i.test(r.runtime);
    if (CRITICAL.has(r.classification) && res !== 'pendente') {
      if (/c[óo]digo prevalece/.test(res)) errors.push(`${where}: ${r.classification} não pode ser resolvida por "código prevalece" — o código existir não prova que está certo`);
      else if (/aceito/.test(res) && !/ADR-\d+/i.test(r.resolution)) errors.push(`${where}: ${r.classification} aceita como intencional exige ADR (aceito-intencional (ADR-NNN))`);
      else if (!runtimeVerified && !provs.includes('USER_CONFIRMED') && !provs.includes('RUNTIME')) {
        errors.push(`${where}: ${r.classification} saiu de 'pendente' sem evidência de RUNTIME nem USER_CONFIRMED`);
      }
    }
    if (r.classification === 'UNKNOWN' && res !== 'pendente') warnings.push(`${where}: UNKNOWN resolvida — reclassifique antes de fechar`);
    if (/c[óo]digo prevalece/.test(res) && !CRITICAL.has(r.classification)) warnings.push(`${where}: "código prevalece" (v2) — use corrigir-doc/corrigir-código/aceito-intencional`);
  }
  const pendingSecurity = rows.filter((r) => r.classification === 'SECURITY_DRIFT' && r.resolution.toLowerCase() === 'pendente' && !isPlaceholder(r.tema)).length;
  if (pendingSecurity) warnings.push(`${pendingSecurity} SECURITY_DRIFT pendente(s) — exigem decisão humana`);
  return { errors, warnings, rows };
}

/** Tags de proveniência nos docs de discovery: [CODE], [código], [INFERRED]... */
export function provenanceTags(md) {
  const tags = [];
  for (const m of md.matchAll(/\[(CODE|CONFIG|TEST|DOC|RUNTIME|USER_CONFIRMED|INFERRED|c[óo]digo|inferido|usu[áa]rio|[A-Z_]{4,})\]/g)) tags.push(m[1]);
  return tags;
}

export function divergencesFile(root, specsDir = 'specs') {
  const f = join(root, specsDir, 'discovery', 'AUDITORIA-DIVERGENCIAS.md');
  return existsSync(f) ? f : null;
}

export function readDivergences(root, specsDir) {
  const f = divergencesFile(root, specsDir);
  return f ? validateDivergences(readFileSync(f, 'utf8')) : null;
}
