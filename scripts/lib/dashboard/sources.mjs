// Coleta de dados do projeto para o dashboard (camada "State Reader"). Tudo somente leitura e
// tolerante a falha: fonte indisponível vira `available: false` com o motivo, nunca exceção.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGINE_ROOT } from '../engine.mjs';
import { parseYaml } from '../yaml.mjs';
import { loadAdrs } from '../specs.mjs';
import { roleOf, resolveModel } from '../models.mjs';
import { loadPolicy, effectivePolicy, isAuditor } from '../policy.mjs';
import { loadSettings } from '../doctor/security.mjs';
import { readMcpJson, loadAllowlist, checkMcpGovernance } from '../mcp.mjs';
import { walkFiles, isBinary, toPosix } from '../files.mjs';
import { isPlaceholder } from '../config-md.mjs';

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

// ------------------------------------------------------------------------------------------------
// Git (somente leitura: --no-optional-locks para não tocar no index)
// ------------------------------------------------------------------------------------------------

export function gitInfo(root) {
  const run = (args) => spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', timeout: 3000, windowsHide: true });
  let st;
  try { st = run(['status', '--porcelain=v1', '--branch', '--untracked-files=normal']); } catch (e) { return { available: false, reason: `git indisponível (${e.message})` }; }
  if (st.error) return { available: false, reason: st.error.code === 'ENOENT' ? 'git não instalado' : `git indisponível (${st.error.code ?? st.error.message})` };
  if (st.status !== 0) return { available: false, reason: 'não é um repositório git' };
  const lines = st.stdout.split(/\r?\n/).filter(Boolean);
  const head = lines[0]?.startsWith('## ') ? lines.shift().slice(3) : '';
  let branch = null, upstream = null, ahead = 0, behind = 0;
  const noCommits = head.match(/^No commits yet on (.+)$/);
  if (noCommits) branch = noCommits[1];
  else if (head.startsWith('HEAD (no branch)')) branch = '(detached)';
  else {
    const m = head.match(/^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/);
    if (m) {
      branch = m[1];
      upstream = m[2] ?? null;
      ahead = Number(m[3]?.match(/ahead (\d+)/)?.[1] ?? 0);
      behind = Number(m[3]?.match(/behind (\d+)/)?.[1] ?? 0);
    }
  }
  let sha = null;
  try { const r = run(['rev-parse', '--short', 'HEAD']); if (r.status === 0) sha = r.stdout.trim() || null; } catch { /* sem commits */ }
  return { available: true, branch, head: sha, upstream, ahead, behind, changed: lines.length, dirty: lines.length > 0 };
}

// ------------------------------------------------------------------------------------------------
// Agentes: definição (frontmatter) + papel/modelo pela política + permissões pela política
// ------------------------------------------------------------------------------------------------

function toolList(v) {
  if (v === undefined || v === null) return null;
  return (Array.isArray(v) ? v.map(String) : String(v).split(',')).map((s) => s.trim()).filter(Boolean);
}

