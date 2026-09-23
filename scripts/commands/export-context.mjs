// `sdd export-context [--dry-run] [--out FILE] [--format markdown|xml] [--include g1,g2] [--exclude g1,g2]
//                     [--max-kb N] [--include-lockfiles] [--redact] [--json]`
// `sdd export-context --repomix --consent [--out FILE]`  (opcional; baixa e executa repomix via npx)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { UsageError, ICON, timestampSlug } from '../lib/cli.mjs';
import { selectFiles, summarize, renderContext, writeContext, repomixArgs, REPOMIX, DEFAULT_MAX_BYTES } from '../lib/export-context.mjs';
import { scanText } from '../lib/secrets.mjs';
import { findOnPath, toPosix } from '../lib/files.mjs';
import { loadConfig } from '../lib/config.mjs';

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export async function exportContextCommand({ flags, root }) {
  const format = flags.format ?? 'markdown';
  if (!['markdown', 'xml'].includes(format)) throw new UsageError('--format markdown | xml');
  const ext = format === 'xml' ? 'xml' : 'md';
  const out = flags.out ? resolve(root, String(flags.out)) : join(root, '.sdd', 'context', `context-${timestampSlug()}.${ext}`);
  if (flags.repomix) return runRepomix(root, flags, out);

  const maxKb = flags.maxKb ?? flags['max-kb'];
  const sel = selectFiles(root, {
    include: list(flags.include), exclude: list(flags.exclude),
    maxBytes: maxKb ? Number(maxKb) * 1024 : DEFAULT_MAX_BYTES,
    includeLockfiles: Boolean(flags.includeLockfiles ?? flags['include-lockfiles']),
    redactSecrets: Boolean(flags.redact),
  });
  const s = summarize(sel);
  const secrets = sel.excluded.filter((e) => e.reason === 'segredo');
  if (flags.dryRun ?? flags['dry-run']) {
    if (flags.json) { console.log(JSON.stringify({ dry_run: true, summary: s, included: sel.included.map((f) => ({ path: f.path, bytes: f.bytes, redacted: Boolean(f.redactions) })), excluded: sel.excluded }, null, 2)); return 0; }
    console.log(`${ICON.info} dry-run — nada foi escrito`);
    for (const f of sel.included) console.log(`  + ${f.path} (${f.bytes} B)${f.redactions ? ` [redigido: ${f.redactions}]` : ''}`);
    for (const e of sel.excluded) console.log(`  - ${e.path} (${e.reason}${e.detail ? `: ${e.detail}` : ''})`);
    console.log(`\n${s.files} arquivo(s) · ~${s.est_tokens} tokens · ${s.excluded} excluído(s)`);
    return 0;
  }
  let name = basename(root);
  try { name = loadConfig(root).config?.project?.name ?? name; } catch { /* sem config */ }
  writeContext(root, out, renderContext(sel, { name, format }));
  if (flags.json) { console.log(JSON.stringify({ out: toPosix(out), summary: s, secrets_excluded: secrets.map((e) => ({ path: e.path, detail: e.detail })) }, null, 2)); return 0; }
  console.log(`${ICON.ok} contexto em ${toPosix(out)}: ${s.files} arquivo(s), ~${s.est_tokens} tokens, ${s.excluded} excluído(s)`);
  for (const e of secrets) console.log(`${ICON.warn} ${e.path}: possível segredo (${e.detail}) — arquivo excluído${flags.redact ? '' : ' (use --redact para incluí-lo com os trechos redigidos)'}`);
  console.log(`${ICON.info} arquivo local; revise-o antes de compartilhar. Nada foi enviado.`);
  return 0;
}

function runRepomix(root, flags, out) {
  const args = repomixArgs({ out, include: list(flags.include), style: flags.format === 'xml' ? 'xml' : 'markdown' });
  const cmd = `npx ${args.join(' ')}`;
  if (!flags.consent) {
    console.log(`${ICON.notRun} NOT_RUN — o Repomix é opcional e baixa/executa ${REPOMIX} do registro npm.`);
    console.log(`   Para rodar com consentimento: sdd export-context --repomix --consent`);
    console.log(`   Comando equivalente: ${cmd}`);
    return 0;
  }
  if (!findOnPath(process.platform === 'win32' ? 'npx.cmd' : 'npx') && !findOnPath('npx')) {
    console.log(`${ICON.notRun} NOT_RUN — npx não encontrado no PATH`);
    return 0;
  }
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 || !existsSync(out)) { console.error(`${ICON.error} Repomix falhou (status ${r.status})`); return 1; }
  // Segunda checagem com os padrões do kit: o Secretlint do Repomix é a primeira.
  const hits = scanText(readFileSync(out, 'utf8'));
  if (hits.length) {
    console.log(`${ICON.warn} o pacote do Repomix contém ${hits.length} possível(is) segredo(s) (${[...new Set(hits.map((h) => h.id))].join(', ')}) — revise ${toPosix(out)} antes de compartilhar`);
    return 1;
  }
  console.log(`${ICON.ok} Repomix gerou ${toPosix(out)}; nenhuma ocorrência dos padrões de segredo do kit. Revise antes de compartilhar.`);
  return 0;
}
