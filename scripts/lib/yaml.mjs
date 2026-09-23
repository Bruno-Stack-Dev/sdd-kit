// Parser/serializador de um SUBCONJUNTO de YAML 1.2 — zero dependências (ver docs/adr/ADR-0002).
//
// Suportado: mapas e listas em bloco (indentação por espaços), listas/mapas em fluxo numa linha
// (`[a, b]`, `{a: 1}`), escalares simples, entre aspas simples/duplas, blocos literais `|`/`>`
// (com `-`/`+`), comentários `#`, `---` inicial.
// Rejeitado com erro e número de linha: tabs de indentação, âncoras/aliases (`&`, `*`), tags (`!`),
// chaves complexas (`?`), escalar simples multilinha, coleções em fluxo multilinha, chaves
// duplicadas, múltiplos documentos.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `linha ${line}: ${message}` : message);
    this.line = line;
  }
}

// ---------------------------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------------------------

// BOM (U+FEFF) no início do arquivo é descartado. Escrito por código, não como caractere literal.
const BOM = 0xfeff;
function stripBom(s) {
  return s.charCodeAt(0) === BOM ? s.slice(1) : s;
}

export function parseYaml(text) {
  const src = stripBom(String(text));
  const raw = src.split(/\r?\n/);
  const lines = [];
  let docStarted = false;
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (/^---\s*(#.*)?$/.test(l)) {
      if (docStarted || lines.length) throw new YamlError('múltiplos documentos YAML não são suportados', i + 1);
      docStarted = true;
      continue;
    }
    if (/^\.\.\.\s*$/.test(l)) break;
    lines.push({ n: i + 1, text: l });
  }
  const p = new Parser(lines);
  const value = p.parseDocument();
  return value;
}

class Parser {
  constructor(lines) {
    this.lines = lines;
    this.i = 0;
  }

