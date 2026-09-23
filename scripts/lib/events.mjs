// Log de eventos append-only (.sdd/events.jsonl) + materialização do estado (.sdd/state.json).
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { validate } from './schema.mjs';
import { reduce, applyEvent } from './state.mjs';
import { ENGINE_ROOT } from './engine.mjs';

export const SDD_DIR = '.sdd';
export const EVENTS_FILE = 'events.jsonl';
export const STATE_FILE = 'state.json';

// .gitignore interno do .sdd: o log é versionado (é a trilha de auditoria); o resto é derivado/local.
const SDD_GITIGNORE = [
  '# Gerado pelo SDD Kit. events.jsonl é versionado (autoridade do estado);',
  '# o resto é derivado ou local e pode ser recriado.',
  'state.json',
  'cache/',
  'reports/',
  'trace/',
  'backup/',
  '*.lock',
  '',
].join('\n');
// merge=union: dois ramos que acrescentam eventos se juntam sem conflito textual. A ordem das linhas
// é a ordem de aplicação; um conflito semântico depois do merge vira anomalia apontada pelo doctor.
const SDD_GITATTRIBUTES = 'events.jsonl merge=union\n';

let eventSchema;
function schema() {
  eventSchema ??= JSON.parse(readFileSync(join(ENGINE_ROOT, 'schemas', 'event.schema.json'), 'utf8'));
  return eventSchema;
}

export function validateEvent(ev) {
  return validate(schema(), ev);
}

export function sddPath(root, ...parts) {
  return join(root, SDD_DIR, ...parts);
}

export function ensureSddDir(root) {
  const dir = sddPath(root);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, '.gitignore'))) writeFileSync(join(dir, '.gitignore'), SDD_GITIGNORE);
  if (!existsSync(join(dir, '.gitattributes'))) writeFileSync(join(dir, '.gitattributes'), SDD_GITATTRIBUTES);
  return dir;
}

/**
 * Lê o log. Nunca lança por conteúdo: linhas inválidas viram `problems`.
 * `truncatedTail`: a última linha não termina em \n e não é JSON válido (escrita interrompida).
 */
export function readEvents(root) {
  const file = sddPath(root, EVENTS_FILE);
  const out = { events: [], problems: [], truncatedTail: false, raw: '', exists: existsSync(file) };
  if (!out.exists) return out;
  const raw = readFileSync(file, 'utf8');
  out.raw = raw;
  const lines = raw.split('\n');
  const endsWithNewline = raw.endsWith('\n');
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    if (!line.trim()) return;
    try {
      out.events.push(JSON.parse(line));
    } catch {
      if (isLast && !endsWithNewline) out.truncatedTail = true;
      out.problems.push({ line: i + 1, message: isLast && !endsWithNewline ? 'última linha truncada (escrita interrompida?) — rode `sdd state repair`' : 'linha não é JSON válido' });
    }
  });
  return out;
}

export function hashEvents(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

// Reexecução usa só o próprio log (sem as definições atuais de tarefas): dependências e agentes
// foram validados quando cada evento foi gravado; editar specs/tasks depois não reescreve a história.
export function computeState(root) {
  const log = readEvents(root);
  const state = reduce(log.events, {}, validateEvent);
  state.source = { events: log.events.length, sha256: hashEvents(log.raw) };
  return { state, log };
}

export function writeState(root, state) {
  ensureSddDir(root);
  writeFileSync(sddPath(root, STATE_FILE), JSON.stringify({ ...state, generated_at: new Date().toISOString() }, null, 2) + '\n');
}

/** Compara o state.json materializado com o recalculado a partir do log. */
export function verifyState(root) {
  const { state, log } = computeState(root);
  const file = sddPath(root, STATE_FILE);
  const result = { ok: true, issues: [], state, log };
  for (const p of log.problems) result.issues.push({ path: `${SDD_DIR}/${EVENTS_FILE}:${p.line}`, message: p.message, severity: 'error' });
  for (const a of state.anomalies) result.issues.push({ path: `${SDD_DIR}/${EVENTS_FILE}`, message: `evento ${a.type} (${a.id}) rejeitado na reexecução: ${a.error}`, severity: 'error' });
  if (existsSync(file)) {
    let stored;
    try { stored = JSON.parse(readFileSync(file, 'utf8')); } catch { stored = null; }
    if (!stored) result.issues.push({ path: `${SDD_DIR}/${STATE_FILE}`, message: 'state.json ilegível — rode `sdd state rebuild`', severity: 'error' });
    else {
      const { generated_at: _g, ...rest } = stored;
      if (JSON.stringify(rest) !== JSON.stringify(state)) {
        result.issues.push({ path: `${SDD_DIR}/${STATE_FILE}`, message: 'state.json diverge do events.jsonl (editado à mão ou desatualizado) — rode `sdd state rebuild`', severity: 'error' });
      }
    }
  }
  result.ok = !result.issues.some((i) => i.severity === 'error');
  return result;
}

// ------------------------------------------------------------------------------------------------
// Append com lock + idempotência + validação de transição
// ------------------------------------------------------------------------------------------------

export class EventRejected extends Error {}

const LOCK_STALE_MS = 30_000;
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(root, fn) {
  ensureSddDir(root);
  const lock = sddPath(root, 'events.lock');
  const deadline = Date.now() + 10_000;
  let fd;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) { unlinkSync(lock); continue; } } catch { continue; }
      if (Date.now() > deadline) throw new EventRejected('events.lock ocupado há mais de 10s (outro processo gravando?)');
      sleep(50);
    }
  }
  try { return fn(); } finally {
    closeSync(fd);
    try { unlinkSync(lock); } catch { /* já removido */ }
  }
}

