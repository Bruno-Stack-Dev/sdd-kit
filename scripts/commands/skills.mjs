// `sdd skills <verify|lock|scan|info|add|review|hash>` · `sdd pack <list|activate|deactivate>`
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UsageError, ICON } from '../lib/cli.mjs';
import { ENGINE_ROOT } from '../lib/engine.mjs';
import { findOnPath } from '../lib/files.mjs';
import { scanSkillDir, summarizeFindings } from '../lib/skill-scan.mjs';
import {
  hashDir, readLock, writeLock, engineLockPath, projectLockPath, refreshEngineLock, verifyEngineLock,
  activatePack, deactivatePack, activePacks, listPacks, packSkills, ingestSkill, reviewEntry, countEvals,
} from '../lib/supply.mjs';
import { appendEvent } from '../lib/events.mjs';

export async function skillsCommand(args) {
  const [sub] = args.positional;
  switch (sub) {
    case 'verify': return verify(args);
    case 'lock': return lock(args);
    case 'scan': return scan(args);
    case 'info': return info(args);
    case 'add': return add(args);
    case 'review': return review(args);
    case 'hash': return hash(args);
    default: throw new UsageError('uso: skills <verify|lock|scan|info|add|review|hash>');
  }
}

function verify({ flags }) {
  const r = verifyEngineLock();
  if (flags.json) console.log(JSON.stringify({ errors: r.errors, warnings: r.warnings }, null, 2));
  else {
    for (const e of r.errors) console.log(`${ICON.error} ${e}`);
    for (const w of r.warnings) console.log(`${ICON.warn} ${w}`);
    if (!r.errors.length) console.log(`${ICON.ok} skills e packs íntegros conforme skills.lock.json`);
  }
  return r.errors.length ? 1 : 0;
}

function lock({ flags }) {
  if (!flags.update) throw new UsageError('uso: skills lock --update  (recalcula hashes e scan estático; faça depois de revisar as mudanças)');
  let existing = null;
  try { existing = readLock(engineLockPath()); } catch (e) { throw new UsageError(e.message); }
  const next = refreshEngineLock(existing);
  writeLock(engineLockPath(), next);
  console.log(`${ICON.ok} skills.lock.json atualizado (${Object.keys(next.packs).length} pack(s), ${Object.keys(next.skills).length} skill(s) núcleo)`);
  return 0;
}

function scanTargets(root, positional) {
  if (positional[1]) return [resolve(root, positional[1])];
  const base = join(ENGINE_ROOT, '.claude', 'skills');
  return [join(base, '_packs'), ...(existsSync(join(root, '.claude', 'skills')) ? [join(root, '.claude', 'skills')] : [])];
}

