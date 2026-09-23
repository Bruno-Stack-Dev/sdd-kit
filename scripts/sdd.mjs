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
import { tasksCommand, specCommand } from './commands/tasks.mjs';
import { doctorCommand, checkCommand } from './commands/doctor.mjs';

const COMMANDS = {
  config: configCommand,
  event: eventCommand,
  state: stateCommand,
  tasks: tasksCommand,
  spec: specCommand,
  doctor: doctorCommand,
  check: checkCommand,
  version: async (args) => {
    if (args.flags.json) console.log(JSON.stringify({ engine: ENGINE_VERSION }));
    else console.log(`sdd-kit ${ENGINE_VERSION}`);
    return 0;
  },
};

const HELP = `sdd-kit ${ENGINE_VERSION} — CLI determinística do SDD Kit

Uso: node scripts/sdd.mjs <comando> [subcomando] [opções]

Comandos:
  config validate [--json]          valida sdd.config.yaml (ou o .md legado) contra o schema
  config migrate [--force] [--keep-md]  sdd.config.md (v2) → sdd.config.yaml (v3)
  config render [--check]           gera a visão sdd.config.md a partir do YAML
  config show [--json]              imprime a config normalizada
  event <TIPO> [--spec S] [--task T] [--agent A] [--reason R] [--evidence E] [--key K]
                                    registra um evento validado em .sdd/events.jsonl
  state show|resume|rebuild|verify|repair   estado derivado do log; retomada de sessão
  state ledger [--check]            gera o LEDGER-<slug>.md a partir do estado
  state import-ledger <arquivo>     importa um LEDGER v2 escrito à mão
  tasks list|ready|show <id>|graph  grafo de tarefas (DAG) validado
  tasks sync [--dry-run]            registra specs/tarefas no estado e reescreve checkboxes
  spec next-id [--new-block]        próximo ID de spec pela config (numbering)
  doctor [--fast|--project|--security|--skills|--mcp|--full] [--json] [--strict] [--verbose]
                                    saúde do projeto; exit 1 se NOT_READY (pronto para CI)
  check forbidden [--json]          roda os padrões proibidos da config (grep de ausência)
  version [--json]                  versão do motor

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
