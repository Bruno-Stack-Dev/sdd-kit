# Specs — Spec-Driven Development

Esta pasta é a **fonte da verdade** do projeto. O código deriva das specs, não o contrário.
O que é específico do seu projeto (stack, paths, regras) está em **`sdd.config.md`** na raiz —
estas pastas e o motor são genéricos.

## Estrutura

- `features/` — specs de funcionalidades → `<PREFIXO>NNN-<slug>.md`
- `apis/` — contratos de API (quando houver)
- `architecture/` — specs arquiteturais e roadmaps
- `decisions/` — ADRs (decisões pontuais) → `ADR-...-<slug>.md`
- `plans/` — planos de implementação → `<PREFIXO>NNN-<slug>.md` (PLAN)
- `tasks/` — quebra em tarefas por agente → `<PREFIXO>NNN-<slug>.md` (TASKS)
- `archive/` — specs descontinuadas (mover, não deletar)
- `discovery/` — artefatos de **projeto novo** (visão, requisitos, fluxos, DER, C4, API, RBAC,
  backlog, infra), gerados pelo `/sdd-init` no fluxo de discovery
- `_entrada/` — onde se larga o brief de um projeto novo (→ `/gerar-projeto`)
- `_gerador/` — o motor (`GERADOR.md`), o discovery de projeto novo (`DISCOVERY.md`), a auditoria/engenharia reversa de projeto existente (`AUDITORIA.md`) e os manifestos de retomada (`LEDGER-*.md`)
- `_templates/` — templates de spec, plano, tarefas e ADR

## Convenção de nomes

O prefixo (`SPEC-2026-`, etc.) e o incremento são definidos em `sdd.config.md` (seção 4).
`SPEC`, `PLAN` e `TASKS` de um submódulo compartilham o mesmo número.

## Como criar uma spec

- **Projeto/módulo novo:** brief em `_entrada/` → `/gerar-projeto` (gera tudo automaticamente).
- **Spec avulsa:** `/nova-spec` (copia de `_templates/template-spec.md`).

## Disciplina de frontmatter

`scripts/sdd-lint.mjs` valida que toda spec tem frontmatter íntegro: `status`, `cas` (contagem),
`spec-id`. É o que faz `/sdd-status` e a retomada do pipeline funcionarem sem ler o corpo. Ele
também valida o `sdd.config.md` (se existir): as seções 7 (Padrões proibidos) e 8 (Gates) não
podem ficar só com placeholders — é o que impede a rede de segurança do kit de virar decorativa.