  // Linha significativa seguinte (pula vazias e só-comentário). Não consome.
  peek() {
    while (this.i < this.lines.length) {
      const { text, n } = this.lines[this.i];
      if (/^\s*(#.*)?$/.test(text)) { this.i++; continue; }
      const indentMatch = text.match(/^( *)/);
      if (text[indentMatch[1].length] === '\t') throw new YamlError('tab de indentação não é permitido (use espaços)', n);
      return { n, text, indent: indentMatch[1].length, content: text.slice(indentMatch[1].length) };
    }
    return null;
  }

  parseDocument() {
    const first = this.peek();
    if (!first) return null;
    if (first.indent !== 0) throw new YamlError('o documento deve começar na coluna 0', first.n);
    const v = this.parseBlock(0);
    const rest = this.peek();
    if (rest) throw new YamlError(`conteúdo inesperado (indentação ${rest.indent})`, rest.n);
    return v;
  }

  parseBlock(indent) {
    const line = this.peek();
    if (!line || line.indent < indent) return null;
    if (line.content.startsWith('- ') || line.content === '-') return this.parseSeq(line.indent);
    return this.parseMap(line.indent);
  }

  parseSeq(indent) {
    const out = [];
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError('indentação inesperada dentro da lista', line.n);
      if (!(line.content.startsWith('- ') || line.content === '-')) break;
      this.i++;
      const rest = line.content === '-' ? '' : line.content.slice(2);
      const restTrim = stripComment(rest, line.n).trim();
      if (restTrim === '') {
        const next = this.peek();
        out.push(next && next.indent > indent ? this.parseBlock(next.indent) : null);
        continue;
      }
      const itemIndent = indent + 2 + (rest.length - rest.trimStart().length);
      if (isMapEntry(restTrim)) {
        // Item de lista que é um mapa: a primeira chave está na mesma linha do "- ".
        // Reinjeta a linha como se estivesse indentada em itemIndent e parseia o mapa.
        this.i--;
        this.lines[this.i] = { n: line.n, text: ' '.repeat(itemIndent) + rest.trimStart() };
        out.push(this.parseMap(itemIndent));
      } else if (restTrim.startsWith('- ')) {
        this.i--;
        this.lines[this.i] = { n: line.n, text: ' '.repeat(itemIndent) + rest.trimStart() };
        out.push(this.parseSeq(itemIndent));
      } else {
        out.push(this.parseInlineValue(rest, line.n, indent));
      }
    }
    return out;
  }

  parseMap(indent) {
    const out = {};
    for (;;) {
      const line = this.peek();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) throw new YamlError('indentação inesperada dentro do mapa', line.n);
      if (line.content.startsWith('- ')) break;
      this.i++;
      const { key, rest } = splitKey(line.content, line.n);
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`chave duplicada '${key}'`, line.n);
      const restTrim = stripComment(rest, line.n).trim();
      if (restTrim === '') {
        const next = this.peek();
        if (next && next.indent > indent) out[key] = this.parseBlock(next.indent);
        else if (next && next.indent === indent && (next.content.startsWith('- ') || next.content === '-')) {
          // Lista "compacta" sob a chave (mesma indentação), comum em YAML.
          out[key] = this.parseSeq(indent);
        } else out[key] = null;
      } else {
        out[key] = this.parseInlineValue(rest, line.n, indent);
      }
    }
    return out;
  }

  // Valor na mesma linha da chave ou do "- ": escalar, fluxo ou bloco literal.
  parseInlineValue(rest, n, parentIndent) {
    const trimmed = rest.trim();
    if (/^[|>][+-]?\s*(#.*)?$/.test(trimmed)) return this.parseBlockScalar(trimmed, parentIndent);
    const v = stripComment(rest, n).trim();
    if (v.startsWith('[') || v.startsWith('{')) {
      const fp = new FlowParser(v, n);
      const val = fp.parseValue();
      fp.skipWs();
      if (fp.pos !== v.length) throw new YamlError(`conteúdo após coleção em fluxo: '${v.slice(fp.pos)}'`, n);
      return val;
    }
    // Escalar simples multilinha é rejeitado: a linha seguinte mais indentada seria continuação.
    const next = this.peek();
    if (next && next.indent > parentIndent && !(v.startsWith('"') || v.startsWith("'"))) {
      if (!isMapEntry(next.content) && !next.content.startsWith('- ')) {
        throw new YamlError('escalar simples em várias linhas não é suportado (use | ou >)', next.n);
      }
    }
    return parseScalar(v, n);
  }

  parseBlockScalar(header, parentIndent) {
    const style = header[0];
    const chomp = header[1] === '-' || header[1] === '+' ? header[1] : '';
    const collected = [];
    let blockIndent = null;
    while (this.i < this.lines.length) {
      const { text, n } = this.lines[this.i];
      if (/^\s*$/.test(text)) { collected.push(''); this.i++; continue; }
      const ind = text.match(/^( *)/)[1].length;
      if (text[ind] === '\t' && blockIndent === null) throw new YamlError('tab de indentação não é permitido', n);
      if (blockIndent === null) {
        if (ind <= parentIndent) break;
        blockIndent = ind;
      }
      if (ind < blockIndent) break;
      collected.push(text.slice(blockIndent));
      this.i++;
    }
    // Linhas vazias finais pertencem ao chomping, não ao conteúdo.
    let trailing = 0;
    while (collected.length && collected[collected.length - 1] === '') { collected.pop(); trailing++; }
    let body;
    if (style === '|') body = collected.join('\n');
    else {
      body = '';
      for (let k = 0; k < collected.length; k++) {
        const cur = collected[k];
        if (k === 0) { body = cur; continue; }
        const prev = collected[k - 1];
        if (cur === '' ) body += '\n';
        else if (prev === '' || /^\s/.test(cur) || /^\s/.test(prev)) body += (prev === '' ? '' : '\n') + cur;
        else body += ' ' + cur;
      }
    }
    if (chomp === '-') return body;
    if (chomp === '+') return body + '\n'.repeat(trailing + 1);
    return collected.length ? body + '\n' : '';
  }
}

function isMapEntry(s) {
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0];
    let k = 1;
    while (k < s.length) {
      if (s[k] === '\\' && q === '"') { k += 2; continue; }
      if (s[k] === q) { if (q === "'" && s[k + 1] === "'") { k += 2; continue; } break; }
      k++;
    }
    return /^\s*:(\s|$)/.test(s.slice(k + 1));
  }
  if (s.startsWith('[') || s.startsWith('{')) return false;
  return /^[^\s#][^#]*?:(\s|$)/.test(s) && !/^(- )/.test(s);
}

