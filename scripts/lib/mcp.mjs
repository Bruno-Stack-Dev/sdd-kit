// Governança de MCP: allowlist (mcp/policies/allowlist.yaml), perfis (mcp/profiles/*.json), lock de
// ferramentas (mcp/mcp.lock.json no motor; .sdd/mcp.lock.json no projeto) e checagem de drift.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ENGINE_ROOT } from './engine.mjs';
import { parseYaml } from './yaml.mjs';
import { toPosix } from './files.mjs';

export const INSPECTOR = '@modelcontextprotocol/inspector@2.7.0';

const sha = (s) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const isEngine = (root) => toPosix(root).replace(/\/+$/, '') === toPosix(ENGINE_ROOT).replace(/\/+$/, '');

export function loadAllowlist() {
  return parseYaml(readFileSync(join(ENGINE_ROOT, 'mcp', 'policies', 'allowlist.yaml'), 'utf8'));
}

export function loadProfiles() {
  const dir = join(ENGINE_ROOT, 'mcp', 'profiles');
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) out[f.slice(0, -5)] = readJson(join(dir, f));
  return out;
}

export function engineLock() {
  return readJson(join(ENGINE_ROOT, 'mcp', 'mcp.lock.json')) ?? { version: 1, servers: {} };
}

export function projectLockPath(root) {
  return isEngine(root) ? join(ENGINE_ROOT, 'mcp', 'mcp.lock.json') : join(root, '.sdd', 'mcp.lock.json');
}

/** Entrada da allowlist → objeto de servidor do .mcp.json. */
export function serverConfig(entry) {
  if (entry.transport === 'http' || entry.transport === 'sse') {
    const cfg = { type: entry.transport, url: entry.url };
    if (entry.headers) cfg.headers = entry.headers;
    return cfg;
  }
  const cfg = { command: entry.command, args: entry.args ?? [] };
  if (entry.env && Object.keys(entry.env).length) cfg.env = entry.env;
  return cfg;
}

/** JSON com chaves ordenadas em todos os níveis (hash estável e sensível a env/headers). */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function configHash(cfg) {
  return sha(canonical(cfg));
}

function readMcpJson(root) {
  const file = join(root, '.mcp.json');
  if (!existsSync(file)) return { file, exists: false, cfg: { mcpServers: {} } };
  const cfg = readJson(file);
  if (!cfg) return { file, exists: true, invalid: true, cfg: { mcpServers: {} } };
  return { file, exists: true, cfg };
}

function readSettings(root) {
  const file = join(root, '.claude', 'settings.json');
  return { file, settings: readJson(file) ?? {} };
}

/** Aplica um perfil: .mcp.json só com servidores da allowlist + enabledMcpjsonServers no settings. */
export function applyProfile(root, profileName, { dryRun = false } = {}) {
  const profiles = loadProfiles();
  const profile = profiles[profileName];
  if (!profile) throw new Error(`perfil '${profileName}' não existe (há: ${Object.keys(profiles).join(', ')})`);
  const allow = loadAllowlist().servers;
  const mcp = readMcpJson(root);
  if (mcp.invalid) throw new Error('.mcp.json atual não é JSON válido — corrija antes de aplicar um perfil');
  const unknown = Object.keys(mcp.cfg.mcpServers ?? {}).filter((s) => !allow[s]);
  if (unknown.length) throw new Error(`.mcp.json tem servidor(es) fora da allowlist: ${unknown.join(', ')} — aprove na allowlist ou remova antes (nada foi alterado)`);
  const servers = {};
  for (const name of profile.servers) {
    if (!allow[name]) throw new Error(`perfil '${profileName}' cita '${name}', que não está na allowlist`);
    servers[name] = serverConfig(allow[name]);
  }
  const nextMcp = { ...mcp.cfg, mcpServers: servers };
  const { file: sfile, settings } = readSettings(root);
  const nextSettings = { ...settings, enableAllProjectMcpServers: false, enabledMcpjsonServers: [...profile.servers] };
  const lockFile = projectLockPath(root);
  const lock = readJson(lockFile) ?? { version: 1, servers: {} };
  lock.profile = profileName;
  lock.applied = Object.fromEntries(profile.servers.map((n) => [n, { package: allow[n].package, version: String(allow[n].version), config_hash: configHash(servers[n]), applied_at: new Date().toISOString().slice(0, 10) }]));
  if (!dryRun) {
    writeFileSync(mcp.file, JSON.stringify(nextMcp, null, 2) + '\n');
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(sfile, JSON.stringify(nextSettings, null, 2) + '\n');
    mkdirSync(join(lockFile, '..'), { recursive: true });
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  }
  return { profile: profileName, servers: profile.servers, mcp: nextMcp };
}

/**
 * Checa a governança sem executar nada. Devolve { errors, warnings, servers }.
 * Erros: servidor fora da allowlist, drift de comando/versão, @latest, auto-habilitação global.
 */
