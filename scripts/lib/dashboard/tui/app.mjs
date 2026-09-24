// TUI do `sdd dashboard`: navegação por teclado sobre o snapshot. O app é uma máquina de estado de
// UI pura (frame + handleKey), testável sem TTY; `runDashboard` só liga o terminal e o watcher.
// Nenhuma regra de negócio aqui: as telas leem o snapshot e o app só decide o que mostrar.
// Somente leitura: nenhuma tecla altera o projeto (sem kill, sem forçar gate, sem editar política).
import { createTheme, padEnd, truncate, width as vw, clock, frac, duration } from './text.mjs';
import { createTerminal } from './terminal.mjs';
import { FILTERS, applySearch } from './views/common.mjs';
import { overviewView } from './views/overview.mjs';
import { agentsView, tasksView, specsView, qualityView, securityView, eventsView, runtimeView } from './views/lists.mjs';
import { detailView } from './views/details.mjs';

export const TABS = [
  { id: 'overview', label: 'Overview', view: overviewView },
  { id: 'agents', label: 'Agents', view: agentsView },
  { id: 'tasks', label: 'Tasks', view: tasksView },
  { id: 'specs', label: 'Specs', view: specsView },
  { id: 'quality', label: 'Quality', view: qualityView },
  { id: 'security', label: 'Security', view: securityView },
  { id: 'events', label: 'Events', view: eventsView },
  { id: 'runtime', label: 'Runtime', view: runtimeView },
];

export const HELP = [
  ['1–8', 'trocar de tela (Overview, Agents, Tasks, Specs, Quality, Security, Events, Runtime)'],
  ['← →  Tab', 'tela anterior/seguinte (num detalhe, ← volta)'],
  ['↑ ↓  j k', 'navegar · PgUp/PgDn página · Home/End início/fim'],
  ['Enter', 'abrir detalhe da linha selecionada'],
  ['Esc  Backspace', 'voltar / limpar busca'],
  ['w', 'WHY? — por que esta tarefa, requisito ou arquivo existe'],
  ['/', 'buscar na lista atual (Enter confirma, Esc cancela)'],
  ['f', `filtro de eventos: ${FILTERS.map((f) => f.label).join(' → ')}`],
  ['p', 'pausar/retomar o stream (congela o quadro)'],
  ['r', 'refresh completo (relê tudo, git e scans de segurança)'],
  ['?', 'esta ajuda'],
  ['q  Ctrl+C', 'sair'],
];

const tabIndex = (tab) => {
  if (tab === undefined || tab === null || tab === true) return 0;
  const i = TABS.findIndex((x, n) => x.id === tab || String(n + 1) === String(tab));
  return i < 0 ? 0 : i;
};

/**
 * @param {{ getSnapshot: () => object, refresh?: () => void, color?: boolean, ascii?: boolean, tab?: string, now?: () => number }} opts
 */
