// `sdd status [--json|--verbose|--watch] [--session S] [--demo] [--no-scan]`
// `sdd dashboard [--once] [--tab T] [--width W --height H] [--session S] [--demo] [--ascii]`
// `sdd sessions [--json]`
//
// Os três consomem o mesmo snapshot (scripts/lib/dashboard/): métricas derivadas dos dados do kit,
// sem LLM. Somente leitura — o projeto observado nunca é alterado (exceto o log de diagnóstico
// opcional em .sdd/cache/dashboard.log, com --debug).
import { existsSync, mkdirSync, appendFileSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON } from '../lib/cli.mjs';
import { createDashboardService, isSddProject } from '../lib/dashboard/index.mjs';
import { toStatusJson } from '../lib/dashboard/format/json.mjs';
import { formatStatus } from '../lib/dashboard/format/status.mjs';
import { colorEnabled, createTheme, padEnd, duration } from '../lib/dashboard/tui/text.mjs';
import { createDemoProject, runDemoSteps, removeDemoProject, demoSteps, startDemo } from '../lib/dashboard/demo.mjs';
import { sanitizeString } from '../lib/sanitize.mjs';

const NOT_SDD = (root) => `nenhum projeto SDD em ${root} (sem sdd.config.yaml, specs/ ou .sdd/) — rode /sdd-init, ou experimente \`sdd dashboard --demo\``;

/** Log de diagnóstico (opt-in): sanitizado, limitado a ~1 MB com uma rotação. */
export function debugLogger(root, enabled) {
  if (!enabled || !existsSync(join(root, '.sdd'))) return () => {};
  const file = join(root, '.sdd', 'cache', 'dashboard.log');
  return (msg) => {
    try {
      mkdirSync(join(root, '.sdd', 'cache'), { recursive: true });
      try { if (statSync(file).size > 1024 * 1024) renameSync(file, `${file}.1`); } catch { /* ainda não existe */ }
      appendFileSync(file, `${new Date().toISOString()} ${sanitizeString(msg, 2000)}\n`);
    } catch { /* diagnóstico nunca derruba o dashboard */ }
  };
}

/** Raiz observada: o projeto, ou um projeto sintético novo com --demo (apagado ao sair). */
function resolveTarget({ root, flags }, { runAll = true } = {}) {
  if (!flags.demo) return { root, demo: false, cleanup: () => {} };
  const step = flags.step !== undefined ? Number(flags.step) : Infinity;
  if (flags.step !== undefined && (!Number.isInteger(step) || step < 0)) throw new UsageError(`--step inválido '${flags.step}' (0..${demoSteps().length})`);
  const demoRoot = createDemoProject();
  const cleanup = () => removeDemoProject(demoRoot);
  try {
    if (runAll) runDemoSteps(demoRoot, { to: step });
  } catch (e) { cleanup(); throw e; }
  return { root: demoRoot, demo: true, cleanup };
}

function serviceFor(target, flags) {
  return createDashboardService(target.root, {
    session: flags.session ? String(flags.session) : null,
    demo: target.demo,
    scan: !flags.noScan,
    log: debugLogger(target.root, !!flags.debug && !target.demo),
  });
}

export async function statusCommand(args) {
  const { flags } = args;
  if (!flags.demo && !isSddProject(args.root)) {
    if (flags.json) console.log(JSON.stringify({ schemaVersion: 1, error: 'not_sdd_project', message: NOT_SDD(args.root) }));
    else console.error(`${ICON.error} ${NOT_SDD(args.root)}`);
    return 1;
  }
  const target = resolveTarget(args);
  const svc = serviceFor(target, flags);
  const color = colorEnabled({ flag: flags.noColor ? false : undefined });
  const render = (snap) => (flags.json ? JSON.stringify(toStatusJson(snap), null, 2) : formatStatus(snap, { color, ascii: !!flags.ascii, verbose: !!flags.verbose }));
  if (!flags.watch) {
    try { console.log(render(svc.getSnapshot())); } finally { target.cleanup(); }
    return 0;
  }
  // --watch: redesenha a cada mudança (fs.watch + stat), até Ctrl+C.
  const tty = process.stdout.isTTY && !flags.json;
  const CLEAR = `${String.fromCharCode(27)}[2J${String.fromCharCode(27)}[H`;
  const draw = (snap) => {
    const text = render(snap);
    if (tty) process.stdout.write(`${CLEAR}${text}\n\n${createTheme({ color }).gray(`atualizado ${new Date().toLocaleTimeString()} · Ctrl+C para sair`)}\n`);
    else process.stdout.write(`${text}\n\n`);
  };
  draw(svc.getSnapshot());
  const stop = svc.watch(draw);
  // Mantém o processo vivo mesmo sem nada para observar ainda (projeto sem .sdd/ nem specs/).
  const keepAlive = setInterval(() => {}, 60_000);
  return new Promise((resolve) => {
    const quit = () => { clearInterval(keepAlive); stop(); target.cleanup(); resolve(0); };
    process.once('SIGINT', quit);
    process.once('SIGTERM', quit);
  });
}

