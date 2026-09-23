// `sdd policy check --tool <T> (--command "<cmd>" | --file <caminho>) [--agent A] [--json]`
// `sdd security sandbox [--enable|--show] [--force]`
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON, timestampSlug } from '../lib/cli.mjs';
import { loadPolicy, effectivePolicy, evaluateToolCall } from '../lib/policy.mjs';
import { loadConfig } from '../lib/config.mjs';

export async function policyCommand({ positional, flags, root }) {
  if (positional[0] !== 'check') throw new UsageError('uso: policy check --tool <Bash|Read|Write|Edit|Grep> (--command "..." | --file <caminho>) [--agent A]');
  const toolName = flags.tool ?? (flags.command ? 'Bash' : 'Write');
  const input = flags.command !== undefined ? { command: String(flags.command) } : { file_path: flags.file };
  if (!input.command && !input.file_path) throw new UsageError('informe --command ou --file');
  const eff = effectivePolicy(loadPolicy(), loadConfig(root).config);
  const r = evaluateToolCall({ tool_name: toolName, tool_input: input, agent_type: flags.agent }, { root, eff });
  if (flags.json) console.log(JSON.stringify(r, null, 2));
  else {
    const icon = { allow: ICON.ok, ask: ICON.warn, deny: ICON.error }[r.decision];
    console.log(`${icon} ${r.decision.toUpperCase()}${r.reason ? ` — ${r.reason}` : ' — nenhuma regra da política se aplica (valem as permissões normais)'}`);
  }
  return 0;
}

// Domínios de registries/forjas comuns: instalação de dependências funciona dentro do sandbox.
export const DEFAULT_SANDBOX_DOMAINS = [
  'registry.npmjs.org', 'registry.yarnpkg.com', 'pypi.org', 'files.pythonhosted.org',
  'proxy.golang.org', 'sum.golang.org', 'crates.io', 'static.crates.io', 'index.crates.io',
  'rubygems.org', 'repo.maven.apache.org', 'api.nuget.org',
  'github.com', 'api.github.com', 'codeload.github.com', 'objects.githubusercontent.com',
];

export function sandboxBlock(config) {
  const extra = config?.security?.network?.allowed_domains ?? [];
  return {
    enabled: true,
    autoAllowBashIfSandboxed: false,
    network: {
      allowedDomains: [...new Set([...DEFAULT_SANDBOX_DOMAINS, ...extra])],
      allowLocalBinding: true,
    },
  };
}

export async function securityCommand({ positional, flags, root }) {
  if (positional[0] !== 'sandbox') throw new UsageError('uso: security sandbox [--show|--enable] [--force]');
  const file = join(root, '.claude', 'settings.json');
  const settings = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const block = sandboxBlock(loadConfig(root).config);
  if (!flags.enable) {
    console.log(JSON.stringify({ current: settings.sandbox ?? null, proposed: block }, null, 2));
    return 0;
  }
  if (process.platform === 'win32' && !flags.force) {
    console.log(`${ICON.warn} o sandbox do Claude Code não roda no Windows nativo (só macOS, Linux e WSL2). Use o Claude Code dentro do WSL2, ou --force para gravar mesmo assim (ele será ignorado aqui).`);
    return 1;
  }
  if (existsSync(file)) {
    mkdirSync(join(root, '.sdd', 'backup'), { recursive: true });
    copyFileSync(file, join(root, '.sdd', 'backup', `settings.${timestampSlug()}.json`));
  } else mkdirSync(join(root, '.claude'), { recursive: true });
  settings.sandbox = block;
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  console.log(`${ICON.ok} sandbox habilitado em .claude/settings.json (${block.network.allowedDomains.length} domínios liberados; backup em .sdd/backup/)`);
  return 0;
}
