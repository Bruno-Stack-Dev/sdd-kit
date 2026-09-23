// Detecção de segredos e de arquivos sensíveis — usada pelo doctor, pelos hooks, pelo export de
// contexto e pela redação de logs. Best-effort: não substitui um scanner dedicado.
//
// Linha com o marcador `sdd-secrets: allow` é ignorada (para exemplos documentados).

export const SECRET_PATTERNS = [
  { id: 'private-key', severity: 'error', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'aws-access-key', severity: 'error', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', severity: 'error', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'github-fine-grained', severity: 'error', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { id: 'anthropic-key', severity: 'error', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'openai-key', severity: 'error', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'slack-token', severity: 'error', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', severity: 'error', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-live-key', severity: 'error', re: /\b[rs]k_live_[0-9A-Za-z]{20,}\b/ },
  { id: 'npm-token', severity: 'error', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'jwt', severity: 'warn', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'connection-string-password', severity: 'warn', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s]+/i },
  { id: 'generic-assignment', severity: 'warn', re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];

const ALLOW_MARK = 'sdd-secrets: allow';

/** Procura segredos num texto. Devolve [{ id, severity, line }]. */
export function scanText(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(ALLOW_MARK)) return;
    for (const p of SECRET_PATTERNS) if (p.re.test(line)) hits.push({ id: p.id, severity: p.severity, line: i + 1 });
  });
  return hits;
}

/** Substitui trechos que parecem segredo por [REDACTED:<id>]. */
export function redact(text) {
  let out = String(text);
  for (const p of SECRET_PATTERNS) out = out.replace(new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g'), `[REDACTED:${p.id}]`);
  return out;
}

// Caminhos que nunca devem ser lidos, versionados ou exportados.
const SENSITIVE_BASENAME = [
  /^\.env$/,
  /^\.env\.(?!example$|sample$|template$|dist$|defaults$)[^/]+$/,
  /^.*\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /^credentials(\.json)?$/i,
  /^\.netrc$/,
  /^\.pgpass$/,
  /^.*service[-_]?account.*\.json$/i,
  /^secrets?\.(ya?ml|json|toml)$/i,
];
const SENSITIVE_PATH = [/(^|\/)\.ssh\//, /(^|\/)\.aws\/credentials$/, /(^|\/)\.docker\/config\.json$/, /(^|\/)secrets\//i, /(^|\/)\.gnupg\//];
// Chaves públicas e exemplos não são segredo.
const NOT_SENSITIVE = [/\.pub$/, /\.example$/, /\.sample$/, /\.template$/];

export function isSensitivePath(p) {
  const posix = String(p).replace(/\\/g, '/');
  const base = posix.split('/').pop();
  if (NOT_SENSITIVE.some((re) => re.test(base))) return false;
  return SENSITIVE_BASENAME.some((re) => re.test(base)) || SENSITIVE_PATH.some((re) => re.test(posix));
}
