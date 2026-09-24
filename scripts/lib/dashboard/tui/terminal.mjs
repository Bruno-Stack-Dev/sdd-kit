// Terminal mínimo para a TUI, sem dependências: tela alternativa, cursor oculto, raw mode, teclas
// (readline.emitKeypressEvents) e resize. Desenho por quadro inteiro, linha a linha com "apagar até
// o fim da linha" — sem limpar a tela a cada quadro (evita cintilação). Restaura o terminal em
// qualquer saída: q, Ctrl+C, SIGTERM, exceção não tratada.
import { emitKeypressEvents } from 'node:readline';

const ESC = String.fromCharCode(27);
export const SEQ = {
  altOn: `${ESC}[?1049h`,
  altOff: `${ESC}[?1049l`,
  hide: `${ESC}[?25l`,
  show: `${ESC}[?25h`,
  home: `${ESC}[H`,
  eol: `${ESC}[K`,
  eos: `${ESC}[J`,
  reset: `${ESC}[0m`,
};

export function createTerminal({ stdin = process.stdin, stdout = process.stdout } = {}) {
  let active = false;
  const keyHandlers = [];
  const resizeHandlers = [];
  const onKeypress = (str, key) => { for (const h of keyHandlers) h(str, key ?? {}); };
  const onResize = () => { for (const h of resizeHandlers) h(); };
  const restore = () => {
    if (!active) return;
    active = false;
    try { stdout.write(`${SEQ.reset}${SEQ.show}${SEQ.altOff}`); } catch { /* stdout fechado */ }
    try { if (stdin.isTTY) stdin.setRawMode(false); } catch { /* já restaurado */ }
    stdin.off('keypress', onKeypress);
    stdout.off('resize', onResize);
    try { stdin.pause(); } catch { /* ignore */ }
  };
  const onExit = () => restore();
  return {
    size: () => ({ columns: stdout.columns || 80, rows: stdout.rows || 24 }),
    enter() {
      if (active) return;
      active = true;
      emitKeypressEvents(stdin);
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.on('keypress', onKeypress);
      stdout.on('resize', onResize);
      stdin.resume();
      stdout.write(`${SEQ.altOn}${SEQ.hide}`);
      process.once('exit', onExit);
    },
    exit() { restore(); process.off('exit', onExit); },
    onKey: (h) => keyHandlers.push(h),
    onResize: (h) => resizeHandlers.push(h),
    /** Desenha um quadro (lista de linhas já cortadas na largura). */
    draw(lines) {
      if (!active) return;
      stdout.write(`${SEQ.home}${lines.map((l) => `${l}${SEQ.reset}${SEQ.eol}`).join('\r\n')}${SEQ.eos}`);
    },
  };
}
