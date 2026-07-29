---
description: Implementa uma spec de ponta a ponta, nas camadas declaradas na config.
argument-hint: <PREFIXO>NNN
---

# /implementar-spec <PREFIXO>NNN

Implementa **uma spec inteira** de ponta a ponta (Passos 5–6 do `specs/_gerador/GERADOR.md`).

Localize a spec `$ARGUMENTS` em `specs/` pelo seu `spec-id`. Se `$ARGUMENTS` estiver vazio,
**peça o identificador da spec** (ex.: `FEAT-012`) antes de continuar — não adivinhe.

Execute as **camadas de implementação declaradas em `sdd.config.md` (seção 5)**, na ordem,
cada uma pelo agente de lá, **até o verde antes de avançar**. O padrão do kit é:

1. **Contratos** — `@agente-arquiteto-contratos`: tipos no path da config; literais p/ gates;
   `Patch` omitindo imutáveis.
2. **Mocks** — `@agente-mock-data`: ≥5 itens cobrindo todos os estados; sem relógio real.
3. **Estado/store** — `@agente-frontend`: gate na store; escopo em todo getter/escrita; estados
   terminais; **invariantes** (provar ausência do caminho proibido).
4. **UI + rotas + menu** — `@agente-frontend`: telas + rota + **entrada no menu** (config seção 3,
   se houver navegação). Rota sem menu é bug.
5. **Testes** — `@agente-qa-testes`: um teste por CA + invariante por regra crítica.
6. **E2E** — `@agente-e2e`: fluxo navegável real (se houver UI).
7. **Guardião** — `@agente-spec-guardian`: cada CA testado + greps de ausência (config seção 7) = 0.

Validação: comandos de teste da config (seção 2) + `node scripts/sdd-lint.mjs`. Tudo verde →
`status: implementada`, tarefas `[x]`, atualize o `LEDGER-*.md`.
