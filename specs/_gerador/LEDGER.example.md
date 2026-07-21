---
ledger-de: <slug-do-projeto>
gerado-em: AAAA-MM-DD
tags: [ledger, retomada]
---

# LEDGER — <Nome do projeto>

> Manifesto de execução e **arquivo de retomada** do pipeline. O motor (`GERADOR.md`) cria um
> `LEDGER-<slug>.md` por projeto a partir deste modelo. Se o pipeline for interrompido, ele
> continua da primeira spec `pendente`. Specs `feita` não são refeitas.

## Ordem de execução (por dependência)

| # | Spec | Slug | Depende de | Estado |
|---|------|------|-----------|--------|
| 1 | `<PREFIXO>NNN` | <slug> | — | pendente |
| 2 | `<PREFIXO>NNN` | <slug> | #1 | pendente |
| 3 | `<PREFIXO>NNN` | <slug> | #1 | pendente |

> Estados possíveis: `pendente` · `em-andamento` · `feita`.

## Decisões assumidas (defaults da config aplicados)

- <campo opcional> → <default adotado> (motivo: ausente no brief)

## Log de execução

| Data | Spec | Evento | Testes |
|------|------|--------|--------|
| AAAA-MM-DD | `<PREFIXO>NNN` | implementada e verde | N passando |