export function checkMcpGovernance(root, config) {
  const errors = [];
  const warnings = [];
  const allow = loadAllowlist().servers;
  const mcp = readMcpJson(root);
  if (mcp.invalid) return { errors: ['.mcp.json não é JSON válido'], warnings, servers: [] };
  const servers = Object.keys(mcp.cfg.mcpServers ?? {});
  for (const name of servers) {
    const cfg = mcp.cfg.mcpServers[name];
    const flat = JSON.stringify(cfg);
    if (!allow[name]) { errors.push(`'${name}' não está na allowlist (mcp/policies/allowlist.yaml) — MCP não governado`); continue; }
    if (/@latest\b/.test(flat)) errors.push(`'${name}' usa @latest — fixe a versão aprovada`);
    if (configHash(cfg) !== configHash(serverConfig(allow[name]))) errors.push(`'${name}': comando/args/env diferem do aprovado na allowlist (drift) — reaplique o perfil ou revise a allowlist`);
  }
  const { settings } = readSettings(root);
  if (settings.enableAllProjectMcpServers === true) errors.push('settings.json: enableAllProjectMcpServers=true habilita qualquer servidor novo sem revisão');
  for (const s of settings.enabledMcpjsonServers ?? []) if (!allow[s]) errors.push(`settings.json habilita '${s}', fora da allowlist`);
  if (servers.length && !Array.isArray(settings.enabledMcpjsonServers)) warnings.push('settings.json sem enabledMcpjsonServers: o Claude Code pedirá aprovação servidor a servidor (rode `sdd mcp apply <perfil>` para fixar a lista)');
  const profileName = config?.integrations?.mcp_profile;
  if (profileName) {
    const profile = loadProfiles()[profileName];
    if (!profile) errors.push(`integrations.mcp_profile '${profileName}' não existe em mcp/profiles/`);
    else {
      const want = [...profile.servers].sort().join(',');
      if (want !== [...servers].sort().join(',')) warnings.push(`.mcp.json (${servers.join(', ') || 'vazio'}) difere do perfil '${profileName}' (${profile.servers.join(', ') || 'vazio'}) — rode \`sdd mcp apply ${profileName}\``);
    }
  }
  const lock = engineLock();
  for (const name of servers.filter((s) => allow[s])) {
    if (!lock.servers?.[name]?.schema_hash) warnings.push(`'${name}': schema das ferramentas não capturado — mudança silenciosa (rug pull) só é detectável após \`sdd mcp pin ${name} --consent\``);
  }
  return { errors, warnings, servers };
}

function normalizeTools(raw) {
  const list = Array.isArray(raw) ? raw : raw?.result?.tools ?? raw?.tools;
  if (!Array.isArray(list)) throw new Error('saída sem lista de ferramentas (esperado {result:{tools:[...]}} do MCP Inspector)');
  return list.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} })).sort((a, b) => a.name.localeCompare(b.name));
}

export function toolsHash(tools) {
  return sha(canonical(tools));
}

/**
 * Captura nomes e hash do schema das ferramentas. Sem `consent` e sem `fromFile`, não executa nada e
 * devolve o plano (NOT_RUN). Compara com o pin anterior e relata ferramentas novas/removidas/alteradas.
 */
export function pinServer(root, name, { consent = false, fromFile = null } = {}) {
  const entry = loadAllowlist().servers[name];
  if (!entry) throw new Error(`'${name}' não está na allowlist`);
  const plan = entry.transport === 'stdio'
    ? ['npx', '--yes', INSPECTOR, '--cli', entry.command, ...(entry.args ?? []), '--method', 'tools/list', '--format', 'json']
    : ['npx', '--yes', INSPECTOR, '--cli', '--transport', 'http', '--server-url', entry.url, '--method', 'tools/list', '--format', 'json'];
  let raw;
  if (fromFile) raw = JSON.parse(readFileSync(fromFile, 'utf8'));
  else if (!consent) return { status: 'not_run', plan: plan.join(' '), reason: 'captura executa o servidor MCP e baixa o Inspector: rode com --consent num ambiente isolado' };
  else {
    const r = spawnSync(plan[0], plan.slice(1), { encoding: 'utf8', timeout: 180_000, shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) return { status: 'fail', plan: plan.join(' '), reason: (r.stderr || r.error?.message || `exit ${r.status}`).slice(0, 2000) };
    raw = JSON.parse(r.stdout);
  }
  const tools = normalizeTools(raw);
  const hash = toolsHash(tools);
  const lockFile = projectLockPath(root);
  const lock = readJson(lockFile) ?? { version: 1, servers: {} };
  lock.servers ??= {};
  const prev = lock.servers[name] ?? engineLock().servers?.[name] ?? {};
  const prevTools = prev.tool_digests ?? {};
  const digests = Object.fromEntries(tools.map((t) => [t.name, toolsHash([t])]));
  const diff = prev.schema_hash && prev.schema_hash !== hash ? {
    added: Object.keys(digests).filter((n) => !(n in prevTools)),
    removed: Object.keys(prevTools).filter((n) => !(n in digests)),
    changed: Object.keys(digests).filter((n) => n in prevTools && prevTools[n] !== digests[n]),
  } : null;
  lock.servers[name] = { package: entry.package, version: String(entry.version), tools: tools.map((t) => t.name), tool_digests: digests, schema_hash: hash, tools_source: fromFile ? 'arquivo capturado' : 'mcp inspector', captured_at: new Date().toISOString().slice(0, 10) };
  mkdirSync(join(lockFile, '..'), { recursive: true });
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  return { status: diff ? 'drift' : 'pinned', hash, tools: tools.map((t) => t.name), diff, lockFile };
}