/** Agentes do projeto (primeiro) e do motor (modo plugin), com o que a política diz de cada um. */
export function agentRegistry(root, config) {
  const seen = new Map();
  let eff = null;
  try { eff = effectivePolicy(loadPolicy(), config); } catch { /* política ilegível: permissões ficam UNKNOWN */ }
  for (const [dir, origin] of [[join(root, '.claude', 'agents'), 'projeto'], [join(ENGINE_ROOT, '.claude', 'agents'), 'motor']]) {
    if (!existsSync(dir)) continue;
    let names = [];
    try { names = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(); } catch { continue; }
    for (const f of names) {
      const name = f.slice(0, -3);
      if (seen.has(name)) continue;
      let fm = null, parseError = null;
      try {
        const m = readFileSync(join(dir, f), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
        fm = m ? parseYaml(m[1]) ?? {} : {};
      } catch (e) { parseError = e.message; fm = {}; }
      const tools = toolList(fm.tools);
      let role = { role: 'build', source: 'inferred' };
      let model = { model: null, effort: null, source: { model: 'indisponível' } };
      try { role = roleOf(name, { config, fm }); } catch { /* papel default */ }
      try { model = resolveModel({ agent: name, config, fm }); } catch { /* sem roteamento */ }
      seen.set(name, {
        name,
        origin,
        file: toPosix(relative(root, join(dir, f))) || f,
        description: typeof fm.description === 'string' ? fm.description : '',
        tools: tools ?? ['(herda todas)'],
        role: role.role,
        roleSource: role.source,
        model: model.model ?? null,
        effort: model.effort ?? null,
        modelSource: model.source?.model ?? 'política',
        parseError,
        permissions: eff ? agentPermissions(name, tools, eff) : [{ decision: 'ask', label: 'política ilegível — permissões desconhecidas', source: 'policies/sdd-policy.json' }],
      });
    }
  }
  return [...seen.values()];
}

/** Permissões efetivas de um agente, derivadas de policies/sdd-policy.json (+ config) e das ferramentas. */
export function agentPermissions(name, tools, eff) {
  const out = [];
  const writes = tools === null || tools.some((t) => WRITE_TOOLS.includes(t.replace(/\(.*\)$/, '')));
  const bash = tools === null || tools.some((t) => /^(Bash|PowerShell)/.test(t));
  if (isAuditor(name, eff)) out.push({ decision: 'deny', label: `escrever no projeto (auditor: só ${(eff.auditors.writable_globs ?? []).join(', ')})`, source: 'policy auditors' });
  else out.push({ decision: writes ? 'allow' : 'deny', label: writes ? 'escrever arquivos do projeto (Write/Edit)' : 'escrever arquivos (sem ferramenta de escrita)', source: 'frontmatter tools' });
  out.push({ decision: bash ? 'allow' : 'deny', label: bash ? 'shell (cada comando passa pela política)' : 'shell (sem Bash)', source: 'frontmatter tools' });
  const extra = eff.paths.sensitive.extra_globs ?? [];
  out.push({ decision: eff.paths.sensitive.decision, label: `segredos: .env, *.pem, *.key, credenciais${extra.length ? `, ${extra.join(', ')}` : ''}`, source: 'policy paths.sensitive' });
  out.push({ decision: eff.paths.state.decision, label: `estado: ${eff.paths.state.globs.join(', ')} (só via CLI)`, source: 'policy paths.state' });
  out.push({ decision: eff.paths.generated.decision, label: 'arquivos gerados (cabeçalho AUTO-GENERATED)', source: 'policy paths.generated' });
  const g = eff.paths.guardrails.globs;
  out.push({ decision: eff.paths.guardrails.decision, label: `guardrails: ${g.slice(0, 4).join(', ')}${g.length > 4 ? ` +${g.length - 4}` : ''}`, source: 'policy paths.guardrails' });
  const gitDecision = eff.overrides?.destructive_git === 'ask' ? 'ask' : 'deny';
  out.push({ decision: gitDecision, label: 'git push / reset --hard / clean -f', source: 'policy bash.git' });
  out.push({ decision: eff.paths.outside_project.decision, label: 'escrever fora do diretório do projeto', source: 'policy paths.outside_project' });
  return out;
}

// ------------------------------------------------------------------------------------------------
// Guardrails do runtime: sandbox, hooks, política, trace
// ------------------------------------------------------------------------------------------------

export function runtimeGuards(root, config) {
  const s = loadSettings(root);
  const settings = s.settings;
  const sandbox = !s.exists ? { status: 'UNKNOWN', detail: 'sem .claude/settings.json (modo plugin? o sandbox é do usuário)' }
    : s.invalid ? { status: 'UNKNOWN', detail: '.claude/settings.json inválido' }
      : settings?.sandbox?.enabled ? { status: 'ACTIVE', detail: `${(settings.sandbox.network?.allowedDomains ?? []).length} domínio(s) liberado(s)` }
        : { status: 'INACTIVE', detail: process.platform === 'win32' ? 'desligado (Windows nativo não suporta — use WSL2)' : 'desligado — `sdd security sandbox --enable`' };
  const hooksText = JSON.stringify(settings?.hooks ?? {});
  let hooks;
  if (/PreToolUse/.test(hooksText) && /sdd-hook/.test(hooksText)) hooks = { status: 'ACTIVE', detail: 'hooks do SDD em .claude/settings.json' };
  else if (existsSync(join(ENGINE_ROOT, 'hooks', 'hooks.json')) && !existsSync(join(root, 'scripts', 'hooks'))) hooks = { status: 'ACTIVE', detail: 'hooks fornecidos pelo plugin sdd-kit' };
  else hooks = { status: 'INACTIVE', detail: 'hook PreToolUse do SDD ausente' };
  let policy;
  try { const p = loadPolicy(); policy = { status: p?.version === 1 ? 'ACTIVE' : 'DEGRADED', detail: `policies/sdd-policy.json v${p?.version}` }; } catch (e) { policy = { status: 'UNAVAILABLE', detail: e.message }; }
  const trace = config?.observability?.trace === false ? { status: 'OFF', detail: 'observability.trace: false' } : { status: 'ACTIVE', detail: '.sdd/trace/ (local, sanitizado)' };
  return { sandbox, hooks, policy, trace };
}

// ------------------------------------------------------------------------------------------------
// MCP (configuração + governança; nada é executado)
// ------------------------------------------------------------------------------------------------

export function mcpConfig(root, config) {
  try {
    const mcp = readMcpJson(root);
    const allow = loadAllowlist().servers ?? {};
    const gov = checkMcpGovernance(root, config);
    const configured = Object.keys(mcp.cfg?.mcpServers ?? {});
    return {
      available: true,
      file: mcp.exists ? '.mcp.json' : null,
      invalid: !!mcp.invalid,
      profile: config?.integrations?.mcp_profile ?? null,
      servers: configured.map((name) => ({ name, allowlisted: !!allow[name], description: allow[name]?.description ?? null })),
      errors: gov.errors,
      warnings: gov.warnings,
    };
  } catch (e) {
    return { available: false, reason: e.message, servers: [], errors: [], warnings: [] };
  }
}

// ------------------------------------------------------------------------------------------------
// Evals (resultados gravados por `sdd eval run`) e ADRs
// ------------------------------------------------------------------------------------------------

export function evalResults(root) {
  const dir = join(root, 'evals', 'results');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('-latest.json')).sort()) {
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (typeof data.total !== 'number') continue;
      out.push({
        suite: String(data.suite ?? f.replace(/-latest\.json$/, '')),
        total: data.total,
        passed: typeof data.passed === 'number' ? data.passed : null,
        failed: Array.isArray(data.results) ? data.results.filter((r) => r.passed === false).map((r) => String(r.id)) : [],
        file: `evals/results/${f}`,
        ranAt: statSync(join(dir, f)).mtime.toISOString(),
      });
    } catch { /* resultado ilegível: ignorado */ }
  }
  return out;
}

