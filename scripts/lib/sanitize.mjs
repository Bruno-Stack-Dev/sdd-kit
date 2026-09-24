// Sanitização central de telemetria: o MESMO filtro para eventos (meta), trace, dashboard, logs de
// diagnóstico e exportação OTLP. Duas camadas:
//   1. valor: trechos que parecem segredo viram [REDACTED:<id>] (padrões de scripts/lib/secrets.mjs);
//   2. chave: campos cujo nome é de credencial (authorization, password, token...) têm o valor
//      textual inteiro substituído por [REDACTED], mesmo que o conteúdo não case com nenhum padrão.
// Números e booleanos passam intactos (contagens como `prompt_tokens: 120` não são segredo).
import { redact } from './secrets.mjs';

export const REDACTED = '[REDACTED]';

// O nome da chave TERMINA num termo de credencial, após um separador `.`, `-` ou `_` (ou é o
// próprio termo): `authorization`, `http.authorization`, `X-Api-Key`, `github_token`,
// `DATABASE_PASSWORD`, `client_secret`. Não casa `prompt_tokens`, `sdd.task` nem `tool.use_id`.
const SENSITIVE_KEY = /(^|[._-])(authorization|cookie|password|passwd|pwd|secret|api[_-]?key|token|private[_-]?key|credentials?)$/i;

export function isSensitiveKey(key) {
  return SENSITIVE_KEY.test(String(key));
}

/**
 * Texto seguro para exibir num terminal: remove caracteres de controle C0/C1 (inclusive ESC, que
 * permitiria injetar sequências ANSI vindas de um comando registrado no trace); quebra de linha e
 * tabulação viram espaço.
 */
export function displaySafe(value) {
  const s = String(value ?? '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === 9 || cp === 10 || cp === 13) out += ' ';
    else if (cp < 32 || (cp >= 127 && cp < 160)) continue;
    else out += ch;
  }
  return out;
}

/** Redige segredos num texto e, opcionalmente, trunca em `max` caracteres. */
export function sanitizeString(value, max = Infinity) {
  const s = redact(String(value));
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Cópia sanitizada de um valor qualquer (objeto, lista, texto). Nunca lança.
 * `redactKeys: false` desliga só a camada 2 (por nome de chave): para estruturas cujas chaves são
 * IDs (o estado derivado indexa gates, specs e tarefas pelo nome), onde um gate `no-secret` não é
 * credencial — os valores textuais continuam passando pela camada 1.
 * @param {unknown} value
 * @param {{ maxString?: number, maxArray?: number, maxDepth?: number, redactKeys?: boolean }} [opts]
 */
export function sanitize(value, { maxString = Infinity, maxArray = Infinity, maxDepth = 8, redactKeys = true } = {}, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value, maxString);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (depth >= maxDepth) return '[…]';
  const opts = { maxString, maxArray, maxDepth, redactKeys };
  if (Array.isArray(value)) {
    const out = value.slice(0, maxArray).map((v) => sanitize(v, opts, depth + 1));
    if (value.length > maxArray) out.push(`[+${value.length - maxArray}]`);
    return out;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactKeys && isSensitiveKey(k) && (typeof v === 'string' || typeof v === 'object') && v !== null ? REDACTED : sanitize(v, opts, depth + 1);
    }
    return out;
  }
  return sanitizeString(String(value), maxString);
}
