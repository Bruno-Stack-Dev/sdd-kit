// `sdd mcp <profiles|apply|check|pin>`
import { UsageError, ICON } from '../lib/cli.mjs';
import { loadProfiles, applyProfile, checkMcpGovernance, pinServer, loadAllowlist } from '../lib/mcp.mjs';
import { loadConfig } from '../lib/config.mjs';

export async function mcpCommand({ positional, flags, root }) {
  const [sub, name] = positional;
  switch (sub) {
    case 'profiles': {
      const profiles = loadProfiles();
      const allow = loadAllowlist().servers;
      if (flags.json) { console.log(JSON.stringify({ profiles, allowlist: Object.keys(allow) }, null, 2)); return 0; }
      for (const [n, p] of Object.entries(profiles)) console.log(`${n.padEnd(11)} ${(p.servers.join(', ') || '—').padEnd(22)} ${p.description}`);
      console.log(`\nallowlist: ${Object.entries(allow).map(([k, v]) => `${k}@${v.version}`).join(', ')}`);
      return 0;
    }
    case 'apply': {
      if (!name) throw new UsageError('uso: mcp apply <perfil> [--dry-run]');
      let r;
      try { r = applyProfile(root, name, { dryRun: !!flags.dryRun }); } catch (e) { throw new UsageError(e.message); }
      if (flags.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
      console.log(`${ICON.ok} perfil '${r.profile}' ${flags.dryRun ? 'simulado' : 'aplicado'}: ${r.servers.join(', ') || 'nenhum servidor'}`);
      if (!flags.dryRun) console.log('  .mcp.json reescrito só com servidores da allowlist; settings.json: enableAllProjectMcpServers=false e enabledMcpjsonServers fixado. Registre em integrations.mcp_profile da config.');
      return 0;
    }
    case 'check': {
      const r = checkMcpGovernance(root, loadConfig(root).config);
      if (flags.json) { console.log(JSON.stringify(r, null, 2)); return r.errors.length ? 1 : 0; }
      for (const e of r.errors) console.log(`${ICON.error} ${e}`);
      for (const w of r.warnings) console.log(`${ICON.warn} ${w}`);
      if (!r.errors.length) console.log(`${ICON.ok} MCP governado (${r.servers.length} servidor(es) na allowlist)`);
      return r.errors.length ? 1 : 0;
    }
    case 'pin': {
      if (!name) throw new UsageError('uso: mcp pin <servidor> [--consent] [--from-file tools.json]');
      let r;
      try { r = pinServer(root, name, { consent: !!flags.consent, fromFile: flags.fromFile ?? null }); } catch (e) { throw new UsageError(e.message); }
      if (flags.json) { console.log(JSON.stringify(r, null, 2)); return r.status === 'drift' || r.status === 'fail' ? 1 : 0; }
      if (r.status === 'not_run') { console.log(`${ICON.notRun} NOT_RUN — ${r.reason}\n  comando: ${r.plan}`); return 0; }
      if (r.status === 'fail') { console.log(`${ICON.error} captura falhou: ${r.reason}`); return 1; }
      console.log(`${r.status === 'drift' ? ICON.error : ICON.ok} ${name}: ${r.tools.length} ferramenta(s), schema ${r.hash.slice(0, 19)}…`);
      if (r.diff) console.log(`  MUDANÇA desde o último pin — novas: ${r.diff.added.join(', ') || '—'} · removidas: ${r.diff.removed.join(', ') || '—'} · alteradas: ${r.diff.changed.join(', ') || '—'}\n  Revise antes de continuar usando o servidor (possível rug pull / tool poisoning).`);
      return r.status === 'drift' ? 1 : 0;
    }
    default:
      throw new UsageError('uso: mcp <profiles|apply <perfil>|check|pin <servidor>>');
  }
}
