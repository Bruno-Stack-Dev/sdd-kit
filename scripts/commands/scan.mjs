// `sdd scan agents [--consent] [--run-mcp-servers] [--target <caminho>]` — Snyk Agent Scan (opcional).
//
// O agent-scan INICIA servidores MCP stdio e ENVIA configs, nomes/descrições de ferramentas e
// conteúdo de skills para a API da Snyk. Por isso: só com --consent e --run-mcp-servers, com SNYK_TOKEN
// presente e com a ferramenta instalada; qualquer ausência = NOT_RUN, sem executar nada. A saída JSON
// é guardada crua em .sdd/reports/ — o kit não depende de campos experimentais (o schema muda entre
// versões); o resultado usa só o exit code do modo --ci.
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UsageError, ICON } from '../lib/cli.mjs';
import { findOnPath } from '../lib/files.mjs';
import { redact } from '../lib/secrets.mjs';

export const AGENT_SCAN = 'snyk-agent-scan@0.6.4';

// Em modo --ci a própria ferramenta exige confirmar que pode iniciar cada servidor MCP stdio do alvo.
export const RUN_MCP_FLAG = '--dangerously-run-mcp-servers';

export function agentScanPlan(root, target) {
  const t = target ? resolve(root, target) : existsSync(join(root, '.mcp.json')) ? join(root, '.mcp.json') : join(root, '.claude', 'skills');
  return { bin: 'uvx', args: [AGENT_SCAN, 'scan', t, '--json', '--ci', RUN_MCP_FLAG], target: t };
}

/**
 * Duas confirmações distintas: --consent (enviar configs/skills à API da Snyk) e --run-mcp-servers
 * (deixar a ferramenta executar os servidores MCP stdio do alvo — só em ambiente descartável).
 */