const META_MAX_STRING = 500;
function checkMeta(meta) {
  if (!meta) return;
  const size = JSON.stringify(meta).length;
  if (size > 4000) throw new EventRejected(`meta com ${size} bytes: eventos carregam metadado pequeno (≤ 4000), não conteúdo`);
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' && v.length > META_MAX_STRING) throw new EventRejected(`meta.${k} com ${v.length} caracteres (máx. ${META_MAX_STRING})`);
  }
}

export function currentSession(root) {
  if (process.env.SDD_SESSION_ID) return process.env.SDD_SESSION_ID;
  try {
    return JSON.parse(readFileSync(sddPath(root, 'cache', 'session.json'), 'utf8')).id ?? null;
  } catch { return null; }
}

/**
 * Acrescenta um evento. Valida schema e transição contra o estado atual; recusa (EventRejected)
 * se inválido. Com `key` já existente, não grava nada e devolve { status: 'duplicate' }.
 */
export function appendEvent(root, input, { ctx = {} } = {}) {
  return withLock(root, () => {
    const log = readEvents(root);
    if (log.truncatedTail) throw new EventRejected('o events.jsonl termina numa linha truncada — rode `sdd state repair` antes de gravar');
    if (input.key && log.events.some((e) => e.key === input.key)) return { status: 'duplicate', key: input.key };
    const session = input.session ?? currentSession(root);
    const ev = { v: 1, id: randomUUID(), ts: new Date().toISOString(), type: input.type };
    for (const f of ['session', 'trace', 'spec', 'plan', 'task', 'agent', 'gate', 'result', 'key']) {
      const val = f === 'session' ? session : f === 'trace' ? (input.trace ?? session) : input[f];
      if (val !== undefined && val !== null && val !== '') ev[f] = String(val);
    }
    if (input.meta && Object.keys(input.meta).length) ev.meta = input.meta;
    checkMeta(ev.meta);
    const errs = validateEvent(ev);
    if (errs.length) throw new EventRejected(`evento inválido: ${errs.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
    const state = reduce(log.events, {}, validateEvent);
    const err = applyEvent(state, ev, ctx); // só o evento novo é checado contra o grafo atual
    if (err) throw new EventRejected(err);
    const prefix = log.raw && !log.raw.endsWith('\n') ? '\n' : '';
    appendFileSync(sddPath(root, EVENTS_FILE), prefix + JSON.stringify(ev) + '\n');
    const raw = log.raw + prefix + JSON.stringify(ev) + '\n';
    state.source = { events: log.events.length + 1, sha256: hashEvents(raw) };
    try { writeState(root, state); } catch { /* state.json é derivado: falha aqui não perde dados */ }
    return { status: 'appended', event: ev, state };
  });
}

/** Move uma cauda truncada para .sdd/backup/ e deixa o log terminando numa linha íntegra. */
export function repairEvents(root) {
  return withLock(root, () => {
    const log = readEvents(root);
    if (!log.truncatedTail) return { repaired: false };
    const cut = log.raw.lastIndexOf('\n') + 1;
    const tail = log.raw.slice(cut);
    mkdirSync(sddPath(root, 'backup'), { recursive: true });
    const backup = sddPath(root, 'backup', `events-tail-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    writeFileSync(backup, tail);
    copyFileSync(sddPath(root, EVENTS_FILE), backup.replace(/\.txt$/, '.full.jsonl'));
    writeFileSync(sddPath(root, EVENTS_FILE), log.raw.slice(0, cut));
    return { repaired: true, backup };
  });
}
