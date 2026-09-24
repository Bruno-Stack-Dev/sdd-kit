// TUI: texto (largura/ANSI), tema sem cor e ASCII, e o app como máquina de estado de UI —
// navegação, detalhe, busca, filtro, pausa, ajuda, resize e error boundary — sem TTY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { width, truncate, padEnd, stripAnsi, createTheme, colorEnabled } from '../../../scripts/lib/dashboard/tui/text.mjs';
import { createApp, renderOnce, TABS } from '../../../scripts/lib/dashboard/tui/app.mjs';
import { createDemoProject, runDemoSteps, removeDemoProject } from '../../../scripts/lib/dashboard/demo.mjs';
import { createDashboardService } from '../../../scripts/lib/dashboard/index.mjs';

const ESC = String.fromCharCode(27);
let snap;
let root;
function demoSnapshot() {
  if (!snap) {
    root = createDemoProject();
    runDemoSteps(root, { to: 13 });
    snap = createDashboardService(root, { demo: true, scan: false }).getSnapshot();
    removeDemoProject(root);
  }
  return snap;
}

test('texto: largura ignora ANSI e conta caracteres largos; corte preserva a largura', () => {
  const red = `${ESC}[31mabc${ESC}[0m`;
  assert.equal(width(red), 3);
  assert.equal(width('日本'), 4);
  assert.equal(width('✓ ok'), 4);
  assert.equal(width(truncate('abcdefghij', 5)), 5);
  assert.equal(stripAnsi(truncate(`${ESC}[31mabcdefghij${ESC}[0m`, 4)), 'abc…');
  assert.equal(width(padEnd('ação', 8)), 8);
});

test('tema: sem cor não emite ANSI; ASCII troca símbolos; status sempre com texto', () => {
  const t = createTheme({ color: false, ascii: true });
  assert.equal(t.status('passed'), 'v passed');
  assert.equal(t.status('NOT_READY'), '. NOT READY');
  assert.ok(!t.bar(50).includes(ESC));
  assert.equal(createTheme({ color: true }).status('failed').includes(ESC), true);
  const prev = process.env.NO_COLOR;
  process.env.NO_COLOR = '1';
  try { assert.equal(colorEnabled({ stream: { isTTY: true } }), false); } finally { if (prev === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prev; }
});

test('renderOnce: cabeçalho, abas, DEMO DATA e dimensões exatas', () => {
  const s = demoSnapshot();
  const out = renderOnce(s, { width: 100, height: 30 }).split('\n');
  assert.equal(out.length, 30);
  assert.ok(out.every((l) => width(l) <= 100));
  assert.match(out[0], /DEMO DATA/);
  assert.match(out[2], /\[1 Overview\]/);
  assert.ok(!out.join('').includes(ESC), 'sem cor, sem ANSI');
  for (const tab of TABS) assert.ok(renderOnce(s, { width: 80, height: 24, tab: tab.id }).split('\n').length === 24, tab.id);
});

test('terminal pequeno: layout compacto, sem estourar a largura', () => {
  const s = demoSnapshot();
  for (const [w, h] of [[40, 12], [60, 20], [160, 50]]) {
    const out = renderOnce(s, { width: w, height: h }).split('\n');
    assert.equal(out.length, h, `${w}x${h}`);
    assert.ok(out.every((l) => width(l) <= w), `${w}x${h} largura`);
  }
  assert.match(renderOnce(s, { width: 60, height: 20 }).split('\n')[2], /1 Ove/, 'abas abreviadas');
});

test('navegação: abas, seleção, Enter/Esc, w (por quê?), ajuda e sair', () => {
  const app = createApp({ getSnapshot: demoSnapshot });
  const size = { columns: 110, rows: 40 };
  const frame = () => app.frame(size).join('\n');
  frame();
  app.handleKey('3', {});
  assert.match(frame(), /GRAFO DE TAREFAS/);
  app.handleKey(undefined, { name: 'down' });
  frame();
  app.handleKey(undefined, { name: 'return' });
  assert.match(frame(), /DEPENDE DE/, 'detalhe da tarefa');
  app.handleKey('w', {});
  assert.match(frame(), /WHY\? DEMO-100\/T-001/);
  app.handleKey(undefined, { name: 'escape' });
  app.handleKey(undefined, { name: 'escape' });
  assert.match(frame(), /GRAFO DE TAREFAS/);
  app.handleKey(undefined, { name: 'right' });
  assert.equal(app.ui.tab, 3);
  app.handleKey('?', {});
  assert.match(frame(), /AJUDA/);
  app.handleKey('x', {});
  assert.doesNotMatch(frame(), /AJUDA/);
  assert.equal(app.handleKey('q', {}), 'quit');
  assert.equal(app.handleKey(undefined, { name: 'c', ctrl: true }), 'quit');
});

test('busca, filtro de eventos e pausa do stream', () => {
  let current = demoSnapshot();
  const app = createApp({ getSnapshot: () => current });
  const size = { columns: 110, rows: 40 };
  app.handleKey('7', {});
  app.frame(size);
  app.handleKey('/', {});
  for (const ch of 'POLICY') app.handleKey(ch, {});
  app.handleKey(undefined, { name: 'return' });
  const found = app.frame(size).join('\n');
  assert.match(found, /POLICY_DENY/);
  assert.doesNotMatch(found, /FILE_WRITE /);
  app.handleKey(undefined, { name: 'escape' });
  app.handleKey('f', {});
  assert.equal(app.ui.filter, 'errors');
  assert.match(app.frame(size).join('\n'), /filtro: erros/);
  app.handleKey('p', {});
  const frozen = app.frame(size).join('\n');
  current = { ...current, project: { ...current.project, name: 'Outro nome' } };
  assert.match(app.frame(size).join('\n'), /PAUSADO/);
  assert.equal(app.frame(size)[0], frozen.split('\n')[0], 'pausado: quadro congelado');
  app.handleKey('p', {});
  assert.match(app.frame(size)[0], /Outro nome/);
});

test('error boundary: tela que quebra não derruba o dashboard', () => {
  const s = demoSnapshot();
  const broken = { ...s, agents: null };
  const app = createApp({ getSnapshot: () => broken });
  app.handleKey('2', {});
  const out = app.frame({ columns: 100, rows: 24 }).join('\n');
  assert.match(out, /erro ao desenhar esta tela/);
  assert.equal(app.frame({ columns: 100, rows: 24 }).length, 24);
  const failing = createApp({ getSnapshot: () => { throw new Error('boom'); } });
  assert.match(failing.frame({ columns: 80, rows: 10 }).join('\n'), /snapshot indisponível/);
});

test('terminal menor que o mínimo: mensagem no tamanho exato, sem rolar a tela', () => {
  const app = createApp({ getSnapshot: demoSnapshot });
  const out = app.frame({ columns: 18, rows: 5 });
  assert.equal(out.length, 5);
  assert.ok(out.every((l) => width(l) <= 18));
  assert.match(out[0], /terminal pequeno/);
});

test('linha selecionada com cor mantém as sequências ANSI íntegras', () => {
  const app = createApp({ getSnapshot: demoSnapshot, color: true });
  app.handleKey('3', {});
  const frame = app.frame({ columns: 100, rows: 30 }).join('\n');
  assert.ok(!/›\[/.test(frame), 'o marcador não comeu o ESC');
});
