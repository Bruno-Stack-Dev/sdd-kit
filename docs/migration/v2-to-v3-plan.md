# Migration Plan — SDD Kit v2 → v3

> Plano de migração incremental (Fase 0). Baseline em
> [`../architecture/v2-baseline.md`](../architecture/v2-baseline.md). O guia para **usuários** que
> migram um projeto está em [`../../MIGRATION.md`](../../MIGRATION.md).

## Objetivo

Transformar o kit num **control plane** em que o que precisa acontecer sempre é código
determinístico (CLI, schemas, hooks, lockfiles) e o que exige julgamento continua em skills e
agentes. Sem reescrita big-bang: cada fase entrega algo utilizável e testado.

## Invariantes da migração (valem em todas as fases)

1. **Zero dependência de runtime no core.** Node ≥ 20 stdlib. O kit continua funcionando copiado,
   sem `npm install`.
2. **Projetos v2 continuam funcionando.** `sdd.config.md` legado é lido; `/sdd-init`,
   `/gerar-projeto`, `/nova-spec`, `/implementar-spec`, `/implementar-tarefa`, `/sdd-status`,
   `/gerar-skills`, `/validar-e2e` continuam existindo com o mesmo nome.
3. **Uma autoridade por dado.** Quando um formato novo vira canônico, o antigo passa a ser gerado
   (com cabeçalho `AUTO-GENERATED`) ou migrado — nunca mantido em paralelo à mão.
4. **Integrações externas degradam.** Sem a ferramenta, o check vira `NOT_RUN`, nunca `PASS`.
5. **Nada irreversível sem humano.** Nenhum script faz push, deploy, ou apaga dados do usuário.

## Mapa de autoridade (antes → depois)

| Dado | v2 (autoridade) | v3 (autoridade) | Visão derivada |
|------|-----------------|-----------------|----------------|
| Config do projeto | `sdd.config.md` | `sdd.config.yaml` (+ schema) | `sdd.config.md` gerado |
| Estado do pipeline | `LEDGER-<slug>.md` | `.sdd/events.jsonl` | `.sdd/state.json`, `LEDGER-<slug>.md` gerados |
| Status de tarefa | checkbox em `specs/tasks/` | eventos `TASK_*` | checkbox reconciliado por `sdd tasks sync` |
| Definição de tarefa | linha Markdown | linha Markdown (id/agente/deps) | grafo validado pelo doctor |
| ID de spec | LLM varre `specs/**` | `sdd spec new` (determinístico) | — |
| Padrões proibidos | grep manual do guardian | `sdd check forbidden` | relatório do guardian cita a saída |
| Gate "guardian aprovou" | prosa | evento `GUARDIAN_APPROVED` + doctor | frontmatter `implementada` validado |
| Políticas de segurança | prosa + allowlist | `policies/sdd-policy.json` + hooks + sandbox | `settings.json` |
| Ativação de pack | cópia manual | `sdd pack activate` + `skills.lock.json` | — |
| MCP | inexistente | `mcp/` perfis + allowlist + lock | `.mcp.json` gerado |

## Fases

| Fase | Entrega | Compatibilidade |
|------|---------|-----------------|
| 0 | baseline, este plano, testes de caracterização, testes movidos para `tests/` | nenhuma mudança de comportamento |
| 1 | `sdd.config.yaml` + schema + parser YAML de subconjunto + migrador `md → yaml` + render `yaml → md` | `.md` legado lido; doctor avisa |
| 2 | `.sdd/events.jsonl` + reducer + `state.json` + `LEDGER` derivado + grafo de tarefas | `LEDGER` antigo importável por `sdd state import-ledger` |
| 3 | `sdd doctor` (fast/project/security/skills/mcp/full, `--json`) | `sdd-lint.mjs` continua como fast path, mesma saída |
| 4 | policy engine + hooks (`PreToolUse`, `PostToolUse`, `SessionStart`, `SubagentStop`, `Stop`) + sandbox | allowlist mais estreita (pode gerar prompts, nunca quebra) |
| 5 | plugin (`.claude-plugin/`) + marketplace; `sdd init` para projeto consumidor | modo cópia continua suportado |
| 6 | comandos → Agent Skills; motores viram `references/` | mesmos `/nomes`; stubs nos caminhos antigos |
| 7 | `skills.lock.json`, `THIRD_PARTY.md`, pipeline de ingestão, scanner estático | atribuições preservadas |
| 8 | agentes com `tools`/`disallowedTools`, contratos de saída e falha | auditores perdem Edit/Write (intencional) |
| 9 | detecção de linguagens/LSP, recomendação de plugin de code intelligence | opcional |
| 10–11 | perfis MCP, allowlist, lock, checagem de drift; wrappers de scanners com consentimento | opcional |
| 12 | fixtures, evals determinísticas, Promptfoo opcional, baseline | CI não gasta tokens |
| 13 | trace local JSONL, redação de segredos, export OTLP opcional (Phoenix) | fail-open |
| 14 | auditoria OBSERVED/INTENDED/RUNTIME + classificação de drift | template antigo continua válido |
| 15 | pipelines guiados pela config; templates iteram o pipeline | seções 5/5-B/5-C migradas |
| 16–17 | packs como plugins; pack `ai` | packs continuam ativáveis por cópia |
| 18–20 | adapters, export de contexto, perfil enterprise | opcionais |
| 21–22 | CI completo, docs de release, versão 3.0.0 | — |

## Comandos de migração para um projeto v2

```bash
node scripts/sdd.mjs config migrate        # sdd.config.md → sdd.config.yaml (não apaga o .md)
node scripts/sdd.mjs state import-ledger   # LEDGER-*.md → .sdd/events.jsonl
node scripts/sdd.mjs doctor --full         # valida tudo
```

## Critérios para remover a camada de compatibilidade

Os wrappers em `.claude/commands/` e o suporte de leitura a `sdd.config.md` legado permanecem por
toda a linha **3.x**. A remoção só pode acontecer numa **4.0.0**, anunciada no `CHANGELOG.md` com
pelo menos uma minor de antecedência.
