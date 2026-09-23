// Análise léxica de linhas de comando (bash e, no básico, PowerShell) para o policy engine.
//
// Não executa nada. Divide a linha em segmentos (separados por ; && || | & e quebra de linha),
// extrai redirecionamentos, desembrulha prefixos (sudo, env, VAR=x, nohup, time, xargs, command,
// exec) e analisa recursivamente o conteúdo de $(...), `...`, bash -c "...", eval "...",
// powershell -Command "...". Construções que não dá para analisar com segurança lançam
// ShellParseError — o chamador deve tratar como "ask".

export class ShellParseError extends Error {}

const WRAPPERS = new Set(['sudo', 'doas', 'nohup', 'time', 'nice', 'ionice', 'stdbuf', 'command', 'exec', 'builtin', 'env', 'xargs', 'timeout', 'watch']);
const SHELLS_C = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const MAX_DEPTH = 5;

/** Tokeniza respeitando aspas e escapes. Operadores viram tokens { op }. */
export function tokenize(input) {
  const out = [];
  let cur = '';
  let has = false; // houve conteúdo (inclusive aspas vazias) no token atual
  const push = () => { if (has) out.push({ word: cur }); cur = ''; has = false; };
  const nested = [];
  let i = 0;
  const s = String(input);
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      if (s[i + 1] === '\n') { i += 2; continue; }
      cur += s[i + 1]; has = true; i += 2; continue;
    }
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) throw new ShellParseError('aspas simples sem fechamento');
      cur += s.slice(i + 1, j); has = true; i = j + 1; continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = '';
      for (; j < s.length; j++) {
        if (s[j] === '\\' && j + 1 < s.length) { buf += s[j + 1]; j++; continue; }
        if (s[j] === '"') break;
        if (s[j] === '$' && s[j + 1] === '(') {
          const end = matchParen(s, j + 1);
          nested.push(s.slice(j + 2, end));
          buf += s.slice(j, end + 1);
          j = end;
          continue;
        }
        if (s[j] === '`') {
          const end = s.indexOf('`', j + 1);
          if (end < 0) throw new ShellParseError('crase sem fechamento');
          nested.push(s.slice(j + 1, end));
          buf += s.slice(j, end + 1);
          j = end;
          continue;
        }
        buf += s[j];
      }
      if (j >= s.length) throw new ShellParseError('aspas duplas sem fechamento');
      cur += buf; has = true; i = j + 1; continue;
    }
    if (c === '$' && s[i + 1] === '(') {
      const end = matchParen(s, i + 1);
      nested.push(s.slice(i + 2, end));
      cur += s.slice(i, end + 1); has = true; i = end + 1; continue;
    }
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end < 0) throw new ShellParseError('crase sem fechamento');
      nested.push(s.slice(i + 1, end));
      cur += s.slice(i, end + 1); has = true; i = end + 1; continue;
    }
    if (c === '#' && !has) {
      // comentário até o fim da linha
      const nl = s.indexOf('\n', i);
      i = nl < 0 ? s.length : nl;
      continue;
    }
    if (c === '\n' || c === ';') { push(); out.push({ op: ';' }); i++; continue; }
    if (c === '&' && s[i + 1] === '&') { push(); out.push({ op: '&&' }); i += 2; continue; }
    if (c === '|' && s[i + 1] === '|') { push(); out.push({ op: '||' }); i += 2; continue; }
    if (c === '|') { push(); out.push({ op: '|' }); i++; continue; }
    if (c === '&' && s[i + 1] === '>') { push(); out.push({ op: '>', fd: '&' }); i += s[i + 2] === '>' ? 3 : 2; continue; }
    if (c === '&') { push(); out.push({ op: '&' }); i++; continue; }
    if ((c === '<' || c === '>') && s[i + 1] === '(') {
      // process substitution <(cmd) / >(cmd): o comando interno também é analisado
      const end = matchParen(s, i + 1);
      nested.push(s.slice(i + 2, end));
      cur += s.slice(i, end + 1); has = true; i = end + 1; continue;
    }
    if (c === '>' || c === '<') {
      // fd numérico imediatamente antes (2>, 1>>)
      let fd = null;
      if (/^\d$/.test(cur) && has) { fd = cur; cur = ''; has = false; } else push();
      let op = c;
      if (s[i + 1] === c) { op += c; i++; }
      if (s[i + 1] === '&') { i += 2; while (/\d|-/.test(s[i] ?? '')) i++; continue; } // 2>&1: duplicação, sem alvo
      if (s[i + 1] === '|') i++;
      out.push({ op, fd });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}') {
      // agrupamento: trata como separador
      if (!has && (c === '(' || c === ')')) { out.push({ op: ';' }); i++; continue; }
    }
    if (/\s/.test(c)) { push(); i++; continue; }
    cur += c; has = true; i++;
  }
  push();
  return { tokens: out, nested };
}

function matchParen(s, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < s.length; k++) {
    if (s[k] === '(') depth++;
    else if (s[k] === ')') { depth--; if (depth === 0) return k; }
    else if (s[k] === "'") { const j = s.indexOf("'", k + 1); if (j < 0) break; k = j; }
  }
  throw new ShellParseError('substituição $( ) sem fechamento');
}