export async function sessionsCommand(args) {
  const { flags, root } = args;
  if (!isSddProject(root)) { console.error(`${ICON.error} ${NOT_SDD(root)}`); return 1; }
  const snap = createDashboardService(root, { scan: false }).getSnapshot();
  if (flags.json) { console.log(JSON.stringify({ sessions: snap.sessions }, null, 2)); return 0; }
  if (!snap.sessions.length) { console.log('nenhuma sessão registrada (os hooks gravam SESSION_STARTED e o trace em .sdd/trace/)'); return 0; }
  const t = createTheme({ color: colorEnabled({ flag: flags.noColor ? false : undefined }), ascii: !!flags.ascii });
  console.log(`${padEnd('SESSÃO', 40)} ${padEnd('STATUS', 12)} ${padEnd('INÍCIO', 20)} ${padEnd('DURAÇÃO', 9)} ${padEnd('EVENTOS', 8)} AGENTES  TAREFAS  ARQUIVOS`);
  for (const s of snap.sessions) {
    console.log(`${padEnd(s.id, 40)} ${padEnd(t.status(s.status), 12)} ${padEnd(s.started ? s.started.replace('T', ' ').slice(0, 19) : '—', 20)} ${padEnd(duration(s.durationMs), 9)} ${padEnd(String(s.events), 8)} ${padEnd(String(s.agentsSpawned), 8)} ${padEnd(String(s.tasksTouched), 8)} ${s.filesChanged}`);
  }
  console.log(t.gray('\nfiltre por sessão: sdd status --session <id> · sdd dashboard --session <id>'));
  return 0;
}

export async function dashboardCommand(args) {
  const { flags } = args;
  if (!flags.demo && !isSddProject(args.root)) { console.error(`${ICON.error} ${NOT_SDD(args.root)}`); return 1; }
  const { renderOnce, runDashboard, TABS } = await import('../lib/dashboard/tui/app.mjs');
  if (flags.tab && !TABS.some((t) => t.id === flags.tab || String(TABS.indexOf(t) + 1) === String(flags.tab))) throw new UsageError(`--tab inválido '${flags.tab}' (${TABS.map((t) => t.id).join(' | ')})`);
  // setInterval com NaN/0 vira 1 ms: a simulação inteira rodaria de uma vez.
  const intervalMs = flags.interval !== undefined ? Number(flags.interval) : 900;
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60_000) throw new UsageError(`--interval inválido '${flags.interval}' (inteiro em ms, 100–60000)`);
  if (flags.once) {
    const w0 = Number(flags.width ?? 100), h0 = Number(flags.height ?? 40);
    if (!Number.isInteger(w0) || w0 < 20 || !Number.isInteger(h0) || h0 < 8) throw new UsageError('--width ≥ 20 e --height ≥ 8');
    const target = resolveTarget(args);
    try {
      const svc = serviceFor(target, flags);
      const w = Number(flags.width ?? process.stdout.columns ?? 100);
      const h = Number(flags.height ?? process.stdout.rows ?? 40);
      console.log(renderOnce(svc.getSnapshot(), { width: w, height: h, tab: flags.tab, color: colorEnabled({ flag: flags.noColor ? false : undefined }), ascii: !!flags.ascii }));
    } finally { target.cleanup(); }
    return 0;
  }
  if (!process.stdout.isTTY || !process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    console.error(`${ICON.error} terminal interativo não detectado.\nUse:\n  sdd status\n  sdd status --json\n  sdd status --watch\n  sdd dashboard --once   (um quadro, sem interação)`);
    return 1;
  }
  const target = resolveTarget(args, { runAll: false });
  try {
    const svc = serviceFor(target, flags);
    // Na demo, o simulador (que grava eventos no diretório temporário) é ligado aqui, fora da TUI.
    const demo = target.demo ? { start: (onStep) => startDemo(target.root, { intervalMs, onStep }).stop } : null;
    return await runDashboard(svc, { tab: flags.tab, ascii: !!flags.ascii, color: colorEnabled({ flag: flags.noColor ? false : undefined }), demo });
  } finally { target.cleanup(); }
}
