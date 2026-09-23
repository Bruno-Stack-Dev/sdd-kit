// Checagens de projeto: config, specs, planos/tarefas, ADRs, estado, padrões proibidos, ledger.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SPEC_STATUS, ADR_STATUS_RE, loadAdrs } from '../specs.mjs';
import { isPlaceholder } from '../config-md.mjs';
import { verifyState } from '../events.mjs';
import { renderLedger, LEDGER_MARKER } from '../project.mjs';
import { checkForbidden } from '../forbidden.mjs';
import { runLint } from '../lint.mjs';

export function checkLint(report, p) {
  const r = runLint(p.root);
  const errs = r.findings.filter((f) => f.level === 'error').map((f) => f.text.replace(/^✖\s*/, ''));
  const warns = r.findings.filter((f) => f.level === 'warn').map((f) => f.text.replace(/^⚠\s*/, ''));
  report.fromIssues('Lint (fast path)', 'lint', `sdd-lint: ${r.checked} item(ns)`, errs, warns);
}

export function checkConfig(report, p) {
  const G = 'Config';
  const { cfg } = p;
  if (cfg.source === 'none') { report.fail(G, 'config.present', 'nenhuma config (sdd.config.yaml) — rode /sdd-init'); return; }
  report.fromIssues(G, 'config.valid', cfg.source === 'yaml' ? 'sdd.config.yaml válido' : 'sdd.config.md (legado) legível', cfg.errors, cfg.warnings);
  if (cfg.source === 'md-legacy') report.warn(G, 'config.legacy', 'config ainda no formato v2 — rode `sdd config migrate`');
  const c = cfg.config;
  if (!c) return;
  // Paths concretos (sem marcador/glob/placeholder) que ainda não existem: aviso (greenfield é normal).
  const missing = [];
  const visit = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v && typeof v === 'object') visit(v, `${prefix}${k}.`);
      else if (typeof v === 'string' && !isPlaceholder(v) && !/[<*{]/.test(v) && !existsSync(join(p.root, v))) missing.push(`paths.${prefix}${k}: ${v}`);
    }
  };
  visit(c.paths, '');
  if (missing.length) report.warn(G, 'config.paths', `${missing.length} path(s) da config ainda não existem`, missing);
  else report.pass(G, 'config.paths', 'paths da config existem');
  const cmds = Object.entries(c.commands ?? {}).filter(([, v]) => typeof v === 'string' && !isPlaceholder(v));
  report.add(G, 'config.commands', cmds.length ? 'pass' : 'warn', cmds.length ? `${cmds.length} comando(s) declarados (${cmds.map(([k]) => k).join(', ')})` : 'nenhum comando real declarado');
}

export function checkSpecs(report, p) {
  const G = 'Specs';
  const errors = [];
  const warnings = [];
  for (const s of p.specs) {
    if (!s.fm) { errors.push({ path: s.file, message: 'sem frontmatter' }); continue; }
    if (!s.id) errors.push({ path: s.file, message: "falta 'spec-id'" });
    if (!SPEC_STATUS.includes(s.status)) errors.push({ path: s.file, message: `status inválido '${s.status}'` });
    const cas = Number(s.cas);
    if (Number.isNaN(cas)) errors.push({ path: s.file, message: "'cas' não é número" });
    else if (cas !== s.caCount) {
      const item = { path: s.file, message: `'cas: ${cas}' mas o corpo tem ${s.caCount} CA(s) numerado(s)` };
      (['implementada', 'aprovada'].includes(s.status) ? errors : warnings).push(item);
    }
    const st = s.id ? p.state.specs[s.id] : null;
    if (s.status === 'implementada') {
      if (st && st.status !== 'implemented') errors.push({ path: s.file, message: `frontmatter 'implementada', mas o estado diz '${st.status}' (sem SPEC_IMPLEMENTED/guardião)` });
      else if (!st && p.state.events > 0) warnings.push({ path: s.file, message: "'implementada' sem trilha no estado (legado?) — rode `sdd tasks sync`" });
    }
  }
  errors.push(...p.specGraph.errors);
  report.fromIssues(G, 'specs.valid', `${p.specs.length} spec(s) válidas, IDs únicos, dependências resolvidas`, errors, warnings);
}

export function checkPlansAndTasks(report, p) {
  const G = 'Planos e tarefas';
  const specIds = new Set(p.specs.map((s) => s.id));
  const orphanPlans = p.plans.filter((pl) => pl.spec && !isPlaceholder(pl.spec) && !specIds.has(pl.spec)).map((pl) => ({ path: pl.file, message: `plano de '${pl.spec}', que não existe` }));
  const noSpec = p.plans.filter((pl) => !pl.spec).map((pl) => ({ path: pl.file, message: "sem 'spec-relacionada'" }));
  report.fromIssues(G, 'plans.orphans', `${p.plans.length} plano(s) ligados a specs existentes`, [...orphanPlans, ...noSpec]);
  report.fromIssues(G, 'tasks.graph', `${p.taskGraph.tasks.size} tarefa(s): grafo sem ciclos, sem órfãs, agentes existentes`, p.taskGraph.errors);
  const drift = [...p.taskGraph.tasks.values()]
    .filter((t) => p.state.tasks[t.id] && t.checkbox !== p.state.tasks[t.id].status)
    .map((t) => `${t.id}: checkbox '${t.checkbox}' × estado '${p.state.tasks[t.id].status}'`);
  report.add(G, 'tasks.drift', drift.length ? 'warn' : 'pass', drift.length ? `${drift.length} checkbox(es) divergem do estado — rode \`sdd tasks sync\`` : 'checkboxes coerentes com o estado', drift);
  const imported = Object.entries(p.state.tasks).filter(([, t]) => t.imported && /-guardian$/.test(t.agent ?? '') && t.status === 'completed').map(([id]) => id);
  if (imported.length) report.warn(G, 'tasks.imported-guardian', `${imported.length} tarefa(s) de guardião concluída(s) por importação v2 (sem evidência)`, imported);
}

