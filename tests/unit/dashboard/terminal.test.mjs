// Loop interativo da TUI com streams simulados (harness sem PTY): entra na tela alternativa em raw
// mode, reage a teclas reais (bytes no stdin), redesenha, e ao sair restaura o terminal e libera o
// watcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createTerminal, SEQ } from '../../../scripts/lib/dashboard/tui/terminal.mjs';
import { runDashboard } from '../../../scripts/lib/dashboard/tui/app.mjs';
import { createDemoProject, runDemoSteps, removeDemoProject } from '../../../scripts/lib/dashboard/demo.mjs';
import { createDashboardService } from '../../../scripts/lib/dashboard/index.mjs';

function fakeTty() {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  const raw = [];
  stdin.setRawMode = (v) => { raw.push(v); return stdin; };
  const stdout = new PassThrough();
  stdout.isTTY = true;
  stdout.columns = 100;
  stdout.rows = 30;
  let written = '';
  stdout.on('data', (d) => { written += d.toString('utf8'); });
  return { stdin, stdout, raw, output: () => written };
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test('runDashboard: abre, navega por teclas reais e sai restaurando o terminal', async () => {
  const root = createDemoProject();
  try {
    runDemoSteps(root, { to: 10 });
    const svc = createDashboardService(root, { demo: true, scan: false });
    let stopped = 0;
    const watch = svc.watch.bind(svc);
    svc.watch = (cb) => { const stop = watch(cb); return () => { stopped++; stop(); }; };
    const tty = fakeTty();
    const done = runDashboard(svc, { color: false, terminal: createTerminal({ stdin: tty.stdin, stdout: tty.stdout }) });
    await tick();
    assert.ok(tty.output().startsWith(`${SEQ.altOn}${SEQ.hide}`), 'tela alternativa e cursor oculto');
    assert.deepEqual(tty.raw, [true]);
    assert.match(tty.output(), /\[1 Overview\]/);
    tty.stdin.write('7');
    await tick();
    assert.match(tty.output(), /EVENTOS AO VIVO/);
    tty.stdout.columns = 60;
    tty.stdout.emit('resize');
    await tick();
    assert.match(tty.output(), /7 Eve/, 'redesenha compacto após resize');
    tty.stdin.write('q');
    assert.equal(await done, 0);
    assert.ok(tty.output().endsWith(`${SEQ.reset}${SEQ.show}${SEQ.altOff}`), 'restaura cursor e tela');
    assert.deepEqual(tty.raw, [true, false], 'sai do raw mode');
    assert.equal(stopped, 1, 'watcher liberado');
  } finally { removeDemoProject(root); }
});

test('Ctrl+C também sai limpo', async () => {
  const root = createDemoProject();
  try {
    const svc = createDashboardService(root, { demo: true, scan: false });
    const tty = fakeTty();
    const done = runDashboard(svc, { color: true, terminal: createTerminal({ stdin: tty.stdin, stdout: tty.stdout }) });
    await tick();
    tty.stdin.write(String.fromCharCode(3));
    assert.equal(await done, 0);
    assert.ok(tty.output().endsWith(SEQ.altOff));
  } finally { removeDemoProject(root); }
});
