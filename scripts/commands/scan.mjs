// `sdd scan agents [--consent] [--target <caminho>]` — Snyk Agent Scan (opcional).
//
// O agent-scan INICIA servidores MCP stdio e ENVIA configs, nomes/descrições de ferramentas e
// conteúdo de skills para a API da Snyk. Por isso: só com --consent, com SNYK_TOKEN presente e com a
// ferramenta instalada; qualquer ausência = NOT_RUN, sem executar nada. A saída JSON é guardada
// crua em .sdd/reports/ — o kit não depende de campos experimentais (o schema muda entre versões);
// o resultado usa só o exit code do modo --ci.
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UsageError, ICON } from '../lib/cli.mjs';
import { findOnPath } from '../lib/files.mjs';

export const AGENT_SCAN = 'snyk-agent-scan@0.6.4';

export function agentScanPlan(root, target) {
  const t = target ? resolve(root, target) : existsSync(join(root, '.mcp.json')) ? join(root, '.mcp.json') : join(root, '.claude', 'skills');
  return { bin: 'uvx', args: [AGENT_SCAN, 'scan', t, '--json', '--ci'], target: t };
}

export function runAgentScan(root, { consent = false, target = null } = {}) {
  const plan = agentScanPlan(root, target);
  const cmd = `${plan.bin} ${plan.args.join(' ')}`;
  if (!consent) return { status: 'not_run', cmd, reason: 'requer --consent: o scan inicia servidores MCP e envia configs/skills à API da Snyk (rode num container descartável, sem segredos)' };
  if (!process.env.SNYK_TOKEN) return { status: 'not_run', cmd, reason: 'SNYK_TOKEN ausente (exigido pelo agent-scan)' };
  const bin = findOnPath(plan.bin);
  if (!bin) return { status: 'not_run', cmd, reason: 'uvx não instalado (https://docs.astral.sh/uv/)' };
  const r = spawnSync(bin, plan.args, { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin) });
  if (r.error) return { status: 'not_run', cmd, reason: `falha ao executar: ${r.error.message}` };
  const dir = join(root, '.sdd', 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `agent-scan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ tool: AGENT_SCAN, target: plan.target, exit_code: r.status, ran_at: new Date().toISOString(), stdout: r.stdout, stderr: (r.stderr || '').slice(0, 20000) }, null, 2));
  return { status: r.status === 0 ? 'pass' : 'fail', cmd, report: file, exit_code: r.status };
}

/** Último relatório salvo (para o doctor): { status, ran_at, file } ou null. */
export function lastAgentScan(root) {
  const dir = join(root, '.sdd', 'reports');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^agent-scan-.+\.json$/.test(f)).sort();
  if (!files.length) return null;
  try {
    const r = JSON.parse(readFileSync(join(dir, files.at(-1)), 'utf8'));
    return { status: r.exit_code === 0 ? 'pass' : 'fail', ran_at: r.ran_at, file: files.at(-1) };
  } catch { return null; }
}

export async function scanCommand({ positional, flags, root }) {
  if (positional[0] !== 'agents') throw new UsageError('uso: scan agents [--consent] [--target <.mcp.json|dir de skills>]');
  const r = runAgentScan(root, { consent: !!flags.consent, target: flags.target ?? null });
  if (flags.json) { console.log(JSON.stringify(r, null, 2)); return r.status === 'fail' ? 1 : 0; }
  if (r.status === 'not_run') console.log(`${ICON.notRun} NOT_RUN — ${r.reason}\n  comando: ${r.cmd}`);
  else console.log(`${r.status === 'pass' ? ICON.ok : ICON.error} agent-scan ${r.status.toUpperCase()} (exit ${r.exit_code}) — relatório em ${r.report}`);
  return r.status === 'fail' ? 1 : 0;
}
