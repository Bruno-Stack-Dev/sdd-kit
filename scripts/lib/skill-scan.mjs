// Scanner estático de skills (offline, determinístico). Complementa — não substitui — scanners
// dedicados (Cisco skill-scanner). "Sem achados" não prova que a skill é segura.
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { walkFiles, isBinary, relPosix } from './files.mjs';
import { scanText } from './secrets.mjs';

const TEXT_EXT = new Set(['.md', '.txt', '.py', '.js', '.cjs', '.mjs', '.ts', '.sh', '.ps1', '.json', '.yaml', '.yml', '.toml', '.csv', '.html']);
const SCRIPT_EXT = new Set(['.py', '.js', '.cjs', '.mjs', '.ts', '.sh', '.ps1', '.bat', '.cmd', '.rb', '.pl']);

// Caracteres invisíveis/de controle de direção usados para esconder instruções (escritos por código).
const INVISIBLE = new RegExp(`[${[0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].map((c) => String.fromCharCode(c)).join('')}]`);

const RULES = [
  // Instruções dirigidas ao agente que tentam subverter a hierarquia de autoridade.
  { id: 'prompt-injection', severity: 'error', scope: 'text', re: /\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|guidelines)/i },
  { id: 'prompt-injection', severity: 'error', scope: 'text', re: /\b(ignore|desconsidere|esqueça)\s+(todas\s+)?as\s+instruç(ões|oes)\s+(anteriores|acima)/i },
  { id: 'concealment', severity: 'error', scope: 'text', re: /\b(do not|don't|never)\s+(tell|inform|mention to|reveal to)\s+the\s+user\b/i },
  { id: 'concealment', severity: 'error', scope: 'text', re: /\bn(ão|ao)\s+(conte|informe|mencione|revele)\s+(isso\s+)?ao\s+usu[aá]rio\b/i },
  { id: 'secret-access', severity: 'warn', scope: 'any', re: /(^|[\s'"/(])(\.env\b(?!\.example|\.sample|\.template)|~\/\.ssh|id_rsa\b|\.aws\/credentials|\.netrc\b)/ },
  { id: 'exfiltration', severity: 'error', scope: 'any', re: /\b(curl|wget|Invoke-WebRequest)\b[^\n|]*(\$\(|`)[^\n]*(env|cat|secret|token|key)/i },
  { id: 'pipe-to-shell', severity: 'error', scope: 'any', re: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node)\b/i },
  { id: 'dynamic-exec', severity: 'error', scope: 'script', re: /\b(eval|exec)\s*\(\s*(atob|Buffer\.from|base64\.b64decode|codecs\.decode|bytes\.fromhex)/ },
  { id: 'network-call', severity: 'warn', scope: 'script', re: /\b(requests\.(get|post|put)|urllib\.request|http\.client|fetch\(|axios\.|https?\.request\(|net\.connect|socket\.socket|Invoke-WebRequest|curl |wget )/ },
  { id: 'network-call', severity: 'warn', scope: 'script', re: /\b(genai\.Client|OpenAI\(|Anthropic\(|boto3\.client|google\.cloud)\b/ },
  { id: 'process-spawn', severity: 'info', scope: 'script', re: /\b(child_process|subprocess\.(run|Popen|call)|os\.system|execSync|spawnSync)\b/ },
  { id: 'destructive', severity: 'warn', scope: 'any', re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\bshutil\.rmtree\(|\bfs\.rmSync\([^)]*recursive/ },
  { id: 'env-dump', severity: 'warn', scope: 'script', re: /\b(os\.environ(?!\.get|\[)|process\.env(?![.[])|printenv)\b/ },
  { id: 'encoded-blob', severity: 'warn', scope: 'any', re: /[A-Za-z0-9+/]{240,}={0,2}/ },
];

/**
 * Escaneia um diretório de skill (ou pack). Devolve { findings: [{id, severity, file, line}], risk, files }.
 * risk: low (só texto) · medium (tem scripts) · high (scripts com rede/exec dinâmico ou achado de erro).
 */
export function scanSkillDir(dir) {
  const findings = [];
  let hasScripts = false;
  const files = walkFiles(dir, { ignore: new Set(['node_modules', '__pycache__', '.pytest_cache', '.git']) });
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const rel = relPosix(dir, f);
    const isScript = SCRIPT_EXT.has(ext);
    if (isScript) hasScripts = true;
    if (!TEXT_EXT.has(ext) && !isScript) continue;
    let st;
    try { st = statSync(f); } catch { continue; }
    if (st.size > 2 * 1024 * 1024 || isBinary(f)) continue;
    const text = readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    // evals/ contém texto adversarial de propósito (casos de teste): só unicode oculto e segredos.
    const isEval = rel.startsWith('evals/');
    lines.forEach((line, i) => {
      if (INVISIBLE.test(line)) findings.push({ id: 'hidden-unicode', severity: 'error', file: rel, line: i + 1 });
      if (isEval) return;
      for (const r of RULES) {
        if (r.scope === 'script' && !isScript) continue;
        if (r.scope === 'text' && isScript) continue;
        if (r.id === 'encoded-blob' && ext === '.csv') continue; // bases de dados tabulares do pack uiux
        if (r.re.test(line)) findings.push({ id: r.id, severity: r.severity, file: rel, line: i + 1 });
      }
    });
    for (const h of scanText(text)) findings.push({ id: `secret:${h.id}`, severity: h.severity, file: rel, line: h.line });
  }
  const has = (sev) => findings.some((x) => x.severity === sev);
  const riskyScript = findings.some((x) => ['network-call', 'dynamic-exec', 'exfiltration', 'pipe-to-shell'].includes(x.id));
  const risk = has('error') || riskyScript ? 'high' : hasScripts ? 'medium' : 'low';
  return { findings, risk, files: files.length, hasScripts };
}

export function summarizeFindings(findings) {
  const count = { error: 0, warn: 0, info: 0 };
  for (const f of findings) count[f.severity] = (count[f.severity] ?? 0) + 1;
  return count;
}