export function baseName(cmd) {
  return String(cmd).split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');
}

/**
 * Segmentos de comando: [{ argv, cmd, env, wrappers, redirects:[{op, target}], pipeFrom, pipeTo, nested, raw }]
 * `pipeTo` indica que a saída deste segmento vai para o próximo (a | b).
 */
export function parseCommand(input, depth = 0) {
  if (depth > MAX_DEPTH) throw new ShellParseError('aninhamento de shell profundo demais');
  const { tokens, nested } = tokenize(stripHeredocs(String(input)));
  const segments = [];
  let cur = { words: [], redirects: [] };
  let pendingRedirect = null;
  let lastSep = null;
  const finish = (sep) => {
    if (pendingRedirect) throw new ShellParseError('redirecionamento sem alvo');
    if (cur.words.length || cur.redirects.length) {
      cur.pipeFrom = lastSep === '|';
      segments.push(cur);
      if (sep === '|') cur.pipeTo = true;
    }
    lastSep = sep;
    cur = { words: [], redirects: [] };
  };
  for (const t of tokens) {
    if (t.op) {
      if (['>', '>>', '<', '<<'].includes(t.op)) { pendingRedirect = t.op; continue; }
      finish(t.op);
      continue;
    }
    if (pendingRedirect) { cur.redirects.push({ op: pendingRedirect, target: t.word }); pendingRedirect = null; continue; }
    cur.words.push(t.word);
  }
  finish(null);
  const out = [];
  for (const seg of segments) out.push(...normalizeSegment(seg, depth));
  for (const inner of nested) {
    for (const s of parseCommand(inner, depth + 1)) out.push({ ...s, nested: true });
  }
  return out;
}

/** Remove o corpo de heredocs (`<<EOF ... EOF`): é dado de entrada, não comando. */
export function stripHeredocs(s) {
  const lines = s.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const m = lines[i].match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (!m || /<<</.test(lines[i])) continue;
    const delim = m[2];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== delim) j++;
    i = j; // pula o corpo e a linha do delimitador
  }
  return out.join('\n');
}

function normalizeSegment(seg, depth) {
  const env = {};
  const wrappers = [];
  let words = [...seg.words];
  // VAR=valor antes do comando
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    const [k, ...v] = words.shift().split('=');
    env[k] = v.join('=');
  }
  // prefixos que executam o comando seguinte
  while (words.length && WRAPPERS.has(baseName(words[0]))) {
    const w = baseName(words.shift());
    wrappers.push(w);
    // descarta opções do wrapper (sudo -u x, env -i, timeout 10, xargs -0 ...)
    while (words.length && (words[0].startsWith('-') || (w === 'timeout' && /^\d/.test(words[0])) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))) {
      const o = words.shift();
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(o)) { const [k, ...v] = o.split('='); env[k] = v.join('='); }
      else if (['-u', '-g', '-n', '-p', '-C'].includes(o) && (w === 'sudo' || w === 'doas')) words.shift();
    }
  }
  const base = { argv: words, cmd: words.length ? baseName(words[0]) : '', env, wrappers, redirects: seg.redirects, pipeFrom: !!seg.pipeFrom, pipeTo: !!seg.pipeTo, raw: words.join(' ') };
  const result = [base];
  // Shell com -c "…": o texto é outro comando a analisar.
  if (SHELLS_C.has(base.cmd)) {
    const i = words.findIndex((w, k) => k > 0 && /^-[a-z]*c$/.test(w));
    if (i > 0 && words[i + 1] !== undefined) for (const s of parseCommand(words[i + 1], depth + 1)) result.push({ ...s, nested: true });
  }
  if (base.cmd === 'eval' && words.length > 1) for (const s of parseCommand(words.slice(1).join(' '), depth + 1)) result.push({ ...s, nested: true });
  if (['powershell', 'pwsh'].includes(base.cmd)) {
    const i = words.findIndex((w) => /^-(c|command|encodedcommand|e|ec)$/i.test(w));
    if (i > 0) {
      if (/^-(encodedcommand|e|ec)$/i.test(words[i])) throw new ShellParseError('PowerShell -EncodedCommand oculta o comando');
      if (words[i + 1] !== undefined) for (const s of parseCommand(words.slice(i + 1).join(' '), depth + 1)) result.push({ ...s, nested: true });
    }
  }
  if (base.cmd === 'cmd' && words[1] && /^\/[ck]$/i.test(words[1])) {
    for (const s of parseCommand(words.slice(2).join(' '), depth + 1)) result.push({ ...s, nested: true });
  }
  return result;
}

/** Flags curtas agregadas e longas de um argv: `-rf` → {r, f}; `--force` → {force}. */
export function flagSet(argv) {
  const set = new Set();
  for (const a of argv.slice(1)) {
    if (a === '--') break;
    if (a.startsWith('--')) set.add(a.slice(2).split('=')[0]);
    else if (/^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) set.add(ch);
  }
  return set;
}

export function positional(argv) {
  const out = [];
  let endOpts = false;
  for (const a of argv.slice(1)) {
    if (!endOpts && a === '--') { endOpts = true; continue; }
    if (!endOpts && a.startsWith('-') && a !== '-') continue;
    out.push(a);
  }
  return out;
}
