// Policy engine: decide deny / ask / allow para uma chamada de ferramenta do Claude Code.
// A fonte das regras é policies/sdd-policy.json (+ endurecimento da config do projeto).
// "allow" significa apenas "sem objeção da política": as permissões normais continuam valendo.
import { existsSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { join, isAbsolute, relative, resolve } from 'node:path';
import { ENGINE_ROOT } from './engine.mjs';
import { parseCommand, ShellParseError, flagSet, positional, baseName } from './shell.mjs';
import { isSensitivePath } from './secrets.mjs';

const RANK = { allow: 0, ask: 1, deny: 2 };

let cached;
export function loadPolicy() {
  cached ??= JSON.parse(readFileSync(join(ENGINE_ROOT, 'policies', 'sdd-policy.json'), 'utf8'));
  return cached;
}

/** Política efetiva = núcleo + endurecimento do projeto (config.security). Nunca afrouxa o núcleo. */
export function effectivePolicy(policy, config) {
  const sec = config?.security ?? {};
  const eff = structuredClone(policy);
  eff.paths.sensitive.extra_globs = [...(eff.paths.sensitive.extra_globs ?? []), ...(sec.protected_paths ?? [])];
  eff.bash.database.production_markers = [...eff.bash.database.production_markers, ...(sec.production?.markers ?? [])];
  eff.overrides = {
    destructive_git: sec.destructive_git ?? null,
    'production.db_write': sec.production?.db_write ?? null,
  };
  eff.networkMode = sec.network?.mode ?? 'sandbox';
  return eff;
}

function decisionOf(rule, eff) {
  if (rule.config_override && eff.overrides?.[rule.config_override] === 'ask' && rule.decision === 'deny') return 'ask';
  return rule.decision;
}

// ------------------------------------------------------------------------------------------------
// Caminhos
// ------------------------------------------------------------------------------------------------

export function globToRegex(glob) {
  let re = '';
  const g = glob.replace(/\\/g, '/');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += g[i + 2] === '/' ? 2 : 1; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, process.platform === 'win32' ? 'i' : '');
}

function matchesAny(rel, globs = []) {
  return globs.some((g) => globToRegex(g).test(rel));
}

/** Caminho relativo (posix) à raiz, ou null se estiver fora dela. */
export function relToRoot(root, p) {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(root, p);
  let rel = relative(root, abs);
  if (process.platform === 'win32' && /^[A-Za-z]:/.test(rel)) return null; // outro drive
  rel = rel.replace(/\\/g, '/');
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return rel || '.';
}

function hasGeneratedMarker(abs, marker) {
  try {
    if (!existsSync(abs) || !statSync(abs).isFile()) return false;
    const fd = openSync(abs, 'r');
    const buf = Buffer.alloc(2048);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    return buf.subarray(0, n).toString('utf8').includes(marker);
  } catch { return false; }
}

export function isAuditor(agent, eff) {
  if (!agent) return false;
  return eff.auditors.agents.includes(agent) || agent.endsWith(eff.auditors.suffix);
}

/** Decisão para acessar um caminho em modo 'read' ou 'write'. */
export function checkPath(root, p, mode, eff, agent) {
  const rel = relToRoot(root, p);
  const shown = rel ?? String(p);
  const verdict = (rule, decision, reason) => ({ decision, rule, reason: `${shown}: ${reason}` });
  const sens = eff.paths.sensitive;
  if (isSensitivePath(shown) || (rel && matchesAny(rel, sens.extra_globs))) return verdict('paths.sensitive', sens.decision, sens.reason);
  if (mode !== 'write') return null;
  if (isAuditor(agent, eff) && !(rel && matchesAny(rel, eff.auditors.writable_globs))) return verdict('auditors', eff.auditors.decision, eff.auditors.reason);
  if (rel && matchesAny(rel, eff.paths.state.globs)) return verdict('paths.state', eff.paths.state.decision, eff.paths.state.reason);
  const abs = isAbsolute(p) ? p : resolve(root, p);
  if (hasGeneratedMarker(abs, eff.paths.generated_marker)) return verdict('paths.generated', eff.paths.generated.decision, eff.paths.generated.reason);
  if (rel && matchesAny(rel, eff.paths.guardrails.globs)) return verdict('paths.guardrails', eff.paths.guardrails.decision, eff.paths.guardrails.reason);
  if (rel === null) return verdict('paths.outside_project', eff.paths.outside_project.decision, eff.paths.outside_project.reason);
  return null;
}

