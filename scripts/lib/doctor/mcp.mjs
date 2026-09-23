// Checagens de MCP: servidores só da allowlist, sem drift de comando/versão, sem auto-habilitação
// global, perfil coerente com a config e schema de ferramentas fixado. Não executa nenhum servidor.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkMcpGovernance, loadAllowlist, loadProfiles } from '../mcp.mjs';

export function checkMcp(report, p) {
  const G = 'MCP';
  let allow;
  try { allow = loadAllowlist(); loadProfiles(); } catch (e) { report.fail(G, 'mcp.catalog', `allowlist/perfis do motor ilegíveis: ${e.message}`); return; }
  report.pass(G, 'mcp.catalog', `allowlist com ${Object.keys(allow.servers).length} servidor(es) aprovado(s) e perfis carregados`);
  const r = checkMcpGovernance(p.root, p.cfg.config);
  if (!existsSync(join(p.root, '.mcp.json')) && !r.errors.length) {
    report.pass(G, 'mcp.governance', 'sem .mcp.json no projeto (nenhum servidor MCP de projeto)');
    return;
  }
  report.fromIssues(G, 'mcp.governance', `${r.servers.length} servidor(es) no .mcp.json, todos governados (allowlist, versão fixada, sem drift)`, r.errors, r.warnings);
}
