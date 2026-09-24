// Texto para terminal: largura visível (ignora ANSI, conta largos/combinantes), corte, alinhamento,
// barras e o tema de status. Cor nunca é o único sinal: todo status sai como símbolo + texto (+ cor).
// Só as 16 cores ANSI básicas (funciona sem true color); NO_COLOR/--no-color desligam; --ascii troca
// os símbolos Unicode por ASCII.

const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g');
const RESET = `${ESC}[0m`;

export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}

function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f || (cp >= 0xfe00 && cp <= 0xfe0e)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

/** Largura visível no terminal. */
export function width(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

/** Corta em `n` colunas visíveis (preserva ANSI; fecha com reset se cortou dentro de cor). */
export function truncate(s, n, ellipsis = '…') {
  const str = String(s ?? '');
  if (n <= 0) return '';
  if (width(str) <= n) return str;
  const target = n - width(ellipsis);
  let out = '';
  let w = 0;
  let hadAnsi = false;
  for (let i = 0; i < str.length;) {
    if (str[i] === ESC) {
      const m = str.slice(i).match(new RegExp(`^${ESC}\\[[0-9;?]*[A-Za-z]`));
      if (m) { out += m[0]; i += m[0].length; hadAnsi = true; continue; }
    }
    const cp = str.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const cw = charWidth(cp);
    if (w + cw > target) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  return `${out}${hadAnsi ? `${ESC}[0m` : ''}${ellipsis}`;
}

export function padEnd(s, n) {
  const t = truncate(s, n);
  return t + ' '.repeat(Math.max(0, n - width(t)));
}

export function padStart(s, n) {
  const t = truncate(s, n);
  return ' '.repeat(Math.max(0, n - width(t))) + t;
}

// ------------------------------------------------------------------------------------------------
// Tema
// ------------------------------------------------------------------------------------------------

const CODES = { reset: 0, bold: 1, dim: 2, inverse: 7, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90 };

const UNICODE = { ok: '✓', running: '●', waiting: '◉', pending: '○', failed: '✕', warn: '⚠', blocked: '⚠', unknown: '?', bullet: '•', arrow: '→', down: '▼', h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', barFull: '█', barEmpty: '░', select: '›', tee: '├', elbow: '└' };
const ASCII = { ok: 'v', running: '*', waiting: 'o', pending: '.', failed: 'x', warn: '!', blocked: '!', unknown: '?', bullet: '-', arrow: '->', down: 'v', h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', barFull: '#', barEmpty: '.', select: '>', tee: '+', elbow: '`' };

/** Decide cor pelo ambiente: NO_COLOR, FORCE_COLOR, TERM=dumb, TTY. */
export function colorEnabled({ stream = process.stdout, flag } = {}) {
  if (flag === false) return false;
  if (flag === true) return true;
  if ('NO_COLOR' in process.env && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.env.TERM === 'dumb') return false;
  return !!stream?.isTTY;
}

// Status → [símbolo, cor, rótulo]. O rótulo sempre acompanha o símbolo.
const STATUS = {
  HEALTHY: ['ok', 'green'], READY: ['ok', 'green'], PASS: ['ok', 'green'], ACTIVE: ['ok', 'green'], passed: ['ok', 'green'], completed: ['ok', 'green'], verified: ['ok', 'green'], ok: ['ok', 'green'], allow: ['ok', 'green'],
  ATTENTION: ['warn', 'yellow'], WARN: ['warn', 'yellow'], warn: ['warn', 'yellow'], ask: ['warn', 'yellow'], NOT_READY: ['pending', 'yellow'], INACTIVE: ['warn', 'yellow'],
  DEGRADED: ['failed', 'red'], FAIL: ['failed', 'red'], failed: ['failed', 'red'], error: ['failed', 'red'], deny: ['failed', 'red'],
  BLOCKED: ['blocked', 'red'], blocked: ['blocked', 'red'],
  running: ['running', 'cyan'], in_progress: ['running', 'cyan'], working: ['running', 'cyan'], active: ['running', 'cyan'], in_review: ['running', 'cyan'],
  waiting: ['waiting', 'blue'], assigned: ['waiting', 'blue'], ready: ['waiting', 'blue'],
  pending: ['pending', 'gray'], idle: ['pending', 'gray'], skipped: ['pending', 'gray'], not_run: ['pending', 'gray'], NOT_RUN: ['pending', 'gray'], NOT_CONFIGURED: ['pending', 'gray'], OFF: ['pending', 'gray'], unused: ['pending', 'gray'], cancelled: ['pending', 'gray'], finished: ['ok', 'gray'],
  implemented: ['ok', 'green'], approved: ['ok', 'green'], draft: ['pending', 'gray'], planned: ['pending', 'gray'], archived: ['pending', 'gray'],
  UNKNOWN: ['unknown', 'gray'], UNAVAILABLE: ['unknown', 'gray'], unknown: ['unknown', 'gray'], observed: ['running', 'magenta'],
};

export function createTheme({ color = false, ascii = false } = {}) {
  const sym = ascii ? ASCII : UNICODE;
  const paint = (code, s) => (color ? `${ESC}[${CODES[code]}m${s}${ESC}[0m` : String(s));
  const t = {
    color,
    ascii,
    sym,
    paint,
    bold: (s) => paint('bold', s),
    dim: (s) => paint('dim', s),
    // Os trechos coloridos dentro de `s` terminam em reset (ESC[0m), que também desliga o inverso:
    // reaplica-o depois de cada reset para o realce cobrir a linha inteira.
    inverse: (s) => (color ? `${ESC}[7m${String(s).split(RESET).join(`${RESET}${ESC}[7m`)}${ESC}[27m` : s),
    red: (s) => paint('red', s), green: (s) => paint('green', s), yellow: (s) => paint('yellow', s), cyan: (s) => paint('cyan', s), gray: (s) => paint('gray', s), blue: (s) => paint('blue', s), magenta: (s) => paint('magenta', s),
    /** Símbolo do status (sem texto). */
    icon(status) {
      const [k, c] = STATUS[status] ?? STATUS.unknown;
      return paint(c, sym[k]);
    },
    /** Símbolo + texto, colorido pelo significado. */
    status(status, label = status) {
      const [k, c] = STATUS[status] ?? STATUS.unknown;
      return paint(c, `${sym[k]} ${String(label ?? '').replace(/_/g, ' ')}`);
    },
    /** Barra de progresso com o número ao lado; null → "n/d". */
    bar(percent, n = 20) {
      if (percent === null || percent === undefined) return `${paint('gray', sym.barEmpty.repeat(n))} ${paint('gray', 'n/d')}`;
      const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * n);
      const c = percent >= 80 ? 'green' : percent >= 40 ? 'cyan' : 'yellow';
      return `${paint(c, sym.barFull.repeat(full))}${paint('gray', sym.barEmpty.repeat(n - full))} ${padStart(`${Math.round(percent)}%`, 4)}`;
    },
  };
  return t;
}

// ------------------------------------------------------------------------------------------------
// Formatação de valores
// ------------------------------------------------------------------------------------------------

export function duration(msValue) {
  if (msValue === null || msValue === undefined || !Number.isFinite(msValue)) return '—';
  const s = Math.floor(msValue / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d${String(h % 24).padStart(2, '0')}h`;
}

/** HH:MM:SS local de um ISO. */
export function clock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
}

export function frac(done, total) {
  return total ? `${Number.isInteger(done) ? done : done.toFixed(1)}/${Number.isInteger(total) ? total : total.toFixed(1)}` : '—';
}

/** Linhas de texto em colunas lado a lado (cada coluna com largura fixa). */
export function columns(blocks, widths, gap = 2) {
  const h = Math.max(...blocks.map((b) => b.length));
  const out = [];
  for (let i = 0; i < h; i++) out.push(blocks.map((b, j) => (j === blocks.length - 1 ? truncate(b[i] ?? '', widths[j]) : padEnd(b[i] ?? '', widths[j]))).join(' '.repeat(gap)));
  return out;
}
