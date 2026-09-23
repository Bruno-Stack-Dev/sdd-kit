// Supply chain de skills: hash determinístico, lockfile de proveniência, verificação, ingestão de
// skills externas e ativação de packs.
//
//   skills.lock.json (motor)          packs vendorizados e skills núcleo do kit
//   .sdd/skills.lock.json (projeto)   skills externas ingeridas pelo próprio projeto
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, renameSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { ENGINE_ROOT } from './engine.mjs';
import { walkFiles, isBinary, toPosix } from './files.mjs';
import { validate } from './schema.mjs';
import { validateSkill } from './skills.mjs';
import { scanSkillDir, summarizeFindings } from './skill-scan.mjs';

export const LOCK_VERSION = 1;
export const TRUST_LEVELS = ['core', 'vendored-reviewed', 'reviewed', 'quarantine', 'rejected'];
// Artefatos locais (ignorados pelo git) não entram no hash: o lock tem de bater num clone limpo.
const HASH_IGNORE = new Set(['node_modules', '__pycache__', '.pytest_cache', '.git', '.claude-plugin', '.coverage', '.DS_Store']);

/** sha256 de um diretório: caminhos relativos ordenados + conteúdo (texto com fim de linha normalizado). */
export function hashDir(dir) {
  const h = createHash('sha256');
  const files = walkFiles(dir, { ignore: HASH_IGNORE }).map((f) => [toPosix(relative(dir, f)), f]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [rel, abs] of files) {
    h.update(rel);
    h.update('\0');
    const buf = readFileSync(abs);
    h.update(isBinary(abs) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
    h.update('\0');
  }
  return `sha256:${h.digest('hex')}`;
}

export function packsDir(root = ENGINE_ROOT) {
  return join(root, '.claude', 'skills', '_packs');
}

export function listPacks(root = ENGINE_ROOT) {
  const d = packsDir(root);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((p) => statSync(join(d, p)).isDirectory()).sort();
}

/** Skills de um pack (diretórios com SKILL.md, sem prefixo _). */
export function packSkills(pack, root = ENGINE_ROOT) {
  const d = join(packsDir(root), pack);
  return readdirSync(d).filter((n) => !n.startsWith('_') && !n.startsWith('.') && existsSync(join(d, n, 'SKILL.md'))).sort();
}

/** Diretórios de apoio do pack (ex.: _arch-templates) que viajam junto na ativação. */
export function packSupportDirs(pack, root = ENGINE_ROOT) {
  const d = join(packsDir(root), pack);
  return readdirSync(d).filter((n) => n.startsWith('_') && statSync(join(d, n)).isDirectory()).sort();
}

let lockSchema;
function schema() {
  lockSchema ??= JSON.parse(readFileSync(join(ENGINE_ROOT, 'schemas', 'skills-lock.schema.json'), 'utf8'));
  return lockSchema;
}

export function engineLockPath() {
  return join(ENGINE_ROOT, 'skills.lock.json');
}

export function projectLockPath(root) {
  return join(root, '.sdd', 'skills.lock.json');
}

export function readLock(file) {
  if (!existsSync(file)) return null;
  const lock = JSON.parse(readFileSync(file, 'utf8'));
  const errors = validate(schema(), lock);
  if (errors.length) throw new Error(`${basename(file)} inválido: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  return lock;
}

export function writeLock(file, lock) {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
}

function scanRecord(dir) {
  const r = scanSkillDir(dir);
  return {
    risk: r.risk,
    sdd_static: { status: summarizeFindings(r.findings).error ? 'fail' : 'pass', date: new Date().toISOString().slice(0, 10), findings: summarizeFindings(r.findings) },
    findings: r.findings.filter((f) => f.severity !== 'info').slice(0, 50),
  };
}

/** Recalcula hashes e o scan estático das entradas do lock do motor (operação de mantenedor). */
export function refreshEngineLock(existing) {
  const lock = existing ?? { version: LOCK_VERSION, packs: {}, skills: {} };
  for (const pack of listPacks()) {
    const entry = lock.packs[pack] ?? { source: null, ref: null, license: null, trust: 'quarantine', reviewed_at: null };
    const dir = join(packsDir(), pack);
    entry.hash = hashDir(dir);
    entry.skills = Object.fromEntries(packSkills(pack).map((s) => [s, hashDir(join(dir, s))]));
    const sc = scanRecord(dir);
    entry.risk = sc.risk;
    entry.scan = { ...(entry.scan ?? {}), sdd_static: sc.sdd_static, external: entry.scan?.external ?? { tool: 'cisco-skill-scanner', status: 'not_run', date: null } };
    entry.findings = sc.findings;
    lock.packs[pack] = entry;
  }
  const base = join(ENGINE_ROOT, '.claude', 'skills');
  for (const name of readdirSync(base).filter((n) => !n.startsWith('_') && existsSync(join(base, n, 'SKILL.md'))).sort()) {
    const dir = join(base, name);
    const prev = lock.skills[name] ?? {};
    const sc = scanRecord(dir);
    lock.skills[name] = {
      source: 'https://github.com/Bruno-Stack-Dev/sdd-kit',
      license: 'MIT',
      trust: prev.trust ?? 'core',
      reviewed_at: prev.reviewed_at ?? null,
      hash: hashDir(dir),
      risk: sc.risk,
      scan: { sdd_static: sc.sdd_static, external: prev.scan?.external ?? { tool: 'cisco-skill-scanner', status: 'not_run', date: null } },
      evals: countEvals(dir),
    };
  }
  return lock;
}

export function countEvals(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'evals', 'evals.json'), 'utf8')).evals.length; } catch { return 0; }
}

/**
 * Verifica o lock do motor contra o disco. Devolve { errors, warnings }.
 * Hash diferente = conteúdo mudou sem revisão (ou adulteração).
 */
export function verifyEngineLock() {
  const errors = [];
  const warnings = [];
  let lock;
  try { lock = readLock(engineLockPath()); } catch (e) { return { errors: [e.message], warnings }; }
  if (!lock) return { errors: ['skills.lock.json ausente no motor'], warnings };
  for (const pack of listPacks()) {
    const entry = lock.packs[pack];
    if (!entry) { errors.push(`pack '${pack}' sem entrada no skills.lock.json (proveniência desconhecida)`); continue; }
    const h = hashDir(join(packsDir(), pack));
    if (h !== entry.hash) errors.push(`pack '${pack}': hash ${h.slice(0, 19)}… ≠ lock ${String(entry.hash).slice(0, 19)}… (conteúdo mudou sem revisão — rode \`sdd skills lock --update\` após revisar)`);
    if (entry.trust === 'quarantine') warnings.push(`pack '${pack}' em quarentena (não revisado)`);
    if (entry.trust === 'rejected') errors.push(`pack '${pack}' rejeitado na revisão`);
    if (!entry.license) errors.push(`pack '${pack}' sem licença registrada`);
    if (entry.scan?.external?.status !== 'pass') warnings.push(`pack '${pack}': scan externo ${entry.scan?.external?.status ?? 'not_run'}`);
  }
  for (const name of Object.keys(lock.packs)) if (!listPacks().includes(name)) warnings.push(`lock cita o pack '${name}', que não existe mais`);
  const base = join(ENGINE_ROOT, '.claude', 'skills');
  for (const [name, entry] of Object.entries(lock.skills ?? {})) {
    const dir = join(base, name);
    if (!existsSync(dir)) { warnings.push(`lock cita a skill '${name}', que não existe`); continue; }
    if (hashDir(dir) !== entry.hash) errors.push(`skill núcleo '${name}': hash diverge do lock (rode \`sdd skills lock --update\` após revisar)`);
  }
  return { errors, warnings, lock };
}

// ------------------------------------------------------------------------------------------------
// Ativação de packs
// ------------------------------------------------------------------------------------------------

export function activatePack(root, pack, { force = false } = {}) {
  if (!listPacks().includes(pack)) throw new Error(`pack '${pack}' não existe (há: ${listPacks().join(', ')})`);
  const lock = readLock(engineLockPath());
  const entry = lock?.packs?.[pack];
  if (!entry) throw new Error(`pack '${pack}' sem entrada no skills.lock.json — proveniência desconhecida, ativação recusada`);
  if (['quarantine', 'rejected'].includes(entry.trust) && !force) throw new Error(`pack '${pack}' está '${entry.trust}': revise antes de ativar (ou --force, com registro)`);
  const src = join(packsDir(), pack);
  const actual = hashDir(src);
  if (actual !== entry.hash && !force) throw new Error(`pack '${pack}' difere do hash registrado no lock — conteúdo não revisado, ativação recusada`);
  const dest = join(root, '.claude', 'skills');
  mkdirSync(dest, { recursive: true });
  const copied = [];
  for (const name of [...packSkills(pack), ...packSupportDirs(pack)]) {
    const to = join(dest, name);
    if (existsSync(to) && !force) {
      if (entry.skills?.[name] && hashDir(to) === entry.skills[name]) continue; // já ativa e íntegra
      if (!entry.skills?.[name]) continue; // diretório de apoio já presente
      throw new Error(`${toPosix(relative(root, to))} já existe e difere do pack (alteração local?) — use --force para sobrescrever (com backup)`);
    }
    if (existsSync(to)) backupDir(root, to, `pack-${pack}`);
    cpSync(join(src, name), to, { recursive: true, filter: (p) => !/[\\/](__pycache__|\.pytest_cache|\.claude-plugin|\.coverage|\.DS_Store)([\\/]|$)/.test(p) });
    copied.push(name);
  }
  return { pack, copied, hash: entry.hash, trust: entry.trust };
}

function backupDir(root, dir, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(root, '.sdd', 'backup', `${label}-${stamp}`, basename(dir));
  mkdirSync(join(target, '..'), { recursive: true });
  renameSync(dir, target);
  return target;
}

/** Desativa movendo as cópias para .sdd/backup/ (nunca apaga). Recusa cópias alteradas sem --force. */
export function deactivatePack(root, pack, { force = false } = {}) {
  const lock = readLock(engineLockPath());
  const entry = lock?.packs?.[pack];
  const dest = join(root, '.claude', 'skills');
  const moved = [];
  for (const name of [...packSkills(pack), ...packSupportDirs(pack)]) {
    const dir = join(dest, name);
    if (!existsSync(dir)) continue;
    if (entry?.skills?.[name] && hashDir(dir) !== entry.skills[name] && !force) {
      throw new Error(`${name} foi alterada localmente — use --force (a cópia vai para .sdd/backup/)`);
    }
    moved.push(toPosix(relative(root, backupDir(root, dir, `pack-${pack}-off`))));
  }
  return { pack, moved };
}

/** Packs ativos no projeto: skills do pack presentes em .claude/skills e se estão íntegras. */
export function activePacks(root) {
  let lock = null;
  try { lock = readLock(engineLockPath()); } catch { /* reportado pelo verify */ }
  const out = [];
  for (const pack of listPacks()) {
    const skills = packSkills(pack).filter((s) => existsSync(join(root, '.claude', 'skills', s)));
    if (!skills.length) continue;
    const modified = skills.filter((s) => lock?.packs?.[pack]?.skills?.[s] && hashDir(join(root, '.claude', 'skills', s)) !== lock.packs[pack].skills[s]);
    out.push({ pack, skills: skills.length, total: packSkills(pack).length, modified });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Ingestão de skill externa
// ------------------------------------------------------------------------------------------------

/**
 * Pipeline: estrutura (spec Agent Skills) → licença → scan estático → quarentena no pack `external`
 * (inativo) → lock com proveniência. Revisão humana (`skills review`) libera a ativação.
 */
export function ingestSkill(root, srcDir, { source, ref = null, license, pack = 'external' }) {
  if (!source) throw new Error('--source <url> é obrigatório (de onde veio a skill?)');
  if (!license) throw new Error('--license <SPDX> é obrigatório (sob qual licença?)');
  if (!existsSync(join(srcDir, 'SKILL.md'))) throw new Error(`${srcDir} não contém SKILL.md`);
  const v = validateSkill(srcDir, { owned: false });
  if (v.errors.length) throw new Error(`skill fora da spec Agent Skills: ${v.errors.join('; ')}`);
  const name = v.frontmatter.name;
  const scan = scanSkillDir(srcDir);
  const counts = summarizeFindings(scan.findings);
  const inEngine = toPosix(root).replace(/\/+$/, '') === toPosix(ENGINE_ROOT).replace(/\/+$/, '');
  const destBase = inEngine ? join(packsDir(), pack) : join(root, '.sdd', 'quarantine');
  const dest = join(destBase, name);
  if (existsSync(dest)) throw new Error(`${toPosix(relative(root, dest))} já existe`);
  mkdirSync(destBase, { recursive: true });
  cpSync(srcDir, dest, { recursive: true });
  const lockFile = inEngine ? engineLockPath() : projectLockPath(root);
  const lock = readLock(lockFile) ?? { version: LOCK_VERSION, packs: {}, skills: {} };
  lock.external ??= {};
  lock.external[name] = {
    source, ref, license,
    location: toPosix(relative(root, dest)),
    hash: hashDir(dest),
    trust: counts.error ? 'rejected' : 'quarantine',
    risk: scan.risk,
    ingested_at: new Date().toISOString().slice(0, 10),
    reviewed_at: null,
    scan: { sdd_static: { status: counts.error ? 'fail' : 'pass', date: new Date().toISOString().slice(0, 10), findings: counts }, external: { tool: 'cisco-skill-scanner', status: 'not_run', date: null } },
    findings: scan.findings.filter((f) => f.severity !== 'info').slice(0, 50),
    evals: countEvals(dest),
  };
  writeLock(lockFile, lock);
  return { name, dest, entry: lock.external[name], lockFile };
}

export function reviewEntry(lockFile, name, trust) {
  if (!['reviewed', 'rejected', 'vendored-reviewed'].includes(trust)) throw new Error(`trust inválido '${trust}' (reviewed | rejected | vendored-reviewed)`);
  const lock = readLock(lockFile);
  const entry = lock?.external?.[name] ?? lock?.packs?.[name];
  if (!entry) throw new Error(`'${name}' não está no lock`);
  if (trust !== 'rejected' && entry.scan?.sdd_static?.status === 'fail') throw new Error(`'${name}' tem achados de severidade error no scan estático — corrija ou rejeite`);
  entry.trust = trust;
  entry.reviewed_at = new Date().toISOString().slice(0, 10);
  writeLock(lockFile, lock);
  return entry;
}
