---
ledger-de: <slug-do-projeto>
gerado-em: AAAA-MM-DD
tags: [ledger, retomada]
---

# LEDGER — <Nome do projeto>

> **Formato v2 (legado).** Na v3 o LEDGER é **gerado** a partir de `.sdd/events.jsonl` por
> `node scripts/sdd.mjs state ledger` e não deve ser editado à mão; a retomada usa
> `node scripts/sdd.mjs state resume`. Este arquivo documenta o formato antigo, que
> `sdd state import-ledger` sabe importar.

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