// ------------------------------------------------------------------------------------------------
// Bash / PowerShell
// ------------------------------------------------------------------------------------------------

const READ_CMDS = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat', 'nl', 'od', 'xxd', 'hexdump', 'strings', 'base64', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed', 'cut', 'sort', 'uniq', 'diff', 'cmp', 'source', '.', 'type', 'get-content', 'gc', 'select-string', 'sls', 'openssl', 'gpg', 'jq', 'yq', 'dotenv', 'vi', 'vim', 'nano', 'code', 'notepad', 'zip', 'tar', '7z', 'scp', 'rsync']);
const WRITE_CMDS = new Set(['tee', 'cp', 'mv', 'install', 'ln', 'truncate', 'rm', 'rmdir', 'unlink', 'touch', 'chmod', 'chown', 'dd', 'set-content', 'add-content', 'out-file', 'new-item', 'copy-item', 'move-item', 'remove-item', 'clear-content', 'del', 'erase', 'ri', 'copy', 'move', 'ren', 'rename-item']);
const GIT_MUTATING = new Set(['add', 'commit', 'checkout', 'switch', 'reset', 'restore', 'stash', 'merge', 'rebase', 'cherry-pick', 'revert', 'apply', 'am', 'rm', 'mv', 'clean', 'push', 'pull', 'tag', 'branch', 'init', 'filter-branch', 'filter-repo', 'update-ref', 'gc', 'reflog', 'worktree', 'submodule']);
const DEV_NULL = /^(\/dev\/(null|stdout|stderr|tty)|nul|\$null|&\d)$/i;
const COARSE_DESTRUCTIVE = /\b(rm\s+-[a-zA-Z]*[rRf]|git\s+(push|reset\s+--hard|clean\s+-[a-zA-Z]*f|filter-branch)|sudo\b|mkfs|dd\s+.*of=\/dev|remove-item\b.*-recurse)/i;

export function coarseDestructive(cmd) {
  return COARSE_DESTRUCTIVE.test(String(cmd));
}

function gitSub(argv) {
  let i = 1;
  while (i < argv.length && argv[i].startsWith('-')) { if (['-C', '-c', '--git-dir', '--work-tree'].includes(argv[i])) i++; i++; }
  return { sub: argv[i] ?? '', rest: [argv[0], ...argv.slice(i + 1)] };
}

function psFlags(argv) {
  // PowerShell: -Recurse -Force (case-insensitive, sem agregação)
  return new Set(argv.slice(1).filter((a) => /^-[A-Za-z]+$/.test(a)).map((a) => a.slice(1).toLowerCase()));
}

function productionMarker(text, env, eff) {
  const markers = eff.bash.database.production_markers;
  const word = new RegExp(`(^|[^A-Za-z0-9])(${markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^A-Za-z0-9]|$)`, 'i');
  if (word.test(text)) return true;
  return Object.entries(env ?? {}).some(([k, v]) => /ENV|ENVIRONMENT|STAGE/i.test(k) && word.test(String(v)));
}

