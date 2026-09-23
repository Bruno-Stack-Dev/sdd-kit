// Checagens de segurança: permissões, hooks críticos, sandbox, arquivos sensíveis versionados e
// segredos no conteúdo versionado.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gitTrackedFiles, walkFiles, isBinary, relPosix } from '../files.mjs';
import { scanText, isSensitivePath } from '../secrets.mjs';
import { ENGINE_ROOT, ENGINE_VERSION } from '../engine.mjs';
import { readEngineInfo, compareVersions } from '../install.mjs';

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

export function loadSettings(root) {
  const file = join(root, '.claude', 'settings.json');
  if (!existsSync(file)) return { file, exists: false, settings: null };
  const settings = readJson(file);
  return { file, exists: true, settings: settings ?? null, invalid: settings === undefined };
}

const REQUIRED_DENY = [
  { label: 'git push', re: /^Bash\(git push/ },
  { label: 'git reset --hard', re: /^Bash\(git reset --hard/ },
];
const SECRET_DENY = /^(Read|Edit|Write)\((\.\/|\*\*\/)?\.env/;

export function checkPermissions(report, p) {
  const G = 'Segurança';
  const s = loadSettings(p.root);
  if (!s.exists) { report.warn(G, 'settings.present', '.claude/settings.json ausente (modo plugin? permissões ficam a cargo do usuário)'); return; }
  if (s.invalid) { report.fail(G, 'settings.present', '.claude/settings.json não é JSON válido'); return; }
  const deny = s.settings?.permissions?.deny ?? [];
  const allow = s.settings?.permissions?.allow ?? [];
  const missing = REQUIRED_DENY.filter((r) => !deny.some((d) => r.re.test(d))).map((r) => r.label);
  report.fromIssues(G, 'settings.destructive-deny', 'permissões negam operações git destrutivas', missing.map((m) => `falta deny para ${m}`));
  report.add(G, 'settings.secret-deny', deny.some((d) => SECRET_DENY.test(d)) ? 'pass' : 'fail',
    deny.some((d) => SECRET_DENY.test(d)) ? 'permissões negam leitura/escrita de .env' : 'nenhuma regra nega Read/Edit de .env — segredos legíveis pelo agente');
  if (allow.includes('Bash(npx:*)') || allow.includes('Bash(pnpm:*)') || allow.includes('Bash(yarn:*)')) {
    report.warn(G, 'settings.broad-allow', 'allowlist libera npx/pnpm/yarn irrestritos (baixam e executam pacotes arbitrários)', allow.filter((a) => /^Bash\((npx|pnpm|yarn):\*\)$/.test(a)));
  }
}

export function checkHooks(report, p) {
  const G = 'Segurança';
  const s = loadSettings(p.root);
  const pluginHooks = readJson(join(ENGINE_ROOT, 'hooks', 'hooks.json'));
  const fromSettings = JSON.stringify(s.settings?.hooks ?? {});
  const hasPre = /PreToolUse/.test(fromSettings) && /sdd-hook/.test(fromSettings);
  const pluginPre = pluginHooks && /PreToolUse/.test(JSON.stringify(pluginHooks));
  if (hasPre) report.pass(G, 'hooks.pretooluse', 'hook PreToolUse do SDD instalado em .claude/settings.json');
  else if (pluginPre && !existsSync(join(p.root, 'scripts', 'hooks'))) report.pass(G, 'hooks.pretooluse', 'hooks críticos fornecidos pelo plugin sdd-kit');
  else report.fail(G, 'hooks.pretooluse', 'hook PreToolUse do SDD ausente — políticas críticas dependem só do prompt');
}

export function checkSandbox(report, p) {
  const G = 'Segurança';
  const s = loadSettings(p.root);
  const sb = s.settings?.sandbox;
  const doc = existsSync(join(ENGINE_ROOT, 'docs', 'security', 'sandbox.md'));
  if (sb?.enabled) {
    const domains = sb.network?.allowedDomains ?? [];
    report.pass(G, 'sandbox', `sandbox habilitado (${domains.length} domínio(s) liberado(s))`);
  } else {
    const onWindows = process.platform === 'win32';
    report.warn(G, 'sandbox', `sandbox do Claude Code não habilitado${onWindows ? ' (Windows nativo não suporta — use WSL2)' : ''}`,
      [doc ? 'política documentada em docs/security/sandbox.md' : 'política de sandbox não documentada']);
  }
}

/** Arquivos sensíveis versionados e segredos em arquivos versionados (ou em disco, fora do git). */
export function checkSecrets(report, p) {
  const G = 'Segurança';
  const tracked = gitTrackedFiles(p.root);
  const files = tracked ?? walkFiles(p.root).map((f) => relPosix(p.root, f));
  const sensitive = files.filter((f) => isSensitivePath(f));
  report.fromIssues(G, 'secrets.tracked-files', tracked ? 'nenhum arquivo sensível versionado (.env, chaves, credenciais)' : 'nenhum arquivo sensível no projeto', sensitive.map((f) => `${f} parece segredo ${tracked ? 'e está versionado' : ''}`.trim()));
  const errors = [];
  const warnings = [];
  for (const f of files) {
    const abs = join(p.root, f);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 1024 * 1024 || isBinary(abs)) continue;
    for (const h of scanText(readFileSync(abs, 'utf8'))) {
      (h.severity === 'error' ? errors : warnings).push(`${f}:${h.line}: possível ${h.id}`);
    }
  }
  report.fromIssues(G, 'secrets.content', `nenhum segredo aparente em ${files.length} arquivo(s)${tracked ? ' versionados' : ''}`, errors, warnings);
}

export function checkPolicyFile(report) {
  const G = 'Segurança';
  const file = join(ENGINE_ROOT, 'policies', 'sdd-policy.json');
  if (!existsSync(file)) { report.fail(G, 'policy.file', 'policies/sdd-policy.json ausente (motor sem política determinística)'); return; }
  const pol = readJson(file);
  report.add(G, 'policy.file', pol?.version === 1 && pol.paths && pol.bash ? 'pass' : 'fail', pol?.version === 1 && pol.paths && pol.bash ? `política núcleo carregada (v${pol.version}: ${Object.keys(pol.bash).length} grupos de regras de shell, ${Object.keys(pol.paths).length} de caminhos)` : 'policies/sdd-policy.json inválido ou sem versão 1');
}

/** Instalação: versão do motor × projeto e instalação dupla (cópia + plugin). */
export function checkInstall(report, p) {
  const G = 'Instalação';
  const info = readEngineInfo(p.root);
  if (!info) {
    report.warn(G, 'install.info', 'sem .sdd/engine.json — projeto instalado manualmente ou em v2 (rode `sdd init` ou `sdd upgrade`)');
  } else {
    const cmp = compareVersions(info.engine_version, ENGINE_VERSION);
    if (cmp > 0) report.warn(G, 'install.version', `projeto registrado com motor ${info.engine_version}, mais novo que o em uso (${ENGINE_VERSION}) — atualize o kit/plugin`);
    else if (cmp < 0) report.warn(G, 'install.version', `motor em uso ${ENGINE_VERSION} é mais novo que o registrado (${info.engine_version}) — ${info.mode === 'copy' ? 'rode `sdd upgrade`' : 'rode `sdd init --mode plugin` para atualizar o registro'}`);
    else report.pass(G, 'install.version', `modo ${info.mode}, motor ${ENGINE_VERSION}`);
  }
  const s = loadSettings(p.root);
  const localHooks = JSON.stringify(s.settings?.hooks ?? {}).includes('sdd-hook.mjs');
  const pluginOn = Object.entries(s.settings?.enabledPlugins ?? {}).some(([k, v]) => k.startsWith('sdd-kit@') && v);
  if (localHooks && pluginOn) report.warn(G, 'install.duplicate', 'hooks do SDD no settings.json do projeto E plugin sdd-kit habilitado: os hooks rodam em dobro — escolha um modo (`sdd init --mode plugin` remove os locais)');
  else report.pass(G, 'install.duplicate', 'sem instalação dupla de hooks');
}
