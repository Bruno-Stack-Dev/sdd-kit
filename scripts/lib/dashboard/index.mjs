// Dashboard Core: serviço que mantém o snapshot do projeto em dia, de forma incremental.
//
//   const svc = createDashboardService(root);
//   const snapshot = svc.getSnapshot();      // o mesmo objeto para status, JSON e TUI
//   const stop = svc.watch(() => ...);       // fs.watch + stat de segurança; só relê o que mudou
//
// Recomputação seletiva (o custo fica proporcional ao que mudou):
//   linha nova em events.jsonl   → reducer incremental (mesmas regras do `reduce`) + índice
//   linha nova no trace          → só o índice de atividade
//   specs/, config, agentes      → recarrega definições, referências de teste e textos das specs
//   refresh()                    → tudo, inclusive git e scans de segurança
// O snapshot é recalculado sob demanda e só quando algo mudou. Nunca escreve no projeto.
import { existsSync, readFileSync, statSync, readdirSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import { loadDefinitions, bindState } from '../project.mjs';
import { validateEvent, currentSession } from '../events.mjs';
import { createReducer } from '../state.mjs';
import { Report } from '../doctor/report.mjs';
import { checkSecrets } from '../doctor/security.mjs';
import { isEngineRepo } from '../doctor/engine.mjs';
import { resolveDashboardConfig } from './defaults.mjs';
import { JsonlTail, TraceDirTail, ActivityIndex, normalizeDomain, normalizeTrace, safeDeep } from './event-store.mjs';
import { sanitize } from '../sanitize.mjs';
import { lastAgentScan } from '../../commands/scan.mjs';
import { gitInfo, agentRegistry, runtimeGuards, mcpConfig, evalResults, adrList, scanTestReferences } from './sources.mjs';
import { buildSnapshot } from './snapshot.mjs';
import { parseRequirements } from './traceability.mjs';
import { relToRoot } from '../policy.mjs';

const DEF_DIRS = ['features', 'architecture', 'apis', 'plans', 'tasks', 'decisions'];
const GIT_TTL_MS = 10_000;
const DEFS_CHECK_MS = 10_000; // fs.watch nas specs é o gatilho principal; o stat da árvore é só a rede de segurança

export function isSddProject(root) {
  return ['sdd.config.yaml', 'sdd.config.md', '.sdd', 'specs/_gerador', 'specs/features'].some((p) => existsSync(join(root, p)));
}

/**
 * @param {string} root
 * @param {{ session?: string|null, demo?: boolean, scan?: boolean, now?: () => number, log?: (msg: string) => void }} [opts]
 */
export function createDashboardService(root, { session = null, demo = false, scan = true, now = () => Date.now(), log = () => {} } = {}) {
  const engine = isEngineRepo(root);
  let defs, settings, settingsWarnings, registry, guards, mcpCfg, evals, adrs, specTexts, testRefs, defsSig;
  let secretChecks = null, agentScan = null, git = null, gitAt = 0, lastDefsCheck = 0;
  const testCache = new Map();
  let domainTail, traceTail, reducer, index;
  let dirty = true;
  let cached = null;
  let lastError = null;

  function signature() {
    const parts = [];
    const add = (f) => { try { const s = statSync(f); parts.push(`${f}:${s.size}:${s.mtimeMs}`); } catch { /* ausente */ } };
    add(join(root, 'sdd.config.yaml'));
    add(join(root, 'sdd.config.md'));
    const specsDir = defs?.specsDir ?? 'specs';
    const walk = (dir) => {
      let names;
      try { names = readdirSync(dir); } catch { return; }
      for (const n of names) {
        const f = join(dir, n);
        let s;
        try { s = statSync(f); } catch { continue; }
        if (s.isDirectory()) walk(f);
        else if (n.endsWith('.md')) parts.push(`${f}:${s.size}:${s.mtimeMs}`);
      }
    };
    for (const d of DEF_DIRS) walk(join(root, specsDir, d));
    walk(join(root, '.claude', 'agents'));
    return parts.join('|');
  }

  function loadDefs() {
    defs = loadDefinitions(root);
    const r = resolveDashboardConfig(defs.cfg.config);
    settings = r.settings;
    settingsWarnings = r.warnings;
    registry = agentRegistry(root, defs.cfg.config);
    guards = runtimeGuards(root, defs.cfg.config);
    mcpCfg = mcpConfig(root, defs.cfg.config);
    evals = evalResults(root);
    adrs = adrList(root, defs.specsDir, engine);
    specTexts = new Map();
    for (const s of defs.specs) {
      try { specTexts.set(s.file, readFileSync(join(root, s.file), 'utf8')); } catch { specTexts.set(s.file, ''); }
    }
    const withReqs = defs.specs.filter((s) => s.id).map((s) => ({ id: s.id, requirements: parseRequirements(specTexts.get(s.file)) }));
    try { testRefs = scanTestReferences(root, defs.cfg.config, withReqs, testCache); } catch (e) { testRefs = { refs: new Map(), scanned: 0, basis: `falhou: ${e.message}`, truncated: false }; }
    defsSig = signature();
    lastDefsCheck = now();
    dirty = true;
  }

  function resetActivity() {
    // Mesma leitura do `readEvents`: cauda JSON válida sem quebra de linha conta; não-objeto vira
    // anomalia no reducer.
    domainTail = new JsonlTail(join(root, '.sdd', 'events.jsonl'), { objectsOnly: false, acceptUnterminated: true });
    traceTail = new TraceDirTail(join(root, '.sdd', 'trace'));
    reducer = createReducer({}, validateEvent);
    index = new ActivityIndex({ maxRecent: settings?.events?.max_displayed ?? 500 });
    dirty = true;
  }

  function ingest() {
    const d = domainTail.read();
    const t = traceTail.read();
    if (d.reset || t.reset) {
      log('log encolheu ou foi trocado (rotação/truncamento): relendo do início');
      resetActivity();
      return ingest();
    }
    if (!d.records.length && !t.records.length) return false;
    const batch = [];
    for (const ev of d.records) {
      // Só o que o reducer aceitou entra na atividade: duplicado (merge union) ou rejeitado não
      // conta como retry nem como resultado de teste — aparece nas anomalias do estado.
      if (reducer.push(ev) !== null) continue;
      batch.push(normalizeDomain(ev, (task) => reducer.state.tasks[task]?.agent ?? null));
    }
    for (const rec of t.records) {
      const e = normalizeTrace(rec);
      // Os hooks gravam o caminho como o cliente o passou (em geral absoluto): mostra relativo à raiz.
      const fp = e.attrs['file.path'];
      if (typeof fp === 'string') {
        const rel = relToRoot(root, fp);
        if (rel) { e.attrs['file.path'] = rel; e.summary = e.summary.split(fp).join(rel); }
      }
      batch.push(e);
    }
    batch.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    for (const e of batch) if (!session || e.session === session) index.add(e);
    dirty = true;
    return true;
  }

  function scans() {
    try {
      const report = new Report('security');
      checkSecrets(report, { root });
      secretChecks = report.checks;
    } catch (e) { secretChecks = null; log(`secret scan falhou: ${e.message}`); }
    try { agentScan = lastAgentScan(root); } catch { agentScan = null; }
  }

  function refreshGit(force = false) {
    if (!force && git && now() - gitAt < GIT_TTL_MS) return;
    git = gitInfo(root);
    gitAt = now();
    dirty = true;
  }

  function init() {
    loadDefs();
    resetActivity();
    ingest();
    refreshGit(true);
    if (scan) scans();
  }

  const service = {
    root,
    get settings() { return settings; },
    get lastError() { return lastError; },

    /** Snapshot atual (recalculado só se algo mudou). */
    getSnapshot() {
      if (!dirty && cached) return cached;
      try {
        // Textos do estado (motivos, evidências, comandos) podem vir de logs anteriores ao sanitizer.
        const project = bindState(defs, safeDeep(sanitize(reducer.state)), null);
        cached = buildSnapshot({
          project,
          index,
          registry,
          git,
          guards,
          mcpCfg,
          evals,
          adrs,
          testRefs,
          secretChecks,
          agentScan,
          settings,
          settingsWarnings,
          specTexts,
          logInfo: { invalidDomain: domainTail.invalid.length, invalidTrace: traceTail.invalidCount, truncatedTail: domainTail.truncatedTail },
          now: now(),
          demo,
          scope: { session },
          currentSessionId: currentSession(root),
          engine,
          isSddProject: isSddProject(root),
        });
        lastError = null;
        dirty = false;
      } catch (e) {
        lastError = e;
        log(`snapshot falhou: ${e.stack ?? e.message}`);
        if (!cached) throw e;
      }
      return cached;
    },

    /** Relê só o que mudou. @returns {boolean} houve mudança */
    poll({ definitions = false } = {}) {
      let changed = false;
      try {
        if (domainTail.changed() || traceTail.changed()) changed = ingest() || changed;
        if (definitions || now() - lastDefsCheck >= DEFS_CHECK_MS) {
          lastDefsCheck = now();
          if (signature() !== defsSig) { loadDefs(); changed = true; }
        }
        const before = git;
        refreshGit();
        if (git !== before) changed = true;
      } catch (e) {
        lastError = e;
        log(`poll falhou: ${e.message}`);
      }
      if (changed) dirty = true;
      return changed;
    },

    /** Recarrega tudo (definições, logs, git, scans). */
    refresh() {
      loadDefs();
      resetActivity();
      ingest();
      refreshGit(true);
      if (scan) scans();
      return service.getSnapshot();
    },

    /**
     * Observa o projeto: fs.watch no .sdd/ e nas specs (eventos) + stat periódico de segurança
     * (fs.watch falha em alguns sistemas de arquivos). `onChange` recebe o snapshot novo.
     * @returns {() => void} para parar
     */
    watch(onChange, { intervalMs } = {}) {
      const watchers = [];
      let timer = null;
      let pending = null;
      let defsDirty = false;
      const kick = () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          const definitions = defsDirty;
          defsDirty = false;
          if (service.poll({ definitions })) { try { onChange(service.getSnapshot()); } catch (e) { log(`onChange falhou: ${e.message}`); } }
        }, 80);
      };
      const tryWatch = (dir, opts = {}, onEvent = kick) => {
        if (!existsSync(dir)) return;
        try { const w = fsWatch(dir, opts, onEvent); w.on('error', () => {}); watchers.push(w); } catch { /* sem suporte: fica o stat periódico */ }
      };
      // Mudança em specs/, config ou agentes: recarrega as definições já no próximo poll.
      const defsKick = () => { defsDirty = true; kick(); };
      tryWatch(join(root, '.sdd'));
      tryWatch(join(root, '.sdd', 'trace'));
      tryWatch(join(root, defs?.specsDir ?? 'specs'), { recursive: true }, defsKick);
      tryWatch(join(root, '.claude', 'agents'), {}, defsKick);
      tryWatch(root, {}, (_e, file) => { if (/^sdd\.config\.(yaml|md)$/.test(String(file ?? ''))) defsKick(); });
      timer = setInterval(kick, intervalMs ?? settings?.refresh_ms ?? 1000);
      timer.unref?.();
      return () => {
        clearInterval(timer);
        if (pending) clearTimeout(pending);
        for (const w of watchers) try { w.close(); } catch { /* já fechado */ }
      };
    },
  };

  init();
  return service;
}