export function adrList(root, specsDir, engine) {
  const dirs = [`${specsDir}/decisions`];
  if (engine && existsSync(join(root, 'docs', 'adr'))) dirs.push('docs/adr');
  const out = [];
  for (const d of dirs) {
    try {
      for (const a of loadAdrs(root, d)) out.push({ id: a.id, file: a.file, status: a.status, title: a.fm?.titulo ? String(a.fm.titulo) : null });
    } catch { /* diretório ilegível */ }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// Referências de requisito em testes: arquivo de teste que cita o ID da spec E o do requisito.
// Vínculo textual explícito — nada é inferido por semelhança.
// ------------------------------------------------------------------------------------------------

const TEST_NAME = /(\.(test|spec)\.[cm]?[jt]sx?$)|(_test\.(go|py)$)|(^test_.+\.py$)|(Tests?\.cs$)|(\.(test|spec)\.(vue|svelte)$)|(_spec\.rb$)|(Test\.java$)/;
const MAX_TEST_FILES = 3000;
const MAX_TEST_BYTES = 512 * 1024;

function concreteDir(v) {
  return typeof v === 'string' && v.trim() && !isPlaceholder(v) && !/[<*{]/.test(v) ? v.replace(/\/+$/, '') : null;
}

/** Arquivos de teste do projeto: dirs concretos da config; senão, pelo nome do arquivo. */
export function testFiles(root, config) {
  const dirs = [config?.paths?.tests, config?.paths?.e2e, config?.paths?.backend?.integration_tests].map(concreteDir).filter(Boolean);
  const starts = dirs.length ? dirs.map((d) => join(root, d)).filter((d) => existsSync(d)) : [root];
  const files = [];
  for (const s of starts) {
    for (const f of walkFiles(s)) {
      const rel = toPosix(relative(root, f));
      if (dirs.length || TEST_NAME.test(rel.split('/').pop())) files.push(rel);
      if (files.length >= MAX_TEST_FILES) return { files, basis: dirs.length ? `paths da config (${dirs.join(', ')})` : 'nome de arquivo de teste', truncated: true };
    }
  }
  return { files, basis: dirs.length ? `paths da config (${dirs.join(', ')})` : 'nome de arquivo de teste', truncated: false };
}

/**
 * @param specs [{ id, requirements: [{ id }] }]
 * @param cache Map opcional (path → { mtime, size, text }) para não reler arquivos iguais.
 * @returns { refs: Map<'SPEC::REQ', string[]>, scanned, basis, truncated }
 */
export function scanTestReferences(root, config, specs, cache = new Map()) {
  const wanted = specs.filter((s) => s.id && s.requirements.length);
  const refs = new Map();
  if (!wanted.length) return { refs, scanned: 0, basis: 'sem requisitos numerados nas specs', truncated: false };
  const { files, basis, truncated } = testFiles(root, config);
  let scanned = 0;
  const idRe = new Map(wanted.map((s) => [s.id, new RegExp(`(^|[^A-Za-z0-9-])${s.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9]|$)`)]));
  for (const rel of files) {
    const abs = join(root, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > MAX_TEST_BYTES) continue;
    let entry = cache.get(rel);
    if (!entry || entry.mtime !== st.mtimeMs || entry.size !== st.size) {
      if (isBinary(abs)) continue;
      try { entry = { mtime: st.mtimeMs, size: st.size, text: readFileSync(abs, 'utf8') }; } catch { continue; }
      cache.set(rel, entry);
    }
    scanned++;
    for (const s of wanted) {
      if (!idRe.get(s.id).test(entry.text)) continue;
      for (const r of s.requirements) {
        if (new RegExp(`(^|[^A-Za-z0-9])${r.id}([^0-9]|$)`).test(entry.text)) {
          const k = `${s.id}::${r.id}`;
          if (!refs.has(k)) refs.set(k, []);
          refs.get(k).push(rel);
        }
      }
    }
  }
  return { refs, scanned, basis, truncated };
}