/** Scan estático sempre; scan externo (Cisco skill-scanner) só com --external e se instalado. */
function scan({ root, flags, positional }) {
  const targets = scanTargets(root, positional);
  const results = targets.map((t) => ({ target: t, ...scanSkillDir(t) }));
  const external = { tool: 'cisco-skill-scanner', status: 'not_run', reason: null };
  if (flags.external) {
    const bin = findOnPath('skill-scanner');
    if (!bin) external.reason = 'skill-scanner não instalado (uv pip install cisco-ai-skill-scanner)';
    else {
      // Analisadores padrão do skill-scanner são offline; LLM/VirusTotal só com flags explícitas (não usadas).
      const r = spawnSync(bin, ['scan-all', targets[0], '--recursive', '--format', 'json'], { encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) external.reason = r.error.message;
      else {
        external.status = r.status === 0 ? 'pass' : 'fail';
        external.output = (r.stdout || '').slice(0, 20000);
      }
    }
  } else external.reason = 'use --external para rodar o Cisco skill-scanner (opcional)';
  const errors = results.reduce((n, r) => n + summarizeFindings(r.findings).error, 0);
  if (flags.json) console.log(JSON.stringify({ results: results.map((r) => ({ target: r.target, risk: r.risk, counts: summarizeFindings(r.findings), findings: r.findings })), external }, null, 2));
  else {
    for (const r of results) {
      const c = summarizeFindings(r.findings);
      console.log(`${c.error ? ICON.error : c.warn ? ICON.warn : ICON.ok} ${r.target}: risco ${r.risk} · ${c.error} erro(s) · ${c.warn} aviso(s)`);
      for (const f of r.findings.filter((x) => x.severity !== 'info').slice(0, 20)) console.log(`    ${f.severity} ${f.id} ${f.file}:${f.line}`);
    }
    console.log(`${external.status === 'not_run' ? ICON.notRun : external.status === 'pass' ? ICON.ok : ICON.error} scan externo: ${external.status.toUpperCase()}${external.reason ? ` — ${external.reason}` : ''}`);
  }
  return errors || external.status === 'fail' ? 1 : 0;
}

/** "De onde veio esta skill, qual versão, sob qual licença, quando foi escaneada e quais evals?" */
function info({ positional, flags, root }) {
  const name = positional[1];
  if (!name) throw new UsageError('uso: skills info <skill|pack>');
  const engine = readLock(engineLockPath());
  const project = readLock(projectLockPath(root));
  let entry = engine?.skills?.[name] ?? engine?.packs?.[name] ?? engine?.external?.[name] ?? project?.external?.[name];
  let kind = entry ? (engine?.skills?.[name] ? 'skill núcleo' : engine?.packs?.[name] ? 'pack' : 'externa') : null;
  if (!entry) {
    for (const [pack, p] of Object.entries(engine?.packs ?? {})) {
      if (p.skills?.[name]) { entry = { ...p, hash: p.skills[name], pack }; kind = `skill do pack '${pack}'`; break; }
    }
  }
  if (!entry) { console.log(`${ICON.error} '${name}' não está em nenhum skills.lock.json — proveniência desconhecida`); return 1; }
  const res = { name, kind, ...entry };
  delete res.skills;
  delete res.findings;
  if (flags.json) { console.log(JSON.stringify(res, null, 2)); return 0; }
  console.log(`${name} (${kind})`);
  console.log(`  origem:      ${entry.source ?? 'desconhecida'}${entry.ref ? ` @ ${entry.ref}` : ' (ref não registrada)'}`);
  console.log(`  licença:     ${entry.license ?? '—'}${entry.license_notes ? ` — ${entry.license_notes}` : ''}`);
  console.log(`  hash:        ${entry.hash}`);
  console.log(`  confiança:   ${entry.trust}${entry.reviewed_at ? ` (revisado em ${entry.reviewed_at})` : ' (sem revisão registrada)'}`);
  console.log(`  risco:       ${entry.risk ?? '—'}${entry.risk_notes ? ` — ${entry.risk_notes}` : ''}`);
  console.log(`  scan SDD:    ${entry.scan?.sdd_static?.status ?? 'not_run'}${entry.scan?.sdd_static?.date ? ` em ${entry.scan.sdd_static.date}` : ''}`);
  console.log(`  scan ext.:   ${entry.scan?.external?.status ?? 'not_run'}${entry.scan?.external?.date ? ` em ${entry.scan.external.date}` : ''}`);
  const evals = entry.evals ?? (kind?.startsWith('skill do pack') ? countEvals(join(ENGINE_ROOT, '.claude', 'skills', '_packs', entry.pack, name)) : undefined);
  console.log(`  evals:       ${evals ?? 0} caso(s)${evals ? ' — resultados em evals/results/ (sdd eval)' : ''}`);
  return 0;
}

function add({ positional, flags, root }) {
  const src = positional[1];
  if (!src) throw new UsageError('uso: skills add <dir-da-skill> --source <url> --license <SPDX> [--ref <tag|commit>]');
  let r;
  try { r = ingestSkill(root, resolve(root, src), { source: flags.source, ref: flags.ref ?? null, license: flags.license }); } catch (e) { throw new UsageError(e.message); }
  const c = r.entry.scan.sdd_static.findings;
  console.log(`${r.entry.trust === 'rejected' ? ICON.error : ICON.warn} ${r.name} ingerida em ${r.entry.location} com confiança '${r.entry.trust}' (risco ${r.entry.risk}; ${c.error} erro(s), ${c.warn} aviso(s) no scan estático)`);
  console.log(`  lock: ${r.lockFile}`);
  console.log(r.entry.trust === 'rejected'
    ? '  Achados de severidade error: não pode ser ativada. Revise os achados com `sdd skills info`.'
    : `  Próximos passos: rode \`sdd skills scan ${r.entry.location} --external\` se tiver o scanner, leia o conteúdo e registre a revisão humana com \`sdd skills review ${r.name} --trust reviewed\`.`);
  return r.entry.trust === 'rejected' ? 1 : 0;
}

function review({ positional, flags, root }) {
  const name = positional[1];
  if (!name || !flags.trust) throw new UsageError('uso: skills review <nome> --trust <reviewed|rejected|vendored-reviewed>');
  const lockFile = existsSync(projectLockPath(root)) && readLock(projectLockPath(root))?.external?.[name] ? projectLockPath(root) : engineLockPath();
  let entry;
  try { entry = reviewEntry(lockFile, name, flags.trust); } catch (e) { throw new UsageError(e.message); }
  console.log(`${ICON.ok} ${name}: confiança '${entry.trust}' registrada em ${entry.reviewed_at}`);
  return 0;
}

function hash({ positional, root }) {
  const dir = positional[1];
  if (!dir) throw new UsageError('uso: skills hash <dir>');
  console.log(hashDir(resolve(root, dir)));
  return 0;
}

export async function packCommand({ positional, flags, root }) {
  const [sub, name] = positional;
  if (sub === 'list') {
    let lock = null;
    try { lock = readLock(engineLockPath()); } catch { /* verify reporta */ }
    const active = Object.fromEntries(activePacks(root).map((a) => [a.pack, a]));
    const rows = listPacks().map((p) => ({ pack: p, skills: packSkills(p).length, active: !!active[p], modified: active[p]?.modified ?? [], trust: lock?.packs?.[p]?.trust ?? 'desconhecida', license: lock?.packs?.[p]?.license ?? '—' }));
    if (flags.json) console.log(JSON.stringify(rows, null, 2));
    else for (const r of rows) console.log(`${r.active ? '●' : '○'} ${r.pack.padEnd(6)} ${String(r.skills).padStart(3)} skill(s)  ${r.trust.padEnd(18)} ${r.license}${r.modified.length ? `  ⚠ alteradas: ${r.modified.join(', ')}` : ''}`);
    return 0;
  }
  if (sub !== 'activate' && sub !== 'deactivate') throw new UsageError('uso: pack <list|activate|deactivate> [pack] [--force]');
  if (!name) throw new UsageError(`uso: pack ${sub} <pack>`);
  let r;
  try { r = sub === 'activate' ? activatePack(root, name, { force: !!flags.force }) : deactivatePack(root, name, { force: !!flags.force }); } catch (e) { throw new UsageError(e.message); }
  if (existsSync(join(root, '.sdd', 'events.jsonl'))) {
    try { appendEvent(root, { type: sub === 'activate' ? 'PACK_ACTIVATED' : 'PACK_DEACTIVATED', meta: { pack: name, ...(r.hash ? { hash: r.hash } : {}) } }); } catch { /* o estado é opcional aqui */ }
  }
  if (sub === 'activate') {
    console.log(`${ICON.ok} pack '${name}' ativado (${r.copied.length} item(ns) copiados; hash e confiança '${r.trust}' conferidos no lock)`);
    console.log(`  Registre na config: integrations.packs: [..., ${name}]`);
  } else {
    console.log(`${ICON.ok} pack '${name}' desativado: ${r.moved.length} item(ns) movidos para .sdd/backup/ (nada foi apagado)`);
  }
  return 0;
}