export function createApp({ getSnapshot, refresh = null, color = false, ascii = false, tab, now = () => Date.now() }) {
  const t = createTheme({ color, ascii });
  const ui = { tab: tabIndex(tab), stack: [], sel: new Map(), top: new Map(), filter: 'all', search: '', searching: false, draft: '', paused: false, frozen: null, help: false, message: null, messageUntil: 0, error: null, lastPage: null, lastBodyH: 10, updatedAt: null };
  const stateKey = () => (ui.stack.length ? `d:${JSON.stringify(ui.stack.at(-1))}` : `t:${ui.tab}`);

  function snapshot() {
    if (ui.paused && ui.frozen) return ui.frozen;
    try {
      const s = getSnapshot();
      if (s !== ui.frozen) { ui.frozen = s; ui.updatedAt = now(); }
      ui.error = null;
      return s;
    } catch (e) {
      ui.error = e.message;
      return ui.frozen;
    }
  }

  function page(s, columns, bodyH) {
    const ctx = { t, width: columns, height: bodyH, ui };
    try {
      const top = ui.stack.at(-1);
      const p = top ? detailView(s, top, ctx) : TABS[ui.tab].view(s, ctx);
      return applySearch(p, ui.search);
    } catch (e) {
      return { head: [t.red(`${t.sym.failed} erro ao desenhar esta tela: ${e.message}`), t.gray('o restante do dashboard continua funcionando — Esc volta, r recarrega')], rows: [], tail: [] };
    }
  }

  function header(s, W) {
    const badges = [t.status(s.health.status)];
    if (s.demo) badges.push(t.inverse(t.yellow(' DEMO DATA ')));
    if (ui.paused) badges.push(t.inverse(t.cyan(' PAUSADO ')));
    const left = `${t.bold('SDD KIT')} ${t.gray(t.sym.bullet)} ${t.bold(s.project.name)}  ${badges.join(' ')}`;
    const git = s.git.available ? `${s.git.branch ?? '?'}${s.git.head ? ` @ ${s.git.head}` : ''}${s.git.dirty ? t.yellow(' *') : ''}` : t.gray('sem git');
    const sess = s.session ? `sessão ${truncate(s.session.id, 14)} · ${duration(s.session.durationMs)}` : t.gray('sem sessão');
    const right = `${git} ${t.gray(t.sym.bullet)} ${sess}`;
    const l1 = vw(left) + vw(right) + 2 <= W ? `${left}${' '.repeat(W - vw(left) - vw(right))}${right}` : truncate(left, W);
    const tb = s.counts.tasksByStatus;
    const l2 = truncate(`${t.gray('Progresso')} ${s.progress.overall.percent === null ? 'n/d' : `${Math.round(s.progress.overall.percent)}%`}  ${t.gray('Req')} ${frac(s.counts.requirementsVerified, s.counts.requirements)}  ${t.gray('Tarefas')} ${frac(tb.completed ?? 0, s.counts.tasks - (tb.cancelled ?? 0))}${tb.blocked ? t.red(` ${t.sym.blocked}${tb.blocked}`) : ''}  ${t.gray('Agentes')} ${s.agents.filter((a) => ['working', 'assigned'].includes(a.status)).length}/${s.agents.length}  ${t.gray('Gate')} ${s.gates.current ? `${s.gates.current.stage}@${s.gates.current.spec}` : '—'}  ${t.gray('Entrega')} ${t.status(s.delivery.status)}`, W);
    return [l1, l2];
  }

  function tabBar(W) {
    const compact = W < 90;
    const parts = TABS.map((x, i) => {
      const label = `${i + 1} ${compact ? x.label.slice(0, 3) : x.label}`;
      return i === ui.tab && !ui.stack.length ? t.inverse(t.bold(color ? ` ${label} ` : `[${label}]`)) : ` ${label} `;
    });
    const crumb = ui.stack.length ? t.gray(`  ${t.sym.arrow} ${ui.stack.map((x) => (x.kind === 'why' ? `why:${x.target.id}` : `${x.kind}:${x.id}`)).join(` ${t.sym.arrow} `)}`) : '';
    return truncate(parts.join('') + crumb, W);
  }

  function footer(W) {
    if (ui.searching) return truncate(`${t.bold('/')}${ui.draft}${t.inverse(' ')}  ${t.gray('Enter confirma · Esc cancela')}`, W);
    const right = `${ui.error ? t.red(`${t.sym.warn} ${ui.error}  `) : ''}${ui.search ? t.yellow(`busca: "${ui.search}"  `) : ''}${ui.updatedAt ? t.gray(`atualizado ${clock(new Date(ui.updatedAt).toISOString())}`) : ''}`;
    const msg = ui.message && now() < ui.messageUntil ? t.cyan(ui.message) : t.gray('↑↓ navegar  ←→ telas  Enter detalhe  Esc voltar  / buscar  f filtro  w por quê  p pausa  r refresh  ? ajuda  q sair');
    const room = W - vw(right) - 1;
    return room > 10 ? `${padEnd(msg, room)} ${right}` : truncate(right, W);
  }

  function selectable(p) {
    return p.rows.map((r, i) => (r.open ? i : -1)).filter((i) => i >= 0);
  }

  function body(p, W, H) {
    const head = p.head.map((l) => truncate(l, W));
    const tail = p.tail.map((l) => truncate(l, W));
    const room = Math.max(1, H - head.length - tail.length);
    const k = stateKey();
    const sel = selectable(p);
    let top = ui.top.get(k) ?? 0;
    let selRow = -1;
    if (sel.length) {
      const si = Math.min(ui.sel.get(k) ?? 0, sel.length - 1);
      ui.sel.set(k, si);
      selRow = sel[si];
      if (selRow < top) top = selRow;
      if (selRow >= top + room) top = selRow - room + 1;
    }
    top = Math.max(0, Math.min(top, Math.max(0, p.rows.length - room)));
    ui.top.set(k, top);
    const visible = p.rows.slice(top, top + room).map((r, i) => {
      const line = truncate(r.text, W - 1);
      if (top + i !== selRow) return line;
      // Marcador no lugar do espaço inicial (sem cortar uma sequência ANSI do começo da linha).
      const marked = truncate(`${t.sym.select}${line.startsWith(' ') ? line.slice(1) : line}`, W - 1);
      return color ? t.inverse(padEnd(marked, W - 1)) : marked;
    });
    while (visible.length < room) visible.push('');
    if (p.rows.length > room) {
      // Indicador de rolagem na última linha visível da lista.
      const more = t.gray(` ${top + 1}–${Math.min(p.rows.length, top + room)} de ${p.rows.length}`);
      visible[room - 1] = padEnd(visible[room - 1], Math.max(0, W - vw(more))) + more;
    }
    return [...head, ...visible, ...tail].slice(0, H);
  }

  function helpBody(W, H) {
    const L = [t.bold(t.cyan(' AJUDA ')) + t.gray(' — somente leitura: nenhuma tecla altera o projeto'), ''];
    for (const [k, d] of HELP) L.push(truncate(`  ${padEnd(t.bold(k), 18)} ${d}`, W));
    L.push('', t.gray('  Status sempre com símbolo + texto:'), `  ${['passed', 'running', 'waiting', 'pending', 'failed', 'blocked'].map((x) => t.status(x)).join('  ')}`, '', t.gray('  qualquer tecla fecha a ajuda'));
    while (L.length < H) L.push('');
    return L.slice(0, H);
  }

  const app = {
    ui,
    TABS,
    /** Quadro completo para um terminal de `columns` × `rows`. */
    frame({ columns, rows }) {
      // Abaixo do mínimo, uma mensagem no tamanho exato do terminal (sem rolar a tela).
      if (columns < 20 || rows < 8) return Array.from({ length: Math.max(1, rows) }, (_, i) => (i === 0 ? truncate('terminal pequeno demais para o dashboard (mín. 20×8) — q sai', Math.max(1, columns)) : ''));
      const W = columns;
      const H = rows;
      try {
        const s = snapshot();
        if (!s) return [t.red('snapshot indisponível'), ui.error ?? '', ...Array(H - 2).fill('')];
        let top;
        try { top = header(s, W); } catch (e) { top = [t.red(`${t.sym.failed} cabeçalho indisponível: ${e.message}`), '']; }
        const bodyH = H - top.length - 2;
        ui.lastBodyH = bodyH;
        let content;
        if (ui.help) content = helpBody(W, bodyH);
        else { const p = page(s, W, bodyH); ui.lastPage = p; content = body(p, W, bodyH); }
        return [...top, tabBar(W), ...content, footer(W)].map((l) => truncate(l, W));
      } catch (e) {
        return [t.red(`${t.sym.failed} erro no dashboard: ${e.message}`), t.gray('q sai · r recarrega'), ...Array(H - 2).fill('')];
      }
    },
    setMessage(msg, ms = 4000) { ui.message = msg; ui.messageUntil = now() + ms; },
    /** @returns {'quit'|undefined} */
    handleKey(str, key = {}) {
      const name = key.name;
      if (key.ctrl && name === 'c') return 'quit';
      if (ui.searching) {
        if (name === 'return' || name === 'enter') { ui.search = ui.draft; ui.searching = false; ui.sel.set(stateKey(), 0); ui.top.set(stateKey(), 0); }
        else if (name === 'escape') ui.searching = false;
        else if (name === 'backspace') ui.draft = ui.draft.slice(0, -1);
        else if (str && !key.ctrl && !key.meta && str.length === 1 && str >= ' ') ui.draft += str;
        return undefined;
      }
      if (ui.help) { ui.help = false; return str === 'q' ? 'quit' : undefined; }
      const k = stateKey();
      const p = ui.lastPage ?? { rows: [] };
      const sel = selectable(p);
      const move = (d) => {
        if (sel.length) ui.sel.set(k, Math.max(0, Math.min(sel.length - 1, (ui.sel.get(k) ?? 0) + d)));
        else ui.top.set(k, Math.max(0, (ui.top.get(k) ?? 0) + d));
      };
      const selected = () => (sel.length ? p.rows[sel[Math.min(ui.sel.get(k) ?? 0, sel.length - 1)]]?.open : null);
      const page = Math.max(1, ui.lastBodyH - 3);
      if (str === 'q') return 'quit';
      if (str === '?') { ui.help = true; return undefined; }
      if (str && /^[1-8]$/.test(str)) { ui.tab = Number(str) - 1; ui.stack = []; ui.search = ''; return undefined; }
      switch (name) {
        case 'up': move(-1); return undefined;
        case 'down': move(1); return undefined;
        case 'pageup': move(-page); return undefined;
        case 'pagedown': move(page); return undefined;
        case 'home': if (sel.length) ui.sel.set(k, 0); else ui.top.set(k, 0); return undefined;
        case 'end': if (sel.length) ui.sel.set(k, sel.length - 1); else ui.top.set(k, Number.MAX_SAFE_INTEGER); return undefined;
        case 'left':
          if (ui.stack.length) ui.stack.pop(); else ui.tab = (ui.tab + TABS.length - 1) % TABS.length;
          return undefined;
        case 'right': if (!ui.stack.length) ui.tab = (ui.tab + 1) % TABS.length; return undefined;
        case 'tab':
          if (!ui.stack.length) ui.tab = key.shift ? (ui.tab + TABS.length - 1) % TABS.length : (ui.tab + 1) % TABS.length;
          return undefined;
        case 'return': case 'enter': { const o = selected(); if (o) ui.stack.push(o); return undefined; }
        case 'escape': case 'backspace':
          if (ui.search) ui.search = '';
          else if (ui.stack.length) ui.stack.pop();
          return undefined;
        default:
      }
      if (str === 'j') { move(1); return undefined; }
      if (str === 'k') { move(-1); return undefined; }
      if (str === 'g') { ui.sel.set(k, 0); ui.top.set(k, 0); return undefined; }
      if (str === 'G') { if (sel.length) ui.sel.set(k, sel.length - 1); return undefined; }
      if (str === '/') { ui.searching = true; ui.draft = ui.search; return undefined; }
      if (str === 'f') {
        const i = FILTERS.findIndex((f) => f.id === ui.filter);
        ui.filter = FILTERS[(i + 1) % FILTERS.length].id;
        app.setMessage(`filtro: ${FILTERS.find((f) => f.id === ui.filter).label}`);
        return undefined;
      }
      if (str === 'p') { ui.paused = !ui.paused; app.setMessage(ui.paused ? 'stream pausado (p retoma)' : 'stream retomado'); return undefined; }
      if (str === 'r') {
        try { refresh?.(); app.setMessage('recarregado'); } catch (e) { app.setMessage(`refresh falhou: ${e.message}`); }
        if (ui.paused) ui.frozen = null;
        return undefined;
      }
      if (str === 'w') {
        const cur = ui.stack.at(-1);
        const o = selected();
        // Num detalhe, "por quê?" explica o item aberto; numa lista, a linha selecionada.
        const why = (x) => x && ['task', 'requirement', 'file'].includes(x.kind);
        const target = why(cur) ? cur : why(o) ? o : null;
        if (target) ui.stack.push(target.kind === 'task' ? { kind: 'why', target } : target);
        else app.setMessage('w: selecione uma tarefa, requisito ou arquivo');
        return undefined;
      }
      return undefined;
    },
  };
  return app;
}

