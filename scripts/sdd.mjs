#!/usr/bin/env node
/**
 * sdd — CLI determinística do SDD Kit (zero dependências).
 *
 *   node scripts/sdd.mjs <comando> [subcomando] [opções]
 *
 * Rode `node scripts/sdd.mjs help` para a lista de comandos. Toda saída legível tem uma variante
 * `--json` para CI e hooks. Códigos de saída: 0 ok · 1 falha de validação · 2 uso incorreto.
 */
import { ENGINE_VERSION } from './lib/engine.mjs';
import { parseArgs, fail, UsageError } from './lib/cli.mjs';
import { configCommand } from './commands/config.mjs';
import { eventCommand, stateCommand } from './commands/state.mjs';
import { tasksCommand, specCommand, templateCommand } from './commands/tasks.mjs';
import { doctorCommand, checkCommand } from './commands/doctor.mjs';
import { policyCommand, securityCommand } from './commands/security.mjs';
import { initCommand, upgradeCommand, versionCommand } from './commands/init.mjs';
import { skillsCommand, packCommand } from './commands/skills.mjs';
import { lspCommand } from './commands/lsp.mjs';
import { mcpCommand } from './commands/mcp.mjs';
import { scanCommand } from './commands/scan.mjs';
import { projectCommand } from './commands/project.mjs';
import { evalCommand } from './commands/eval.mjs';
import { traceCommand } from './commands/trace.mjs';
import { aiCommand } from './commands/ai.mjs';
import { adaptersCommand } from './commands/adapters.mjs';
import { exportContextCommand } from './commands/export-context.mjs';
import { modelsCommand } from './commands/models.mjs';

const COMMANDS = {
  config: configCommand,
  event: eventCommand,
  state: stateCommand,
  tasks: tasksCommand,
  spec: specCommand,
  template: templateCommand,
  doctor: doctorCommand,
  check: checkCommand,
  policy: policyCommand,
  security: securityCommand,
  skills: skillsCommand,
  pack: packCommand,
  lsp: lspCommand,
  mcp: mcpCommand,
  scan: scanCommand,
  project: projectCommand,
  eval: evalCommand,
  trace: traceCommand,
  ai: aiCommand,
  adapters: adaptersCommand,
  'export-context': exportContextCommand,
  models: modelsCommand,
  init: initCommand,
  upgrade: upgradeCommand,
  version: versionCommand,
};

const HELP = `sdd-kit ${ENGINE_VERSION} — CLI determinística do SDD Kit

Uso: node scripts/sdd.mjs <comando> [subcomando] [opções]

Comandos:
  config validate [--json]          valida sdd.config.yaml (ou o .md legado) contra o schema
  config migrate [--force] [--keep-md]  sdd.config.md (v2) → sdd.config.yaml (v3)
  config render [--check]           gera a visão sdd.config.md a partir do YAML
  config show [--json]              imprime a config normalizada
  event <TIPO> [--spec S] [--task T] [--agent A] [--model M] [--effort E] [--reason R] [--evidence E] [--key K]
                                    registra um evento validado em .sdd/events.jsonl
  state show|resume|rebuild|verify|repair   estado derivado do log; retomada de sessão
  state ledger [--check]            gera o LEDGER-<slug>.md a partir do estado
  state import-ledger <arquivo>     importa um LEDGER v2 escrito à mão
  tasks list|ready|show <id>|graph  grafo de tarefas (DAG) validado
  tasks sync [--dry-run]            registra specs/tarefas no estado e reescreve checkboxes
  models list [--profile p]         modelo e esforço de cada agente e etapa, pelo papel (policies/model-routing.json)
  models resolve --task T | --agent A [--pipeline p --step s] [--profile p]
                                    modelo de uma tarefa/agente, com a fonte e os sinais que pesaram
  spec next-id [--new-block]        próximo ID de spec pela config (numbering)
  spec new --slug s --title t [--pipeline p] [--new-block] [--depends A,B]
                                    cria spec + plano + tarefas (uma por etapa da pipeline)
  template list | show <nome>       templates do motor (spec, plano, adr, visao, config, skill...)
  doctor [--fast|--project|--security|--skills|--mcp|--full] [--json] [--strict] [--verbose]
                                    saúde do projeto; exit 1 se NOT_READY (pronto para CI)
  check forbidden [--json]          roda os padrões proibidos da config (grep de ausência)
  policy check --command "<cmd>" | --file <p> [--tool T] [--agent A]
                                    explica a decisão da política (deny/ask/allow)
  security sandbox [--show|--enable] mostra/habilita o sandbox do Claude Code no settings.json
  skills verify | info <nome> | scan [dir] [--external] | lock --update
  skills add <dir> --source <url> --license <SPDX> [--ref r] | review <nome> --trust <t>
                                    proveniência, integridade e ingestão de skills
  pack list | activate <pack> | deactivate <pack>   packs opcionais (verificados contra o lock)
  lsp detect [--json]               linguagens, language servers e plugins LSP recomendados
  mcp profiles | apply <perfil> | check | pin <servidor> [--consent|--from-file f]
                                    MCP só da allowlist, drift e pin de schema das ferramentas
  scan agents --consent --run-mcp-servers [--target p]
                                    Snyk Agent Scan opcional (NOT_RUN sem as duas confirmações/token)
  project classify [--json]         projeto novo × existente, com evidência
  ai detect [--json]                o produto usa IA? sinais e artefatos AI-* sugeridos (pack ai)
  adapters build <codex|opencode|cline|generic> [--install] [--packs a,b]
                                    exporta skills (Agent Skills puro) + AGENTS.md para outros clientes
  adapters status [--json]          adapters instalados e se estão em dia com as skills
  export-context [--dry-run] [--out F] [--format markdown|xml] [--include g] [--exclude g] [--redact]
                                    pacote local e sanitizado do código (sem segredos; respeita .gitignore)
  export-context --repomix --consent  alternativa opcional via Repomix (baixa do npm; Secretlint ligado)
  eval run [--suite deterministic|model] [--update-baseline]   evals (fixtures; modelo opcional)
  trace show [--session|--spec|--task|--agent|--trace]   linha do tempo (trace local + eventos)
  trace export --otlp <url>         exporta para um backend OTLP (ex.: Phoenix), fail-open
  eval export-promptfoo             gera os testes do Promptfoo a partir das evals das skills/agentes
  init [--mode plugin|copy] [--force]  instala o kit no projeto (plugin: só estado do projeto)
  upgrade [--dry-run]               atualiza o motor copiado (modo cópia), com backup
  version [--json]                  versões do motor, schemas e do projeto

Opções globais: --root <dir> (padrão: diretório atual), --json`;

async function main(argv) {
  const args = parseArgs(argv);
  const [cmd] = args.positional;
  if (!cmd || cmd === 'help' || args.flags.help) {
    console.log(HELP);
    return cmd || args.flags.help ? 0 : 2;
  }
  const handler = COMMANDS[cmd];
  if (!handler) throw new UsageError(`comando desconhecido '${cmd}' — rode 'help'`);
  args.positional.shift();
  return handler(args);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((e) => fail(e));