export function runAgentScan(root, { consent = false, runMcpServers = false, target = null } = {}) {
  const plan = agentScanPlan(root, target);
  const cmd = `${plan.bin} ${plan.args.join(' ')}`;
  if (!consent) return { status: 'not_run', cmd, reason: 'requer --consent: o scan inicia servidores MCP e envia configs/skills à API da Snyk (rode num container descartável, sem segredos)' };
  if (!runMcpServers) return { status: 'not_run', cmd, reason: `requer também --run-mcp-servers: em modo --ci o agent-scan exige ${RUN_MCP_FLAG}, pois executa cada servidor MCP stdio do alvo (use só em ambiente descartável)` };
  if (!process.env.SNYK_TOKEN) return { status: 'not_run', cmd, reason: 'SNYK_TOKEN ausente (exigido pelo agent-scan)' };
  const bin = findOnPath(plan.bin);
  if (!bin) return { status: 'not_run', cmd, reason: 'uvx não instalado (https://docs.astral.sh/uv/)' };
  const r = spawnSync(bin, plan.args, { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin) });
  if (r.error) return { status: 'not_run', cmd, reason: `falha ao executar: ${r.error.message}` };
  const cls = classifyScan(r.status, r.stdout);
  const dir = join(root, '.sdd', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `agent-scan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ tool: AGENT_SCAN, target: plan.target, exit_code: r.status, status: cls.status, reason: cls.reason ?? null, ran_at: new Date().toISOString(), stdout: r.stdout, stderr: (r.stderr || '').slice(0, 20000) }, null, 2));
  const res = { ...cls, cmd, report: file, exit_code: r.status };
  // Num runner descartável o relatório some com a máquina: sem PASS, o diagnóstico vai para a saída.
  if (res.status !== 'pass') res.diagnostic = tailOutput(r.stderr, r.stdout);
  return res;
}

/**
 * PASS = exit 0. FAIL = achados reais (ou saída que não dá para interpretar). NOT_RUN = o scanner saiu
 * com erro de execução (cota, autenticação, rede) sem nenhum achado: não houve análise, então não é
 * aprovação nem reprovação.
 */
export function classifyScan(exitCode, stdout) {
  if (exitCode === 0) return { status: 'pass' };
  const { errors, issues } = parseScanJson(stdout);
  if (errors.length && !issues.length) return { status: 'not_run', reason: `o scanner não conseguiu analisar: ${redact(errors[0].message)}` };
  return { status: 'fail' };
}

// Progresso do uv/uvx no stderr (instalação da ferramenta) não diz nada sobre o resultado do scan.
const UV_NOISE = /^\s*(Downloading|Downloaded|Installed|Resolved|Prepared|Building|Built|Uninstalled|Audited)\b/;

/**
 * Diagnóstico da falha, com segredos redigidos: resumo do JSON do stdout (erros e achados, sem depender
 * do schema exato, que muda entre versões) + as últimas linhas úteis do stderr.
 */
export function tailOutput(stderr, stdout, lines = 40) {
  const clean = (t) => redact(String(t ?? '')).split(/\r?\n/).filter((l) => l.trim() && !UV_NOISE.test(l));
  const parts = [];
  const summary = summarizeScanJson(stdout);
  if (summary.length) parts.push('stdout (resumo do JSON):', ...summary.map((l) => `  ${redact(l)}`));
  else if (clean(stdout).length) parts.push('stdout (últimas linhas):', ...clean(stdout).slice(-lines).map((l) => `  ${l}`));
  const err = clean(stderr).slice(-lines);
  if (err.length) parts.push('stderr (últimas linhas):', ...err.map((l) => `  ${l}`));
  return parts.join('\n') || '(o scanner não produziu saída)';
}

/**
 * Mensagens de erro e achados (`issues`) de qualquer ponto do JSON, sem depender do schema exato.
 * Devolve { parsed, data, errors: [{path, message}], issues: [{code, message, where}] }.
 */
export function parseScanJson(text) {
  const empty = { parsed: false, data: null, errors: [], issues: [] };
  const t = String(text ?? '');
  const start = t.search(/[[{]/);
  if (start < 0) return empty;
  let data;
  try { data = JSON.parse(t.slice(start)); } catch { return empty; }
  const errors = [];
  const issues = [];
  const cut = (s) => String(s).replace(/\s+/g, ' ').slice(0, 200);
  const walk = (v, path) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if (/^(error|errors|error_message|message)$/i.test(k) && typeof val === 'string' && val.trim()) errors.push({ path: `${path ? `${path}.` : ''}${k}`, message: cut(val) });
      if (/^issues$/i.test(k) && Array.isArray(val)) {
        for (const is of val) {
          const where = is?.reference ?? is?.location ?? is?.server ?? is?.tool ?? '';
          issues.push({ code: is?.code ?? is?.id ?? is?.type ?? '?', message: cut(is?.message ?? is?.description ?? is?.title ?? ''), where: where ? cut(typeof where === 'string' ? where : JSON.stringify(where)) : '' });
        }
      } else walk(val, path ? `${path}.${k}` : k);
    }
  };
  walk(data, '');
  return { parsed: true, data, errors, issues };
}

/** Resumo legível de parseScanJson. Vazio se não for JSON. */
export function summarizeScanJson(text, max = 25) {
  const { parsed, data, errors, issues } = parseScanJson(text);
  if (!parsed) return [];
  const out = [];
  if (errors.length) out.push(`erros (${errors.length}):`, ...errors.slice(0, max).map((e) => `  ${e.path}: ${e.message}`));
  if (issues.length) out.push(`achados (${issues.length}):`, ...issues.slice(0, max).map((e) => `  [${e.code}] ${e.message}${e.where ? ` (${e.where})` : ''}`));
  if (!out.length) out.push(`JSON sem erros nem achados reconhecíveis; chaves de topo: ${Object.keys(Array.isArray(data) ? data[0] ?? {} : data).join(', ') || '(nenhuma)'}`);
  return out;
}

/** Último relatório salvo (para o doctor): { status, reason, ran_at, file } ou null. */
export function lastAgentScan(root) {
  const dir = join(root, '.sdd', 'reports');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^agent-scan-.+\.json$/.test(f)).sort();
  if (!files.length) return null;
  try {
    const r = JSON.parse(readFileSync(join(dir, files.at(-1)), 'utf8'));
    // Relatórios antigos não têm `status`: vale o exit code.
    return { status: r.status ?? (r.exit_code === 0 ? 'pass' : 'fail'), reason: r.reason ?? null, ran_at: r.ran_at, file: files.at(-1) };
  } catch { return null; }
}

export async function scanCommand({ positional, flags, root }) {
  if (positional[0] !== 'agents') throw new UsageError('uso: scan agents [--consent] [--run-mcp-servers] [--target <.mcp.json|dir de skills>]');
  const r = runAgentScan(root, { consent: !!flags.consent, runMcpServers: !!flags.runMcpServers, target: flags.target ?? null });
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return r.status === 'fail' ? 1 : 0; }
  if (r.status === 'not_run') console.log(`${ICON.notRun} NOT_RUN — ${r.reason}\n  comando: ${r.cmd}`);
  else console.log(`${r.status === 'pass' ? ICON.ok : ICON.error} agent-scan ${r.status.toUpperCase()} (exit ${r.exit_code}) — relatório em ${r.report}`);
  if (r.diagnostic) console.log(`  saída do scanner (segredos redigidos):\n${r.diagnostic.replace(/^/gm, '    ')}`);
  return r.status === 'fail' ? 1 : 0;
}