function splitKey(content, n) {
  let key, rest;
  if (content.startsWith('"') || content.startsWith("'")) {
    const q = content[0];
    let k = 1;
    let buf = '';
    for (; k < content.length; k++) {
      const c = content[k];
      if (q === '"' && c === '\\') { buf += content.slice(k, k + 2); k++; continue; }
      if (c === q) {
        if (q === "'" && content[k + 1] === "'") { buf += "''"; k++; continue; }
        break;
      }
      buf += c;
    }
    if (k >= content.length) throw new YamlError('chave entre aspas sem fechamento', n);
    key = parseScalar(q + buf + q, n);
    const after = content.slice(k + 1);
    const m = after.match(/^\s*:(\s|$)/);
    if (!m) throw new YamlError(`esperado ':' após a chave ${JSON.stringify(key)}`, n);
    rest = after.slice(m[0].length - (m[1] ? 1 : 0));
  } else {
    if (content.startsWith('?')) throw new YamlError('chaves complexas (?) não são suportadas', n);
    const m = content.match(/^([^:#]+?|[^\s][^#]*?):(\s|$)/);
    if (!m) throw new YamlError(`linha não é 'chave: valor' nem item de lista: '${content}'`, n);
    key = m[1].trim();
    rest = content.slice(m[0].length);
    if (/^[&*!]/.test(key)) throw new YamlError(`âncoras, aliases e tags não são suportados ('${key}')`, n);
  }
  return { key: String(key), rest };
}

// Remove comentário final (" #...") fora de aspas.
function stripComment(s, n) {
  let inS = false, inD = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inD) { if (c === '\\') { k++; continue; } if (c === '"') inD = false; continue; }
    if (inS) { if (c === "'") { if (s[k + 1] === "'") { k++; continue; } inS = false; } continue; }
    if (c === '"') inD = true;
    else if (c === "'") inS = true;
    else if (c === '#' && (k === 0 || /\s/.test(s[k - 1]))) return s.slice(0, k);
  }
  if (inD || inS) throw new YamlError('string entre aspas sem fechamento', n);
  return s;
}

const INT_RE = /^[-+]?(0|[1-9][0-9]*)$/;
const FLOAT_RE = /^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/;

export function parseScalar(v, n) {
  if (v === '' || v === '~' || v === 'null' || v === 'Null' || v === 'NULL') return null;
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new YamlError(`string entre aspas duplas inválida: ${v}`, n);
    return decodeDouble(v.slice(1, -1), n);
  }
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) throw new YamlError(`string entre aspas simples inválida: ${v}`, n);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[&*!]/.test(v)) throw new YamlError(`âncoras, aliases e tags não são suportados ('${v}')`, n);
  if (/^[|>]/.test(v)) throw new YamlError(`bloco literal só é aceito como valor de chave/item ('${v}')`, n);
  if (v === 'true' || v === 'True' || v === 'TRUE') return true;
  if (v === 'false' || v === 'False' || v === 'FALSE') return false;
  if (INT_RE.test(v)) return Number(v);
  if (FLOAT_RE.test(v) && /[.eE]/.test(v)) return Number(v);
  if (v === '.inf' || v === '+.inf') return Infinity;
  if (v === '-.inf') return -Infinity;
  if (v === '.nan') return NaN;
  return v;
}

function decodeDouble(s, n) {
  let out = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '"') throw new YamlError('aspas duplas não escapadas dentro da string', n);
    if (c !== '\\') { out += c; continue; }
    const e = s[++k];
    const map = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', b: '\b', f: '\f', ' ': ' ' };
    if (e in map) out += map[e];
    else if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(k + 1, k + 5), 16)); k += 4; }
    else if (e === 'x') { out += String.fromCharCode(parseInt(s.slice(k + 1, k + 3), 16)); k += 2; }
    else throw new YamlError(`escape inválido \\${e}`, n);
  }
  return out;
}