function segmentChecks(seg, next, ctx) {
  const { eff, root, agent, fullText } = ctx;
  const B = eff.bash;
  const out = [];
  const add = (rule, decision, reason) => out.push({ rule, decision, reason });
  const cmd = seg.cmd;
  const argv = seg.argv;
  const raw = argv.join(' ');
  const flags = flagSet(argv);
  const pos = positional(argv);

  if (seg.wrappers.some((w) => B.privilege.commands.includes(w)) || B.privilege.commands.includes(cmd)) add('bash.privilege', B.privilege.decision, B.privilege.reason);
  if (B.system.commands.some((c) => cmd === c || cmd.startsWith(`${c}.`))) add('bash.system', B.system.decision, `${B.system.reason} (${cmd})`);
  if (cmd === 'dd' && argv.some((a) => /^of=\/dev\//.test(a))) add('bash.system', 'deny', 'dd escrevendo em dispositivo');

  // git
  if (cmd === 'git') {
    const { sub, rest } = gitSub(argv);
    const f = flagSet(rest);
    const G = B.git;
    const rule = (name) => add(`bash.git.${name}`, decisionOf(G[name], eff), G[name].reason);
    if (sub === 'push') {
      if (f.has('force') || f.has('f') || f.has('force-with-lease') || f.has('force-if-includes') || rest.slice(1).some((a) => a.startsWith('+'))) rule('push_force');
      else rule('push');
    }
    if (sub === 'reset' && f.has('hard')) rule('reset_hard');
    if (sub === 'clean' && (f.has('f') || f.has('force'))) rule('clean_force');
    if (sub === 'checkout' && (rest.includes('--') || positional(rest).some((a) => a === '.' || a === '*'))) rule('discard_changes');
    if (sub === 'restore' && !(f.has('staged') && !f.has('worktree'))) rule('discard_changes');
    if (sub === 'branch' && (f.has('D') || (f.has('delete') && f.has('force')))) rule('branch_force_delete');
    if (['filter-branch', 'filter-repo'].includes(sub) || (sub === 'reflog' && rest.includes('expire')) || (sub === 'gc' && rest.some((a) => /^--prune=now/.test(a))) || (sub === 'update-ref' && f.has('d'))) rule('history_rewrite');
    if (sub === 'stash' && ['drop', 'clear'].includes(positional(rest)[0])) rule('stash_drop');
    if (isAuditor(agent, eff) && GIT_MUTATING.has(sub)) add('auditors', eff.auditors.decision, `${eff.auditors.reason} (git ${sub})`);
  }

  // rm / Remove-Item / rmdir /s
  const isPsRemove = ['remove-item', 'ri', 'del', 'erase', 'rd'].includes(cmd) && psFlags(argv).has('recurse');
  if (cmd === 'rm' || isPsRemove || (cmd === 'rmdir' && argv.some((a) => /^\/s$/i.test(a)))) {
    const recursive = flags.has('r') || flags.has('R') || flags.has('recursive') || isPsRemove || cmd === 'rmdir';
    const force = flags.has('f') || flags.has('force') || psFlags(argv).has('force') || argv.some((a) => /^\/q$/i.test(a));
    if (recursive) {
      const targets = cmd === 'rmdir' ? argv.slice(1).filter((a) => !/^\/[sq]$/i.test(a)) : pos;
      const danger = targets.filter((t) => {
        const n = t.replace(/^['"]|['"]$/g, '');
        if (B.rm.dangerous_targets.includes(n)) return true;
        const rel = relToRoot(root, n.replace(/[\\/]+$/, '') || '/');
        return rel === '.' || rel === '.git' || rel === '.sdd' || (rel === null && /^([A-Za-z]:)?[\\/]?$/.test(n.replace(/[\\/]+$/, '')));
      });
      if (danger.length) add('bash.rm.dangerous', B.rm.dangerous.decision, `${B.rm.dangerous.reason}: ${danger.join(' ')}`);
      else if (force) add('bash.rm.recursive_force', B.rm.recursive_force.decision, `${B.rm.recursive_force.reason}: ${targets.join(' ')}`);
    }
  }
  if (cmd === 'find' && (argv.includes('-delete') || argv.some((a, i) => a === '-exec' && /^(rm|shred)$/.test(baseName(argv[i + 1] ?? ''))))) {
    add('bash.rm.recursive_force', B.rm.recursive_force.decision, 'find removendo arquivos em massa');
  }

  // curl ... | sh
  const P = B.pipe_to_interpreter;
  if (P.sources.includes(cmd) && seg.pipeTo && next && P.interpreters.includes(next.cmd)) add('bash.pipe_to_interpreter', P.decision, P.reason);
  if (P.interpreters.includes(cmd) && new RegExp(`(\\$\\(|<\\(|\`)\\s*(${P.sources.join('|')})\\b`, 'i').test(fullText)) add('bash.pipe_to_interpreter', P.decision, P.reason);

  // rede
  if (B.network.commands.includes(cmd) && eff.networkMode !== 'unrestricted') add('bash.network', B.network.decision, `${B.network.reason} (${cmd})`);

  // instalação de dependência nova
  const joined = [cmd, ...argv.slice(1)].join(' ');
  if (B.install.patterns.some((p) => new RegExp(p, 'i').test(joined))) add('bash.install', B.install.decision, `${B.install.reason}: ${raw}`);

  // dump de ambiente
  const envDump = (cmd === 'printenv' && pos.length === 0) || (argv.length === 0 && seg.wrappers.includes('env')) || (cmd === 'env' && argv.length === 1) ||
    (cmd === 'set' && argv.length === 1) || (cmd === 'export' && (argv.length === 1 || flags.has('p'))) ||
    (['get-childitem', 'gci', 'dir', 'ls'].includes(cmd) && argv.some((a) => /^env:/i.test(a)));
  if (envDump) add('bash.env_dump', B.env_dump.decision, B.env_dump.reason);

  // banco de dados
  const D = B.database;
  const isClient = D.clients.includes(cmd);
  const migrator = D.migrators.find((m) => joined.toLowerCase().includes(m.toLowerCase()));
  if (isClient || migrator) {
    const prod = productionMarker(fullText, seg.env, eff);
    const writes = new RegExp(D.write_sql, 'i').test(fullText) || !!migrator;
    if (prod && writes) add('bash.database.production_write', decisionOf(D.production_write, eff), D.production_write.reason);
    else if (isClient && new RegExp(D.destructive_sql, 'i').test(fullText)) add('bash.database.destructive', D.destructive.decision, D.destructive.reason);
  }

  // infraestrutura
  const I = B.infra;
  if (I.patterns.some((p) => new RegExp(p, 'i').test(joined))) {
    add('bash.infra', productionMarker(fullText, seg.env, eff) ? I.production_decision : I.decision, `${I.reason}: ${raw}`);
  }

  // redirecionamentos que escrevem arquivo
  for (const r of seg.redirects) {
    if (r.op === '<' || r.op === '<<') { const v = checkPath(root, r.target, 'read', eff, agent); if (v) add(v.rule, v.decision, v.reason); continue; }
    if (DEV_NULL.test(r.target)) continue;
    const v = checkPath(root, r.target, 'write', eff, agent);
    if (v) add(v.rule, v.decision, `redirecionamento para ${v.reason}`);
    else if (isAuditor(agent, eff)) add('auditors', eff.auditors.decision, `${eff.auditors.reason} (redirecionamento para ${r.target})`);
  }

  // comandos que leem/escrevem arquivos nomeados
  const sedInPlace = cmd === 'sed' && (flags.has('i') || argv.some((a) => a.startsWith('-i') || a === '--in-place'));
  const perlInPlace = cmd === 'perl' && argv.some((a) => /^-[a-z]*i/.test(a));
  if (WRITE_CMDS.has(cmd) || sedInPlace || perlInPlace) {
    let writes = pos;
    let reads = [];
    if (['cp', 'mv', 'install', 'ln', 'copy-item', 'move-item', 'copy', 'move'].includes(cmd) && pos.length >= 2) { writes = [pos[pos.length - 1]]; reads = pos.slice(0, -1); }
    if (sedInPlace) writes = pos.slice(1);
    if (cmd === 'dd') writes = argv.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
    for (const t of reads) { const v = checkPath(root, t, 'read', eff, agent); if (v) add(v.rule, v.decision, v.reason); }
    for (const t of writes) { const v = checkPath(root, t, 'write', eff, agent); if (v) add(v.rule, v.decision, v.reason); }
    if (isAuditor(agent, eff) && !out.some((o) => o.rule === 'auditors')) add('auditors', eff.auditors.decision, `${eff.auditors.reason} (${cmd})`);
  } else if (READ_CMDS.has(cmd)) {
    for (const t of pos) {
      const v = checkPath(root, t, 'read', eff, agent);
      if (v) add(v.rule, v.decision, v.reason);
    }
  } else if (['git'].includes(cmd)) {
    // git show HEAD:.env / git diff .env
    for (const t of pos) { const f = t.includes(':') ? t.split(':').pop() : t; if (isSensitivePath(f)) add('paths.sensitive', eff.paths.sensitive.decision, `${f}: ${eff.paths.sensitive.reason}`); }
  }
  if (isAuditor(agent, eff) && B.install.patterns.some((p) => new RegExp(p, 'i').test(joined))) add('auditors', eff.auditors.decision, `${eff.auditors.reason} (instalação)`);
  return out;
}

function strongest(results) {
  let best = { decision: 'allow', rule: null, reason: null };
  for (const r of results) if (RANK[r.decision] > RANK[best.decision]) best = r;
  return best;
}

function summarize(results) {
  const best = strongest(results);
  if (best.decision === 'allow') return { decision: 'allow', rule: null, reason: null, matches: [] };
  const same = results.filter((r) => r.decision === best.decision);
  const reason = [...new Set(same.map((r) => `[${r.rule}] ${r.reason}`))].join(' · ');
  return { decision: best.decision, rule: best.rule, reason, matches: results };
}

export function evaluateCommand(command, ctx) {
  let segments;
  try { segments = parseCommand(command); } catch (e) {
    if (!(e instanceof ShellParseError)) throw e;
    const U = ctx.eff.bash.unparseable;
    const decision = coarseDestructive(command) ? 'deny' : U.decision;
    return { decision, rule: 'bash.unparseable', reason: `[bash.unparseable] ${U.reason}: ${e.message}`, matches: [] };
  }
  const results = [];
  segments.forEach((seg, i) => results.push(...segmentChecks(seg, segments[i + 1], { ...ctx, fullText: String(command) })));
  return summarize(results);
}

/**
 * Avalia uma chamada de ferramenta. `call`: { tool_name, tool_input, agent_type }.
 * `ctx`: { root, eff }.
 */
export function evaluateToolCall(call, ctx) {
  const tool = call.tool_name;
  const input = call.tool_input ?? {};
  const agent = call.agent_type ?? null;
  const results = [];
  const path = input.file_path ?? input.notebook_path ?? input.path ?? null;
  if (['Read', 'NotebookRead'].includes(tool) && path) {
    const v = checkPath(ctx.root, path, 'read', ctx.eff, agent); if (v) results.push(v);
  } else if (tool === 'Grep') {
    if (path) { const v = checkPath(ctx.root, path, 'read', ctx.eff, agent); if (v) results.push(v); }
    if (input.glob && /(^|[/*])\.env(\b|\*|$)/.test(input.glob) && !/example|sample|template/.test(input.glob)) {
      results.push({ decision: ctx.eff.paths.sensitive.decision, rule: 'paths.sensitive', reason: `glob '${input.glob}': ${ctx.eff.paths.sensitive.reason}` });
    }
  } else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool) && path) {
    const v = checkPath(ctx.root, path, 'write', ctx.eff, agent); if (v) results.push(v);
  } else if (['Bash', 'PowerShell'].includes(tool) && typeof input.command === 'string') {
    return evaluateCommand(input.command, { root: ctx.root, eff: ctx.eff, agent });
  }
  return summarize(results);
}
