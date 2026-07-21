---
tarefas-de: <PREFIXO>NNN
plano-relacionado: <PREFIXO>NNN
status: rascunho
atualizado-em: AAAA-MM-DD
tags: [tarefas]
---

# Tarefas — <Título>

## Convenções
- ID: `T-XXX`. Estados: `[ ]` backlog · `[~]` em progresso · `[!]` bloqueada · `[x]` concluída · `[-]` cancelada.
- Cada tarefa é atribuída a um `@agente-*` (ver `.claude/README.md`) e corresponde a uma
  **camada de implementação** do `sdd.config.md` (seção 5).

## Fase 1 — Contratos
- [ ] [T-001] Tipos/contratos da entidade (@agente-arquiteto-contratos)

## Fase 2 — Mocks
- [ ] [T-002] Dados mockados ≥5 itens, todos os estados (@agente-mock-data) 🔒 T-001

## Fase 3 — Estado/store
- [ ] [T-003] Store + getters + actions + invariantes (@agente-frontend) 🔒 T-002

## Fase 4 — UI + rotas + menu
- [ ] [T-004] Views + rota + entrada no menu (@agente-frontend) 🔒 T-003

## Fase 5 — Testes
- [ ] [T-005] Testes unit/componente: 1 por CA + invariantes (@agente-qa-testes) 🔒 T-004
- [ ] [T-006] Testes e2e do caminho feliz (@agente-e2e) 🔒 T-004

## Fase 6 — Guardião
- [ ] [T-007] Validação spec-guardian + greps de ausência (@agente-spec-guardian) 🔒 T-005, T-006

## Definition of Done (padrão)
- [ ] Cada CA da spec tem teste · [ ] Suíte verde · [ ] Greps de ausência = 0
- [ ] Spec atualizada se houve divergência · [ ] LEDGER atualizado
