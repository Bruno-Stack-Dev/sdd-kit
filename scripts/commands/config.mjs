// `sdd config <validate|migrate|render|show>`
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError, ICON, printIssues, today, timestampSlug } from '../lib/cli.mjs';
import { loadConfig, validateConfig, normalizeConfig, normalizeEol, CONFIG_YAML, CONFIG_MD } from '../lib/config.mjs';
import { parseLegacyConfigMd, renderConfigMd, GENERATED_MARKER } from '../lib/config-md.mjs';
import { parseYaml, stringifyYaml } from '../lib/yaml.mjs';

export async function configCommand(args) {
  const [sub] = args.positional;
  switch (sub) {
    case 'validate': return validateCmd(args);
    case 'migrate': return migrateCmd(args);
    case 'render': return renderCmd(args);
    case 'show': return showCmd(args);
    default: throw new UsageError(`uso: config <validate|migrate|render|show> (recebido: ${sub ?? 'nada'})`);
  }
}

function validateCmd({ root, flags }) {
  const r = loadConfig(root);
  if (flags.json) {
    console.log(JSON.stringify({ source: r.source, valid: r.source !== 'none' && !r.errors.length, errors: r.errors, warnings: r.warnings }, null, 2));
  } else if (r.source === 'none') {
    console.log(`${ICON.error} nenhuma config encontrada (${CONFIG_YAML} ou ${CONFIG_MD}) — rode /sdd-init ou \`config migrate\``);
  } else {
    printIssues(r.errors, ICON.error);
    printIssues(r.warnings, ICON.warn);
    const origem = r.source === 'yaml' ? CONFIG_YAML : `${CONFIG_MD} (legado)`;
    console.log(`\nconfig (${origem}): ${r.errors.length ? 'INVÁLIDA' : 'válida'} · ${r.errors.length} erro(s) · ${r.warnings.length} aviso(s)`);
  }
  return r.source === 'none' || r.errors.length ? 1 : 0;
}

function backup(root, file) {
  const dir = join(root, '.sdd', 'backup');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${file.replace(/\.md$/, '')}.${timestampSlug()}.md`);
  copyFileSync(join(root, file), dest);
  return dest;
}

const YAML_HEADER = (origin) => [
  'Configuração canônica do projeto para o SDD Kit v3.',
  'Validada por schemas/sdd-config.schema.json (node scripts/sdd.mjs config validate).',
  `A visão ${CONFIG_MD} é gerada a partir deste arquivo (node scripts/sdd.mjs config render).`,
  ...(origin ? [origin] : []),
].join('\n');

export function writeConfigYaml(root, cfg, origin) {
  writeFileSync(join(root, CONFIG_YAML), stringifyYaml(cfg, { header: YAML_HEADER(origin) }));
}

function migrateCmd({ root, flags }) {
  const from = flags.from ?? CONFIG_MD;
  const src = join(root, from);
  if (!existsSync(src)) throw new UsageError(`não há ${from} para migrar`);
  if (existsSync(join(root, CONFIG_YAML)) && !flags.force) {
    throw new UsageError(`${CONFIG_YAML} já existe — use --force para sobrescrever`);
  }
  const md = readFileSync(src, 'utf8');
  if (md.includes(GENERATED_MARKER) && !flags.force) {
    throw new UsageError(`${from} é uma visão gerada, não uma config legada — edite o ${CONFIG_YAML}`);
  }
  const cfg = normalizeConfig(parseLegacyConfigMd(md));
  writeConfigYaml(root, cfg, `Migrado de ${from} em ${today()}.`);
  let backedUp = null;
  if (!flags.keepMd && from === CONFIG_MD) {
    backedUp = backup(root, CONFIG_MD);
    writeFileSync(join(root, CONFIG_MD), renderConfigMd(cfg));
  }
  const v = validateConfig(cfg, { root });
  if (flags.json) {
    console.log(JSON.stringify({ written: CONFIG_YAML, backup: backedUp, errors: v.errors, warnings: v.warnings }, null, 2));
  } else {
    console.log(`${ICON.ok} ${CONFIG_YAML} gerado a partir de ${from}`);
    if (backedUp) console.log(`${ICON.info} original preservado em ${backedUp.slice(root.length + 1)}; ${CONFIG_MD} agora é visão gerada`);
    printIssues(v.errors, ICON.error);
    printIssues(v.warnings, ICON.warn);
    if (v.errors.length) console.log(`\n${v.errors.length} problema(s) a corrigir no ${CONFIG_YAML} antes de usar o motor.`);
  }
  return v.errors.length ? 1 : 0;
}

function renderCmd({ root, flags }) {
  const from = flags.from ?? CONFIG_YAML;
  const to = flags.to ?? CONFIG_MD;
  const src = join(root, from);
  if (!existsSync(src)) throw new UsageError(`não há ${from} para renderizar`);
  const cfg = parseYaml(readFileSync(src, 'utf8'));
  const md = renderConfigMd(cfg, { source: from });
  const dest = join(root, to);
  const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  const upToDate = current !== null && normalizeEol(current) === normalizeEol(md);
  if (flags.check) {
    if (!upToDate) console.log(`${ICON.error} ${to} está desatualizado em relação a ${from} — rode \`config render\``);
    else if (!flags.json) console.log(`${ICON.ok} ${to} em dia com ${from}`);
    return upToDate ? 0 : 1;
  }
  if (upToDate) {
    console.log(`${ICON.ok} ${to} já está em dia`);
    return 0;
  }
  if (current !== null && !current.includes(GENERATED_MARKER)) {
    const b = backup(root, to);
    console.log(`${ICON.info} ${to} escrito à mão preservado em ${b.slice(root.length + 1)}`);
  }
  writeFileSync(dest, md);
  console.log(`${ICON.ok} ${to} gerado a partir de ${from}`);
  return 0;
}

function showCmd({ root, flags }) {
  const r = loadConfig(root);
  if (!r.config) {
    printIssues(r.errors, ICON.error);
    return 1;
  }
  const cfg = normalizeConfig(r.config);
  if (flags.json) console.log(JSON.stringify(cfg, null, 2));
  else process.stdout.write(stringifyYaml(cfg));
  return 0;
}
