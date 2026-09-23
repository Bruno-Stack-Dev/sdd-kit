// Checagens de MCP (configuração presente no projeto). A governança completa (perfis, allowlist,
// lock) é verificada por scripts/lib/mcp.mjs quando disponível.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkMcp(report, p) {
  const G = 'MCP';
  const file = join(p.root, '.mcp.json');
  if (!existsSync(file)) { report.pass(G, 'mcp.config', 'sem .mcp.json no projeto (nenhum servidor MCP de projeto)'); return; }
  let cfg;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { report.fail(G, 'mcp.config', `.mcp.json inválido: ${e.message}`); return; }
  const servers = Object.keys(cfg.mcpServers ?? {});
  report.pass(G, 'mcp.config', `.mcp.json válido (${servers.length} servidor(es): ${servers.join(', ') || '—'})`);
  report.warn(G, 'mcp.governance', 'governança de MCP (perfis/allowlist/lock) ainda não verificada neste modo');
}