export function checkAdrs(report, p, dirs) {
  const G = 'ADRs';
  for (const dir of dirs) {
    if (!existsSync(join(p.root, dir))) continue;
    const adrs = loadAdrs(p.root, dir);
    const errors = [];
    const seen = new Map();
    const ids = new Set(adrs.map((a) => a.id));
    const specIds = new Set(p.specs.map((s) => s.id));
    for (const a of adrs) {
      if (!a.fm) { errors.push({ path: a.file, message: 'sem frontmatter' }); continue; }
      if (!a.id) { errors.push({ path: a.file, message: "falta 'adr-id'" }); continue; }
      if (seen.has(a.id)) errors.push({ path: a.file, message: `adr-id duplicado '${a.id}' (também em ${seen.get(a.id)})` });
      seen.set(a.id, a.file);
      if (!a.file.split('/').pop().startsWith(a.id)) errors.push({ path: a.file, message: `nome do arquivo não começa com o adr-id '${a.id}'` });
      if (!ADR_STATUS_RE.test(a.status ?? '')) errors.push({ path: a.file, message: `status inválido '${a.status}'` });
      const sup = String(a.status ?? '').match(/^superado por (ADR-[\w-]+)$/);
      if (sup && !ids.has(sup[1])) errors.push({ path: a.file, message: `superado por '${sup[1]}', que não existe` });
      const rel = a.fm['spec-relacionada'];
      if (rel && !isPlaceholder(String(rel)) && !/<|NNN/.test(String(rel)) && p.specs.length && !specIds.has(String(rel))) {
        errors.push({ path: a.file, message: `spec-relacionada '${rel}' não existe` });
      }
    }
    report.fromIssues(G, `adrs.${dir}`, `${adrs.length} ADR(s) em ${dir}: IDs, status e referências válidos`, errors);
  }
}

export function checkState(report, p) {
  const G = 'Estado';
  if (!p.log.exists) { report.skip(G, 'state.log', 'sem .sdd/events.jsonl ainda (projeto não registrou eventos)'); return; }
  const v = verifyState(p.root);
  report.fromIssues(G, 'state.coherent', `events.jsonl parseável (${v.log.events.length} eventos), transições válidas, state.json coerente`, v.issues.filter((i) => i.severity === 'error'), v.issues.filter((i) => i.severity !== 'error'));
  const ledgerDir = join(p.root, p.specsDir, '_gerador');
  if (!existsSync(ledgerDir)) return;
  for (const f of readdirSync(ledgerDir).filter((x) => /^LEDGER-.+\.md$/.test(x))) {
    const text = readFileSync(join(ledgerDir, f), 'utf8').replace(/\r\n/g, '\n');
    const slug = f.slice('LEDGER-'.length, -3);
    if (!text.includes(LEDGER_MARKER)) { report.warn(G, `ledger.${slug}`, `${f} escrito à mão (v2) — importe com \`sdd state import-ledger\``); continue; }
    const ok = text === renderLedger(p, { slug });
    report.add(G, `ledger.${slug}`, ok ? 'pass' : 'warn', ok ? `${f} coerente com o estado` : `${f} divergiu do estado — rode \`sdd state ledger\``);
  }
}

export function checkForbiddenPatterns(report, p) {
  const G = 'Padrões proibidos';
  const patterns = p.cfg.config?.forbidden_patterns;
  if (!Array.isArray(patterns)) { report.skip(G, 'forbidden', 'sem config válida'); return; }
  if (!patterns.length) { report.pass(G, 'forbidden', 'nenhum padrão proibido declarado (lista vazia explícita)'); return; }
  const results = checkForbidden(p.root, patterns);
  for (const [i, r] of results.entries()) {
    const title = `/${r.pattern}/ em ${r.scope}: ${r.message}`;
    const status = r.status === 'fail' ? 'fail' : r.status === 'not_run' ? 'not_run' : r.status === 'improved' ? 'warn' : 'pass';
    report.add(G, `forbidden.${i}`, status, title, r.matches);
  }
}

/** Code intelligence: linguagens tipadas detectadas × LSP declarado na config e binários no PATH. */
export async function checkCodeIntelligence(report, p) {
  const G = 'Code intelligence';
  const { detectLanguages } = await import('../lsp.mjs');
  const { languages, unsupported } = detectLanguages(p.root);
  const lsp = p.cfg.config?.integrations?.lsp;
  if (!languages.length) { report.skip(G, 'lsp', 'nenhuma linguagem com plugin LSP oficial detectada'); return; }
  const names = languages.map((l) => l.label).join(', ');
  if (!lsp?.enabled) {
    report.warn(G, 'lsp', `linguagens detectadas (${names}) sem code intelligence habilitado — rode \`sdd lsp detect\``, languages.map((l) => `${l.label}: /plugin install ${l.plugin}`));
    return;
  }
  const missing = languages.filter((l) => !l.binaryFound).map((l) => `${l.label}: binário ${l.binary} ausente (${l.install})`);
  const undeclared = languages.filter((l) => !(lsp.plugins ?? []).includes(l.plugin)).map((l) => `${l.label}: ${l.plugin} não está em integrations.lsp.plugins`);
  report.fromIssues(G, 'lsp', `code intelligence habilitado para ${names}`, [], [...missing, ...undeclared, ...unsupported.map((u) => `${u}: sem plugin oficial (Serena como alternativa)`)]);
}