/** Um quadro, sem interação (`sdd dashboard --once`, testes, documentação). */
export function renderOnce(snapshot, { width = 100, height = 40, tab, color = false, ascii = false } = {}) {
  const app = createApp({ getSnapshot: () => snapshot, color, ascii, tab });
  return app.frame({ columns: width, rows: height }).map((l) => l.trimEnd()).join('\n');
}

/** Loop interativo. Resolve com o exit code quando o usuário sai. */
export async function runDashboard(service, { tab, color = true, ascii = false, demo = null, terminal } = {}) {
  const term = terminal ?? createTerminal();
  const app = createApp({ getSnapshot: () => service.getSnapshot(), refresh: () => service.refresh(), color, ascii, tab });
  let pending = null;
  const draw = () => { pending = null; term.draw(app.frame(term.size())); };
  const schedule = () => { if (!pending) pending = setTimeout(draw, 33); };
  term.enter();
  const stopWatch = service.watch(schedule);
  // `demo.start(onStep)` (injetado pelo comando) liga o simulador e devolve a função que o para.
  const stopDemo = demo ? demo.start((st) => { app.setMessage(`DEMO ${Math.min(st.index, st.total)}/${st.total}: ${st.label}`, 5000); schedule(); }) : null;
  const tick = setInterval(schedule, 1000);
  return new Promise((resolve) => {
    let done = false;
    const onTerm = () => finish(0);
    const finish = (code = 0) => {
      if (done) return;
      done = true;
      process.off('SIGTERM', onTerm);
      clearInterval(tick);
      if (pending) clearTimeout(pending);
      stopWatch();
      stopDemo?.();
      term.exit();
      resolve(code);
    };
    term.onKey((str, key) => { if (app.handleKey(str, key) === 'quit') finish(0); else schedule(); });
    term.onResize(schedule);
    process.once('SIGTERM', onTerm);
    draw();
  });
}

