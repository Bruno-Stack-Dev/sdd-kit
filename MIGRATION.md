# Migração de um projeto: SDD Kit v2 → v3

Guia para quem já usa o kit v2 num projeto. O plano interno de evolução do kit está em
[`docs/migration/v2-to-v3-plan.md`](docs/migration/v2-to-v3-plan.md).

**Resumo:** nada quebra de uma vez. O v3 lê o `sdd.config.md` e o LEDGER do v2; você migra quando
quiser, com backup, e o `sdd doctor` diz o que falta. Os comandos `/sdd-init`, `/gerar-projeto`,
`/nova-spec`, `/implementar-spec`, `/implementar-tarefa`, `/sdd-status`, `/gerar-skills` e
`/validar-e2e` mantêm os mesmos nomes.

## O que muda

| Assunto | v2 | v3 |
|---------|----|----|
| Config | `sdd.config.md` (escrito à mão) | `sdd.config.yaml` canônico + schema; o `.md` vira visão gerada |
| Estado | `LEDGER-<slug>.md` à mão | `.sdd/events.jsonl` (append-only, versionado); `state.json` e LEDGER gerados |
| IDs de spec | o modelo varria `specs/` | `sdd spec new` calcula pela `numbering` da config |
| Tarefas | checkbox | grafo com IDs globais `<spec>/T-NNN`, dependências validadas |
| Fechar spec | prosa do guardião | só com evento `GUARDIAN_APPROVED` com evidência |
| Guardrails | allowlist no `settings.json` | política + hooks determinísticos (segredos, estado, git destrutivo) + sandbox opcional |
| Comandos | `.claude/commands/*.md` | Agent Skills em `.claude/skills/`; os comandos viram aliases (remoção prevista na 4.0.0) |
| Packs | cópia manual | `sdd pack activate` conferindo hash e licença, ou plugin do marketplace |
| Instalação | copiar pastas | plugin do Claude Code **ou** modo cópia (`sdd init --mode copy`), com `sdd upgrade` |

Novidades opcionais (não exigem nada para migrar): MCP por perfis e allowlist, evals, trace local,
auditoria brownfield OBSERVED/INTENDED/RUNTIME, pack `ai`, adapters para outros clientes e
`sdd export-context`.

## Pré-requisitos

- Node.js 20+ (`node --version`).
- Git com a árvore limpa ou com um commit antes de começar (tudo abaixo cria backup, mas o commit é
  o seu ponto de retorno).

## Passo a passo

Os comandos usam `sdd` = `node scripts/sdd.mjs` (modo cópia). No modo plugin, use o caminho que o
`SessionStart` mostra ("CLI determinística: ...").

### 1. Atualizar o motor

- **Continuar em modo cópia:** copie o kit v3 por cima **só das pastas do motor** ou, se o projeto já
  tem `scripts/sdd.mjs` v3, rode:

  ```bash
  node scripts/sdd.mjs upgrade --dry-run
  node scripts/sdd.mjs upgrade
  ```

  O upgrade só toca arquivos do motor, faz backup em `.sdd/backup/` e preserva seus arquivos
  (config, specs, skills geradas, `CLAUDE.md` fora do bloco do kit).
- **Passar para plugin:** instale o plugin `sdd-kit` pelo marketplace e rode
  `sdd init --mode plugin` no projeto. As pastas do motor copiadas no v2 podem ser removidas depois
  de validar — faça isso num commit separado.

### 2. Migrar a config

```bash
node scripts/sdd.mjs config migrate          # sdd.config.md → sdd.config.yaml (backup do .md)
node scripts/sdd.mjs config validate
node scripts/sdd.mjs config render           # regenera sdd.config.md como visão (AUTO-GENERATED)
```

Revise o YAML: seções livres do v2 que o migrador não reconhece ficam preservadas em `legacy`.
Daqui em diante, edite só o `sdd.config.yaml`.

### 3. Importar o estado

```bash
node scripts/sdd.mjs state import-ledger specs/LEDGER-<slug>.md
node scripts/sdd.mjs tasks sync --dry-run
node scripts/sdd.mjs tasks sync
node scripts/sdd.mjs state verify
```

Specs importadas ficam marcadas como vindas do v2. Specs que o LEDGER dizia "implementadas" sem
evidência de guardião aparecem no doctor como aviso — reabra com o `@agente-spec-guardian` se
precisar da garantia do v3.

### 4. Settings, hooks e packs

- O `sdd init`/`upgrade` mescla o `.claude/settings.json`: acrescenta hooks e `deny` do kit, mantém
  suas entradas. Revise o diff; nunca remova `deny` nem hooks.
- Packs copiados à mão no v2: rode `sdd pack activate <pack>` para registrar a ativação contra o
  `skills.lock.json` (cópias alteradas localmente são apontadas, não sobrescritas sem `--force`).

### 5. Validar

```bash
node scripts/sdd.mjs doctor --full
```

`READY` ou `READY_WITH_WARNINGS` com avisos entendidos = migrado. `NOT_READY` lista o que corrigir.
Integrações ausentes aparecem como `NOT_RUN` — não bloqueiam.

## Voltar atrás

- Config: o `sdd.config.md` original fica no backup indicado pelo `config migrate`.
- Motor: `.sdd/backup/<data>/` guarda o que o `upgrade` substituiu.
- Estado: o LEDGER v2 não é apagado; `events.jsonl` é um arquivo novo.
- Ou simplesmente volte ao commit anterior à migração.

## Perguntas frequentes

- **Preciso migrar tudo de uma vez?** Não. O v3 lê o `.md` legado (com aviso do doctor) até você
  rodar `config migrate`.
- **O kit passa a instalar dependências?** Não. O core continua sem dependências; ferramentas
  externas (Promptfoo, scanners, Repomix, ContextForge) são opcionais e pedem consentimento.
- **Uso outro cliente além do Claude Code.** Veja [`docs/adapters/README.md`](docs/adapters/README.md).