class FlowParser {
  constructor(s, n) { this.s = s; this.pos = 0; this.n = n; }
  skipWs() { while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++; }
  parseValue() {
    this.skipWs();
    const c = this.s[this.pos];
    if (c === '[') return this.parseSeq();
    if (c === '{') return this.parseMap();
    return this.parseScalarToken();
  }
  parseSeq() {
    this.pos++;
    const out = [];
    this.skipWs();
    if (this.s[this.pos] === ']') { this.pos++; return out; }
    for (;;) {
      out.push(this.parseValue());
      this.skipWs();
      const c = this.s[this.pos];
      if (c === ',') { this.pos++; this.skipWs(); if (this.s[this.pos] === ']') { this.pos++; return out; } continue; }
      if (c === ']') { this.pos++; return out; }
      throw new YamlError('lista em fluxo sem fechamento (coleções em fluxo precisam caber numa linha)', this.n);
    }
  }
  parseMap() {
    this.pos++;
    const out = {};
    this.skipWs();
    if (this.s[this.pos] === '}') { this.pos++; return out; }
    for (;;) {
      this.skipWs();
      const keyTok = this.readToken(':');
      const key = String(parseScalar(keyTok.trim(), this.n));
      if (this.s[this.pos] !== ':') throw new YamlError(`esperado ':' no mapa em fluxo após '${key}'`, this.n);
      this.pos++;
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new YamlError(`chave duplicada '${key}'`, this.n);
      out[key] = this.parseValue();
      this.skipWs();
      const c = this.s[this.pos];
      if (c === ',') { this.pos++; continue; }
      if (c === '}') { this.pos++; return out; }
      throw new YamlError('mapa em fluxo sem fechamento (coleções em fluxo precisam caber numa linha)', this.n);
    }
  }
  parseScalarToken() {
    this.skipWs();
    const tok = this.readToken(',]}');
    return parseScalar(tok.trim(), this.n);
  }
  readToken(stops) {
    const start = this.pos;
    const q = this.s[this.pos];
    if (q === '"' || q === "'") {
      this.pos++;
      while (this.pos < this.s.length) {
        const c = this.s[this.pos];
        if (q === '"' && c === '\\') { this.pos += 2; continue; }
        if (c === q) {
          if (q === "'" && this.s[this.pos + 1] === "'") { this.pos += 2; continue; }
          this.pos++;
          return this.s.slice(start, this.pos);
        }
        this.pos++;
      }
      throw new YamlError('string entre aspas sem fechamento', this.n);
    }
    while (this.pos < this.s.length && !stops.includes(this.s[this.pos])) {
      if (stops.includes(':') && this.s[this.pos] === ':' ) break;
      this.pos++;
    }
    return this.s.slice(start, this.pos);
  }
}

// ---------------------------------------------------------------------------------------------
// Stringify (determinístico, ordem de inserção das chaves)
// ---------------------------------------------------------------------------------------------

export function stringifyYaml(value, { header } = {}) {
  const out = [];
  if (header) for (const h of header.split('\n')) out.push(h ? `# ${h}` : '#');
  emit(value, 0, out);
  return out.join('\n') + '\n';
}

function emit(value, indent, out) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) { out.push(pad + '[]'); return; }
    for (const item of value) emitItem(item, indent, out);
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (!keys.length) { out.push(pad + '{}'); return; }
    for (const k of keys) emitEntry(k, value[k], indent, out);
    return;
  }
  out.push(pad + scalarToYaml(value, indent));
}

function emitEntry(k, v, indent, out) {
  const pad = ' '.repeat(indent);
  const key = keyToYaml(k);
  if (Array.isArray(v)) {
    if (!v.length) { out.push(`${pad}${key}: []`); return; }
    out.push(`${pad}${key}:`);
    for (const item of v) emitItem(item, indent + 2, out);
  } else if (isPlainObject(v)) {
    if (!Object.keys(v).length) { out.push(`${pad}${key}: {}`); return; }
    out.push(`${pad}${key}:`);
    emit(v, indent + 2, out);
  } else {
    out.push(`${pad}${key}: ${scalarToYaml(v, indent)}`);
  }
}

function emitItem(item, indent, out) {
  const pad = ' '.repeat(indent);
  if (isPlainObject(item) && Object.keys(item).length) {
    const sub = [];
    emit(item, indent + 2, sub);
    sub[0] = pad + '- ' + sub[0].slice(indent + 2);
    out.push(...sub);
  } else if (Array.isArray(item) && item.length) {
    const sub = [];
    emit(item, indent + 2, sub);
    sub[0] = pad + '- ' + sub[0].slice(indent + 2);
    out.push(...sub);
  } else {
    const sub = [];
    emit(item, indent + 2, sub);
    out.push(pad + '- ' + sub[0].trimStart(), ...sub.slice(1));
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function keyToYaml(k) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/.test(k) && parseScalar(k) === k ? k : JSON.stringify(k);
}

function scalarToYaml(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '.nan';
    if (v === Infinity) return '.inf';
    if (v === -Infinity) return '-.inf';
    return String(v);
  }
  const s = String(v);
  if (needsQuotes(s)) return JSON.stringify(s);
  return s;
}

function needsQuotes(s) {
  if (s === '') return true;
  if (s !== s.trim()) return true;
  if (/[\n\r\t\0]/.test(s)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: |\s#|:$/.test(s)) return true;
  // Algo que o parser leria como outro tipo (número, bool, null).
  return parseScalar(s) !== s;
}
